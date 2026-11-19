// SOLMAR HEAT — cars: civilian traffic, parked cars, player driving physics,
// and car-vs-car / car-vs-building collisions.
import { clamp, dist, angNorm, angLerp, pick, mulberry32, TUNE } from './config.js';
import { ROADS_V, ROADS_H, ROAD_W, WORLD, resolveBuildings, onBeach } from './city.js';
import { AudioSys } from './audio.js';

export const CIV_COLORS = ['#c94f42', '#4a7fb5', '#d9a441', '#7ba05b', '#8e6bb5', '#c9c9c9', '#3f3f3f', '#b5651d', '#5fb5a8', '#d9577e'];
export const POLICE_COLOR = '#20242e';

let nextId = 1;

export function makeCar(x, y, angle, color, kind, driver) {
  return {
    id: nextId++,
    x, y, angle, speed: 0,
    color, kind, driver, // kind: 'civ' | 'police' | 'parked'; driver: 'none' | 'civ' | 'player' | 'police'
    w: 46, h: 22,
    cruise: TUNE.civCruiseMin + Math.random() * (TUNE.civCruiseMax - TUNE.civCruiseMin),
    axis: 'v', road: 0, dir: 1, turnCd: 0,
    stuck: 0, honkCd: 0, sirenPhase: Math.random() * Math.PI * 2,
  };
}

function laneOffset(axis, dir) {
  // Right-hand traffic.
  if (axis === 'v') return dir > 0 ? -24 : 24;
  return dir > 0 ? 24 : -24;
}
function headingFor(axis, dir) {
  if (axis === 'v') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

export function spawnTraffic(rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const axis = rng() < 0.5 ? 'v' : 'h';
    let car;
    if (axis === 'v') {
      const road = Math.floor(rng() * ROADS_V.length);
      const dir = rng() < 0.5 ? 1 : -1;
      const x = ROADS_V[road] + laneOffset('v', dir);
      const y = 120 + rng() * (WORLD.h - 240);
      car = makeCar(x, y, headingFor('v', dir), pick(rng, CIV_COLORS), 'civ', 'civ');
      car.axis = 'v'; car.road = road; car.dir = dir;
    } else {
      const road = Math.floor(rng() * ROADS_H.length);
      const dir = rng() < 0.5 ? 1 : -1;
      const y = ROADS_H[road] + laneOffset('h', dir);
      const x = 260 + rng() * (WORLD.w - 520);
      car = makeCar(x, y, headingFor('h', dir), pick(rng, CIV_COLORS), 'civ', 'civ');
      car.axis = 'h'; car.road = road; car.dir = dir;
    }
    car.speed = car.cruise * (0.7 + rng() * 0.3);
    cars.push(car);
  }
  return cars;
}

export function spawnParked(rng, count) {
  const cars = [];
  let tries = 0;
  while (cars.length < count && tries < count * 12) {
    tries++;
    const axis = rng() < 0.5 ? 'v' : 'h';
    let x, y, angle;
    if (axis === 'v') {
      const road = Math.floor(rng() * ROADS_V.length);
      const side = rng() < 0.5 ? -1 : 1;
      x = ROADS_V[road] + side * (ROAD_W / 2 + 14);
      y = 200 + rng() * (WORLD.h - 400);
      angle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const road = Math.floor(rng() * ROADS_H.length);
      const side = rng() < 0.5 ? -1 : 1;
      y = ROADS_H[road] + side * (ROAD_W / 2 + 14);
      x = 320 + rng() * (WORLD.w - 640);
      angle = side > 0 ? 0 : Math.PI;
    }
    if (x < 230 || x > WORLD.w - 40 || y < 40 || y > WORLD.h - 40) continue;
    if (cars.some((c) => dist(c.x, c.y, x, y) < 90)) continue;
    cars.push(makeCar(x, y, angle, pick(rng, CIV_COLORS), 'parked', 'none'));
  }
  return cars;
}

