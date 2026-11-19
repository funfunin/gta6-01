// SOLMAR HEAT — wanted level and police AI: spawn, chase, ram, box in,
// catch on-foot players, and cool down when the player breaks line of sight.
import { clamp, dist, angNorm, angLerp, TUNE } from './config.js';
import { WORLD, ROADS_V, ROADS_H, PLACES } from './city.js';
import { makeCar, POLICE_COLOR } from './cars.js';
import { AudioSys } from './audio.js';

const DESIRED = [0, 1, 2, 3, 4, 5];

export function policeCount(S) {
  return S.cars.filter((c) => c.kind === 'police').length;
}

function spawnPoint(S) {
  // A map-edge road point near the player but off-screen.
  const p = S.player;
  const cands = [];
  for (const v of ROADS_V) {
    cands.push({ x: v, y: 80 });
    cands.push({ x: v, y: WORLD.h - 80 });
  }
  for (const h of ROADS_H) {
    cands.push({ x: 260, y: h });
    cands.push({ x: WORLD.w - 60, y: h });
  }
  cands.sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y));
  // Prefer the nearest edge points so the chase reaches the player fast.
  const pick = cands[Math.floor(S.rng() * 2)] || cands[0];
  return pick;
}

export function updatePolice(S, dt) {
  const p = S.player;
  const wanted = S.wanted;
  const desired = DESIRED[clamp(wanted, 0, 5)] || 0;

  // Spawn to match the wanted level (at most one per 1.2s).
  S.policeSpawnCd = Math.max(0, (S.policeSpawnCd || 0) - dt);
  if (wanted > 0 && policeCount(S) < desired && S.policeSpawnCd <= 0) {
    const sp = spawnPoint(S);
    const car = makeCar(sp.x, sp.y, Math.atan2(p.y - sp.y, p.x - sp.x), POLICE_COLOR, 'police', 'police');
    car.maxSpeed = TUNE.policeMax + wanted * 18;
    car.state = 'chase';
    S.cars.push(car);
    S.policeSpawnCd = 1.2;
  }
  // Wanted cleared: chasing police give up and drive off.
  // Stationary roadblock cars (mission 5) stay where they are.
  if (wanted === 0) {
    for (let i = S.cars.length - 1; i >= 0; i--) {
      if (S.cars[i].kind === 'police' && S.cars[i].state !== 'block') S.cars.splice(i, 1);
    }
    S.bustedT = 0;
  }

  // Chase AI.
  let nearest = Infinity;
  for (const c of S.cars) {
    if (c.kind !== 'police') continue;
    const d = dist(c.x, c.y, p.x, p.y);
    if (d < nearest) nearest = d;
    if (c.state === 'block') {
      // Roadblock car: parked across the road until the player is close.
      if (d < 260) c.state = 'chase';
      continue;
    }
    // Predict the player's position slightly.
    const tx = p.x + (p.car ? Math.cos(p.angle) * p.speed * 0.25 : 0);
    const ty = p.y + (p.car ? Math.sin(p.angle) * p.speed * 0.25 : 0);
    const desiredAngle = Math.atan2(ty - c.y, tx - c.x);
    const turn = clamp(angNorm(desiredAngle - c.angle), -1, 1);
    c.angle += turn * 3.0 * dt;
    // After a ram the police car falls back briefly instead of grinding.
    c.ramCd = Math.max(0, (c.ramCd || 0) - dt);
    const ramFactor = c.ramCd > 0 ? 0.35 : 1;
    // Ram speed: full speed when far, ease off when about to hit.
    const target = d > 90 ? c.maxSpeed * ramFactor : c.maxSpeed * 0.75 * ramFactor;
    c.speed += clamp(target - c.speed, -TUNE.carBrake * dt, TUNE.policeAccel * dt);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    c.x = clamp(c.x, 24, WORLD.w - 24);
    c.y = clamp(c.y, 24, WORLD.h - 24);
    // Despawn far-away police so the chase stays near the player.
    if (d > 1600) {
      const sp = spawnPoint(S);
      c.x = sp.x; c.y = sp.y;
      c.angle = Math.atan2(p.y - sp.y, p.x - sp.x);
      c.speed = 200;
    }
  }

  // Siren while any police is chasing.
  AudioSys.setSiren(wanted > 0 && policeCount(S) > 0 && S.mode === 'playing');

  // Busted: on foot, a police car sits on you.
  if (wanted > 0 && p.onFoot && nearest < 78) {
    S.bustedT += dt;
    if (S.bustedT >= TUNE.bustedTime) S.bust('The Solmar police caught Dana on foot.');
  } else {
    S.bustedT = Math.max(0, S.bustedT - dt * 2);
  }

  // Cooling down: break line of sight (distance) and stay hidden.
  if (wanted > 0) {
    const inHideout = dist(p.x, p.y, PLACES.hideout.x, PLACES.hideout.y) < 130;
    if (nearest > TUNE.hideRadius || inHideout) {
      S.hidden += dt * (inHideout ? 3 : 1);
      if (S.hidden >= TUNE.hideTimePerStar) {
        S.wanted = Math.max(0, S.wanted - 1);
        S.hidden = 0;
        S.toast('The heat is cooling off… wanted level ' + S.wanted);
      }
    } else {
      S.hidden = Math.max(0, S.hidden - dt * 2);
    }
  } else {
    S.hidden = 0;
  }
  S.nearestPolice = nearest;
}
