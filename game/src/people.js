// SOLMAR HEAT — pedestrians: sidewalk walkers who flee when scared, fall when
// hit or punched, and drop cash.
import { clamp, dist, angNorm, pick, TUNE } from './config.js';
import { ROADS_V, ROADS_H, ROAD_W, WORLD, PLACES, resolveBuildings, pointInBuilding } from './city.js';
import { AudioSys } from './audio.js';

const SHIRTS = ['#e85d3f', '#3f8fe8', '#e8b93f', '#5fae5f', '#b05fb5', '#e8e8e8', '#3f3f3f', '#e87fa8'];
const SKINS = ['#f2c89b', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

let nextId = 1;

export function makePed(x, y, angle, rng) {
  return {
    id: nextId++,
    x, y, angle,
    speed: 30 + rng() * 22,
    shirt: pick(rng, SHIRTS),
    skin: pick(rng, SKINS),
    state: 'walk', // 'walk' | 'flee' | 'down'
    stateT: 0,
    turnCd: 0,
    scareCd: 0,
  };
}

export function spawnPeds(rng, count, buildings) {
  const peds = [];
  let tries = 0;
  while (peds.length < count && tries < count * 10) {
    tries++;
    const axis = rng() < 0.5 ? 'v' : 'h';
    let x, y, angle;
    if (axis === 'v') {
      const road = Math.floor(rng() * ROADS_V.length);
      const side = rng() < 0.5 ? -1 : 1;
      x = ROADS_V[road] + side * (ROAD_W / 2 + 14);
      y = 120 + rng() * (WORLD.h - 240);
      angle = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const road = Math.floor(rng() * ROADS_H.length);
      const side = rng() < 0.5 ? -1 : 1;
      y = ROADS_H[road] + side * (ROAD_W / 2 + 14);
      x = 300 + rng() * (WORLD.w - 600);
      angle = rng() < 0.5 ? 0 : Math.PI;
    }
    if (x < 230 || x > WORLD.w - 30 || y < 40 || y > WORLD.h - 30) continue;
    if (buildings && pointInBuilding(x, y, buildings)) continue;
    peds.push(makePed(x, y, angle, rng));
  }
  return peds;
}

// A pedestrian near a fast car, a punch, or a crash gets scared and runs.
export function scarePeds(S, x, y, radius) {
  for (const p of S.peds) {
    if (p.state === 'down') continue;
    if (dist(p.x, p.y, x, y) < radius) {
      p.state = 'flee';
      p.stateT = 2.2;
      p.angle = Math.atan2(p.y - y, p.x - x);
    }
  }
}

export function updatePeds(S, dt) {
  const p = S.player;
  for (const ped of S.peds) {
    ped.turnCd = Math.max(0, ped.turnCd - dt);
    ped.scareCd = Math.max(0, ped.scareCd - dt);
    if (ped.state === 'down') {
      ped.stateT -= dt;
      if (ped.stateT <= 0) { ped.state = 'walk'; ped.speed = 30 + S.rng() * 22; }
      continue;
    }
    // Flee from the player's fast car.
    if (!p.onFoot && p.car && Math.abs(p.car.speed) > 110 && ped.state !== 'flee') {
      if (dist(ped.x, ped.y, p.x, p.y) < 150) {
        ped.state = 'flee';
        ped.stateT = 2.0;
        ped.angle = Math.atan2(ped.y - p.y, ped.x - p.x);
      }
    }
    if (ped.state === 'flee') {
      ped.stateT -= dt;
      if (ped.stateT <= 0) ped.state = 'walk';
    }
    const spd = ped.state === 'flee' ? 130 : ped.speed;
    let nx = ped.x + Math.cos(ped.angle) * spd * dt;
    let ny = ped.y + Math.sin(ped.angle) * spd * dt;
    // Turn away from buildings and the world edge; random turn at junctions.
    const blocked = pointInBuilding(nx, ny, S.city.buildings) || nx < 215 || nx > WORLD.w - 20 || ny < 20 || ny > WORLD.h - 20;
    if (blocked) {
      ped.angle += (S.rng() < 0.5 ? 1 : -1) * (Math.PI / 2);
      ped.turnCd = 0.6;
      nx = ped.x; ny = ped.y;
    } else if (ped.turnCd <= 0 && ped.state === 'walk') {
      for (const v of ROADS_V) {
        if (Math.abs(ped.x - v) < 60) {
          if (S.rng() < dt * 0.12) { ped.angle = S.rng() < 0.5 ? 0 : Math.PI; ped.turnCd = 2; }
          break;
        }
      }
      for (const h of ROADS_H) {
        if (Math.abs(ped.y - h) < 60) {
          if (S.rng() < dt * 0.12) { ped.angle = S.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2; ped.turnCd = 2; }
          break;
        }
      }
    }
    const res = resolveBuildings(nx, ny, 10, S.city.buildings);
    ped.x = res.x; ped.y = res.y;
    // Hit by a fast car: fall, drop cash, wanted rises.
    for (const c of S.cars) {
      if (Math.abs(c.speed) > 60 && dist(ped.x, ped.y, c.x, c.y) < 26) {
        knockDown(S, ped, 12 + Math.floor(S.rng() * 14));
        if (c.driver === 'player') {
          AudioSys.thud();
          S.raiseWanted(1);
        }
        break;
      }
    }
  }
}

export function knockDown(S, ped, cash) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.stateT = 3;
  S.pickups.push({ x: ped.x + 8, y: ped.y + 8, amount: cash, t: 0, kind: 'cash' });
}

// Player punch: short arc in front of the player.
export function tryPunch(S) {
  const p = S.player;
  if (!p.onFoot || p.punchCd > 0) return false;
  p.punchCd = TUNE.punchCooldown;
  AudioSys.punch();
  let hitAny = false;
  for (const ped of S.peds) {
    if (ped.state === 'down') continue;
    const d = dist(p.x, p.y, ped.x, ped.y);
    if (d > TUNE.punchRange) continue;
    const a = Math.abs(angNorm(Math.atan2(ped.y - p.y, ped.x - p.x) - p.angle));
    if (a > TUNE.punchArc) continue;
    knockDown(S, ped, 10 + Math.floor(S.rng() * 16));
    hitAny = true;
  }
  if (hitAny) S.raiseWanted(1);
  return hitAny;
}

export function drawPed(ctx, ped, time) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(2, 3, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.rotate(ped.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(2, 3, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Body.
  ctx.fillStyle = ped.shirt;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
  // Head.
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(ped.state === 'down' ? 0 : 4, ped.state === 'down' ? 0 : 0, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (ped.state === 'down') {
    // Dizzy stars.
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✶', ped.x, ped.y - 12 + Math.sin(time * 3 + ped.id) * 2);
  }
}