// Civilian traffic: follow the road grid, stop behind the car ahead, turn at junctions.
export function updateTraffic(S, dt) {
  for (const c of S.cars) {
    if (c.kind !== 'civ' || c.driver !== 'civ') continue;
    c.turnCd = Math.max(0, c.turnCd - dt);
    const ahead = carAhead(S, c, 78);
    let target = ahead ? 0 : c.cruise;
    if (c.stuck > 0) { c.stuck -= dt; target = 0; }
    c.speed += clamp(target - c.speed, -TUNE.carBrake * dt, TUNE.carAccel * 0.6 * dt);
    const heading = headingFor(c.axis, c.dir);
    c.angle = angLerp(c.angle, heading, Math.min(1, dt * 6));
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    // Junction turn.
    if (c.turnCd <= 0) {
      if (c.axis === 'v') {
        for (let j = 0; j < ROADS_H.length; j++) {
          if (Math.abs(c.y - ROADS_H[j]) < 46) {
            if (S.rng() < 0.55) {
              c.axis = 'h'; c.road = j; c.dir = S.rng() < 0.5 ? 1 : -1;
              c.y = ROADS_H[j] + laneOffset('h', c.dir);
              c.turnCd = 2.5;
            }
            break;
          }
        }
      } else {
        for (let j = 0; j < ROADS_V.length; j++) {
          if (Math.abs(c.x - ROADS_V[j]) < 46) {
            if (S.rng() < 0.55) {
              c.axis = 'v'; c.road = j; c.dir = S.rng() < 0.5 ? 1 : -1;
              c.x = ROADS_V[j] + laneOffset('v', c.dir);
              c.turnCd = 2.5;
            }
            break;
          }
        }
      }
    }
    // World bounds: turn around at the edges.
    if (c.x < 240 || c.x > WORLD.w - 40 || c.y < 60 || c.y > WORLD.h - 40) {
      c.dir *= -1;
      c.turnCd = 2;
      if (c.axis === 'v') c.x = clamp(c.x, 240, WORLD.w - 40);
      else c.y = clamp(c.y, 60, WORLD.h - 40);
    }
    // Honk when stuck behind someone.
    if (ahead && c.honkCd <= 0 && S.rng() < dt * 0.3) {
      AudioSys.honk();
      c.honkCd = 4 + S.rng() * 4;
    }
    c.honkCd = Math.max(0, c.honkCd - dt);
  }
}

function carAhead(S, self, range) {
  const fx = Math.cos(self.angle), fy = Math.sin(self.angle);
  let best = null, bestD = range;
  for (const c of S.cars) {
    if (c === self) continue;
    const dx = c.x - self.x, dy = c.y - self.y;
    const along = dx * fx + dy * fy;
    if (along < 5 || along > range) continue;
    const side = Math.abs(-dx * fy + dy * fx);
    if (side > 26) continue;
    if (along < bestD) { bestD = along; best = c; }
  }
  return best;
}

// Player driving physics: acceleration, braking/reverse, steering, drift grip,
// building collision, sand slowdown.
export function updatePlayerCar(S, dt, input) {
  const p = S.player;
  const car = p.car;
  if (!car) return;
  const throttle = input.drive();
  const steer = input.steer();
  const sand = onBeach(car.x);
  const maxSpeed = (sand ? TUNE.carMax * 0.55 : TUNE.carMax);
  if (throttle > 0) car.speed += TUNE.carAccel * dt;
  else if (throttle < 0) {
    if (car.speed > 8) car.speed -= TUNE.carBrake * dt;
    else car.speed -= TUNE.carAccel * 0.55 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
  }
  car.speed = clamp(car.speed, -TUNE.carReverseMax, maxSpeed);
  const spd = Math.abs(car.speed);
  const steerRate = TUNE.carTurn * clamp(spd / 120, 0.25, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += steer * steerRate * dt;
  // Drift: velocity heading chases the car heading with limited grip.
  car.velAngle = car.velAngle === undefined ? car.angle : car.velAngle;
  car.velAngle = angLerp(car.velAngle, car.angle, Math.min(1, TUNE.carGrip * dt));
  const vx = Math.cos(car.velAngle) * car.speed;
  const vy = Math.sin(car.velAngle) * car.speed;
  car.x += vx * dt;
  car.y += vy * dt;
  car.x = clamp(car.x, 24, WORLD.w - 24);
  car.y = clamp(car.y, 24, WORLD.h - 24);
  const res = resolveBuildings(car.x, car.y, 24, S.city.buildings);
  if (res.hit) {
    if (spd > 120 && S.hurtCd <= 0) {
      AudioSys.thud();
      S.player.health = Math.max(0, S.player.health - Math.min(12, spd * 0.02));
      S.shake = Math.min(10, spd * 0.02);
      S.hurtCd = 0.8;
    }
    car.x = res.x; car.y = res.y;
    car.speed *= 0.45;
    car.velAngle = car.angle;
  }
  p.x = car.x; p.y = car.y; p.angle = car.angle; p.speed = car.speed;
}

// Car-vs-car collisions: push apart, exchange a little speed, damage + wanted for police rams.
export function resolveCarCollisions(S, dt) {
  const cars = S.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const d = dist(a.x, a.y, b.x, b.y);
      if (d > 44 || d < 0.01) continue;
      const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
      const push = (44 - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 90 && S.hurtCd <= 0) {
        AudioSys.thud();
        S.shake = Math.min(9, rel * 0.02);
        const playerCar = a.driver === 'player' ? a : b.driver === 'player' ? b : null;
        const policeCar = a.kind === 'police' ? a : b.kind === 'police' ? b : null;
        if (playerCar) {
          // Being rammed by the police hurts, but it does not raise the
          // wanted level — the player did not start that fight. After a
          // ram the police car falls back for a moment instead of grinding
          // against the player every frame.
          S.player.health = Math.max(0, S.player.health - Math.min(6, rel * 0.012));
          S.hurtCd = 1.0;
          if (policeCar) policeCar.ramCd = 2.0;
        }
        a.speed *= 0.6; b.speed *= 0.6;
        if (a.kind === 'civ' && a.driver === 'civ') a.stuck = 0.7;
        if (b.kind === 'civ' && b.driver === 'civ') b.stuck = 0.7;
      }
      // Parked cars get shoved a little and stay put otherwise.
      if (a.kind === 'parked') { a.x += nx * push; a.y += ny * push; }
      if (b.kind === 'parked') { b.x -= nx * push; b.y -= ny * push; }
    }
  }
  // Keep every car out of buildings.
  for (const c of cars) {
    if (c.driver === 'player') continue; // handled in updatePlayerCar
    const res = resolveBuildings(c.x, c.y, 22, S.city.buildings);
    if (res.hit) { c.x = res.x; c.y = res.y; if (c.kind === 'civ') { c.dir *= -1; c.turnCd = 2; } }
  }
}

export function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(-23 + 3, -10 + 4, 46, 22);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -23, -11, 46, 22, 6);
  ctx.fill();
  // Roof / cabin.
  ctx.fillStyle = 'rgba(20,26,34,0.85)';
  roundRect(ctx, -6, -9, 16, 18, 4);
  ctx.fill();
  // Windshield shine.
  ctx.fillStyle = 'rgba(180,220,255,0.5)';
  ctx.fillRect(8, -8, 3, 16);
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(21, -9, 2, 4);
  ctx.fillRect(21, 5, 2, 4);
  // Taillights.
  ctx.fillStyle = '#d23b2e';
  ctx.fillRect(-23, -9, 2, 4);
  ctx.fillRect(-23, 5, 2, 4);
  if (car.kind === 'police') {
    // Light bar flashing red/blue.
    const phase = Math.floor(time * 4 + car.sirenPhase) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2e2e' : '#2e6bff';
    ctx.fillRect(-4, -11, 8, 5);
    ctx.fillStyle = phase ? '#2e6bff' : '#ff2e2e';
    ctx.fillRect(-4, 6, 8, 5);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 2.5);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
