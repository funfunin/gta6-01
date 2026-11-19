// SOLMAR HEAT — game loop, state machine, world rendering, screens.
// Original work for the make.fun gta6-01 bounty. Pure canvas + ES modules.
import { WORLD, VIEW, clamp, dist, mulberry32, fmtCash, TUNE } from './config.js';
import { buildCity, ROADS_V, ROADS_H, ROAD_W, BEACH, PARK, PLACES, resolveBuildings, pointInBuilding, isOnRoad } from './city.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { makeCar, spawnTraffic, spawnParked, updateTraffic, updatePlayerCar, resolveCarCollisions, drawCar } from './cars.js';
import { spawnPeds, updatePeds, tryPunch, scarePeds, drawPed, makePed } from './people.js';
import { updatePolice } from './police.js';
import { MISSIONS, startMission, updateMission, currentObjective, missionMarker } from './missions.js';
import { showHUD, updateHUD } from './hud.js';
import { setupShot } from './shots.js';

const SAVE_KEY = 'solmar-heat-save-v1';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const nightCanvas = document.createElement('canvas');
nightCanvas.width = VIEW.w;
nightCanvas.height = VIEW.h;
const nightCtx = nightCanvas.getContext('2d');

// ---- Save ----
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { unlocked: s.unlocked || 1, cash: s.cash || 0, best: s.best || {} };
    }
  } catch (e) { /* fresh save */ }
  return { unlocked: 1, cash: 0, best: {} };
}

// ---- Game state ----
const q = new URLSearchParams(window.location.search);
const seed = parseInt(q.get('seed') || '1', 10);
const S = {
  mode: 'start', // 'start' | 'playing' | 'paused' | 'complete' | 'busted' | 'failed' | 'gameover'
  time: 0,
  rng: mulberry32(seed),
  city: buildCity(1337),
  player: {
    x: PLACES.spawn.x, y: PLACES.spawn.y, angle: 0, speed: 0,
    onFoot: true, health: 100, cash: 0, car: null, punchCd: 0, vx: 0, vy: 0,
  },
  cars: [],
  peds: [],
  pickups: [],
  wanted: 0,
  hidden: 0,
  bustedT: 0,
  policeSpawnCd: 0,
  nearestPolice: Infinity,
  mission: null,
  night: false,
  cam: { x: 0, y: 0 },
  shake: 0,
  save: loadSave(),
  objectiveText: '',
  hintText: '',
  shot: null,
  lastRaise: -10,
  hurtCd: 0,
  endMissionId: null,
};
S.player.cash = S.save.cash;
window.__game = S;

S.saveGame = function () {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S.save)); } catch (e) { /* storage unavailable */ }
};
S.toast = function (msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(S._toastTimer);
  S._toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
};
S.raiseWanted = function (n) {
  if (S.time - S.lastRaise < 1.5) return;
  S.lastRaise = S.time;
  S.wanted = Math.min(5, S.wanted + n);
};
S.bust = function (reason) {
  if (S.mode !== 'playing') return;
  S.wanted = 0;
  S.player.health = 100;
  AudioSys.fail();
  AudioSys.setSiren(false);
  endScreen('Busted!', reason + ' The Solmar police hauled Dana in — but the city forgets fast.', 'busted', S.mission ? S.mission.def.id : null);
};
S.failMission = function (reason) {
  if (S.mode !== 'playing') return;
  AudioSys.fail();
  endScreen('Mission Failed', reason, 'failed', S.mission ? S.mission.def.id : null);
};

// ---- World setup ----
function resetWorld() {
  S.cars = [];
  S.peds = [];
  S.pickups = [];
  S.wanted = 0;
  S.hidden = 0;
  S.bustedT = 0;
  S.nearestPolice = Infinity;
  S.night = false;
  S.mission = null;
  const rng = mulberry32(seed);
  S.cars.push(...spawnTraffic(rng, 14));
  S.cars.push(...spawnParked(rng, 26));
  S.peds.push(...spawnPeds(rng, 46, S.city.buildings));
  const p = S.player;
  p.onFoot = true;
  p.car = null;
  p.x = PLACES.spawn.x; p.y = PLACES.spawn.y; p.angle = 0; p.speed = 0;
  p.health = 100;
  p.cash = S.save.cash;
}

// ---- Screens ----
function el(id) { return document.getElementById(id); }
function showOnly(id) {
  for (const n of ['start-screen', 'pause-screen', 'end-screen']) el(n).classList.toggle('hidden', n !== id);
  if (!id) for (const n of ['start-screen', 'pause-screen', 'end-screen']) el(n).classList.add('hidden');
}
function buildMissionList() {
  const list = el('mission-list');
  list.innerHTML = '';
  for (const m of MISSIONS) {
    const locked = m.id > S.save.unlocked;
    const b = document.createElement('button');
    b.className = 'mission-btn' + (locked ? ' locked' : '');
    b.disabled = locked;
    b.innerHTML = '<span class="m-num">' + m.id + '</span><span class="m-name">' + m.name + '</span><span class="m-reward">' + fmtCash(m.reward) + '</span>' + (locked ? '<span class="m-lock">🔒</span>' : '');
    b.addEventListener('click', () => { AudioSys.click(); startPlaying(m.id); });
    list.appendChild(b);
  }
  el('save-info').textContent = 'Progress: ' + Math.min(S.save.unlocked - 1, 6) + '/6 missions · ' + fmtCash(S.save.cash) + ' cash';
}
function showStart() {
  S.mode = 'start';
  showHUD(false);
  buildMissionList();
  showOnly('start-screen');
  AudioSys.setSiren(false);
  AudioSys.setEngine(0, false);
}
function startPlaying(missionId) {
  AudioSys.ensure();
  AudioSys.startMusic();
  resetWorld();
  showOnly(null);
  showHUD(true);
  S.mode = 'playing';
  if (missionId) {
    startMission(S, missionId);
  } else {
    S.toast('Free roam — explore Solmar Bay. Steal a car with E, punch with Space.');
  }
}
function endScreen(title, text, kind, missionId) {
  S.mode = kind;
  S.endMissionId = missionId;
  el('end-title').textContent = title;
  el('end-text').textContent = text;
  const primary = el('end-primary');
  const secondary = el('end-secondary');
  if (kind === 'complete') {
    const next = missionId && missionId < 6 ? missionId + 1 : null;
    primary.textContent = next ? 'Next mission: ' + MISSIONS[next - 1].name : 'Free roam';
    S._endPrimary = () => startPlaying(next);
  } else if (kind === 'busted' || kind === 'failed') {
    primary.textContent = missionId ? 'Retry mission ' + missionId : 'Free roam';
    S._endPrimary = () => startPlaying(missionId);
  } else {
    primary.textContent = 'Free roam';
    S._endPrimary = () => startPlaying(null);
  }
  secondary.textContent = 'Main menu';
  showOnly('end-screen');
  showHUD(false);
  AudioSys.setSiren(false);
  AudioSys.setEngine(0, false);
}
// missions.js completes missions through the state object.
S.endScreen = endScreen;

// ---- Buttons ----
el('btn-continue').addEventListener('click', () => { AudioSys.click(); startPlaying(null); });
el('btn-newgame').addEventListener('click', () => {
  AudioSys.click();
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  S.save = { unlocked: 1, cash: 0, best: {} };
  S.player.cash = 0;
  buildMissionList();
  S.toast('New game — progress reset.');
});
el('btn-resume').addEventListener('click', () => { AudioSys.click(); S.mode = 'playing'; showOnly(null); });
el('btn-quit').addEventListener('click', () => { AudioSys.click(); showStart(); });
el('end-primary').addEventListener('click', () => { AudioSys.click(); if (S._endPrimary) S._endPrimary(); });
el('end-secondary').addEventListener('click', () => { AudioSys.click(); showStart(); });

// ---- Player: on foot ----
function updateOnFoot(dt) {
  const p = S.player;
  const mx = Input.moveX(), my = Input.moveY();
  const moving = mx !== 0 || my !== 0;
  const spd = Input.run() ? TUNE.runSpeed : TUNE.walkSpeed;
  if (moving) {
    const mag = Math.hypot(mx, my);
    const nx = p.x + (mx / mag) * spd * dt;
    const ny = p.y + (my / mag) * spd * dt;
    p.angle = Math.atan2(my, mx);
    const res = resolveBuildings(nx, ny, 12, S.city.buildings);
    p.x = clamp(res.x, 16, WORLD.w - 16);
    p.y = clamp(res.y, 16, WORLD.h - 16);
    p.speed = spd;
  } else {
    p.speed = 0;
  }
  p.punchCd = Math.max(0, p.punchCd - dt);
  if (Input.wasPressed('Space')) tryPunch(S);
  // Cash pickups.
  for (let i = S.pickups.length - 1; i >= 0; i--) {
    const pk = S.pickups[i];
    pk.t += dt;
    if (dist(p.x, p.y, pk.x, pk.y) < 30) {
      p.cash += pk.amount;
      S.save.cash = p.cash;
      S.saveGame();
      AudioSys.cash();
      S.pickups.splice(i, 1);
    }
  }
  // Enter / steal a car.
  if (Input.wasPressed('KeyE')) {
    const car = nearestStealableCar();
    if (car) stealCar(car);
  }
}

function nearestStealableCar() {
  const p = S.player;
  let best = null, bestD = 78;
  for (const c of S.cars) {
    if (c.kind === 'police') continue;
    if (c.kind === 'civ' && Math.abs(c.speed) > 80) continue;
    const d = dist(p.x, p.y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function stealCar(car) {
  const p = S.player;
  if (car.driver === 'civ') {
    // The driver bails out and runs.
    const ped = makePed(car.x + 30, car.y, car.angle + Math.PI / 2, S.rng);
    ped.state = 'flee';
    ped.stateT = 3;
    S.peds.push(ped);
    scarePeds(S, car.x, car.y, 90);
  }
  car.driver = 'player';
  p.onFoot = false;
  p.car = car;
  p.x = car.x; p.y = car.y; p.angle = car.angle;
  S.raiseWanted(1);
  S.toast('You stole the car! The police noticed.');
  AudioSys.pickup();
}

// ---- Update ----
function update(dt) {
  S.time += dt;
  S.hurtCd = Math.max(0, S.hurtCd - dt);
  const p = S.player;
  if (Input.wasPressed('KeyM')) {
    AudioSys.setMuted(!AudioSys.isMuted());
    S.toast(AudioSys.isMuted() ? 'Muted' : 'Sound on');
  }
  if (Input.wasPressed('KeyP') || Input.wasPressed('Escape')) {
    S.mode = 'paused';
    showOnly('pause-screen');
    AudioSys.setSiren(false);
    AudioSys.setEngine(0, false);
    return;
  }
  if (p.onFoot) updateOnFoot(dt);
  else {
    updatePlayerCar(S, dt, Input);
    // Pick up cash while driving over it.
    for (let i = S.pickups.length - 1; i >= 0; i--) {
      const pk = S.pickups[i];
      pk.t += dt;
      if (dist(p.x, p.y, pk.x, pk.y) < 34) {
        p.cash += pk.amount;
        S.save.cash = p.cash;
        S.saveGame();
        AudioSys.cash();
        S.pickups.splice(i, 1);
      }
    }
    if (Input.wasPressed('KeyE')) {
      // Exit the car.
      const car = p.car;
      const sx = car.x + Math.cos(car.angle + Math.PI / 2) * 38;
      const sy = car.y + Math.sin(car.angle + Math.PI / 2) * 38;
      const res = resolveBuildings(sx, sy, 12, S.city.buildings);
      p.x = clamp(res.x, 16, WORLD.w - 16);
      p.y = clamp(res.y, 16, WORLD.h - 16);
      p.angle = car.angle;
      p.onFoot = true;
      p.car = null;
      car.driver = 'none';
      car.kind = 'parked';
      car.speed = 0;
      AudioSys.setEngine(0, false);
    }
  }
  updateTraffic(S, dt);
  updatePeds(S, dt);
  updatePolice(S, dt);
  updateMission(S, dt);
  resolveCarCollisions(S, dt);
  // Slow health regen when the heat is off.
  if (S.wanted === 0 && p.health < 100) p.health = Math.min(100, p.health + 3 * dt);
  if (p.health <= 0) {
    endScreen('Wrecked', 'Dana is out of action — the car is scrap and the job is blown.', 'gameover', S.mission ? S.mission.def.id : null);
    return;
  }
  // Camera follows the player.
  const tx = clamp(p.x - VIEW.w / 2, 0, WORLD.w - VIEW.w);
  const ty = clamp(p.y - VIEW.h / 2, 0, WORLD.h - VIEW.h);
  S.cam.x += (tx - S.cam.x) * Math.min(1, dt * 5);
  S.cam.y += (ty - S.cam.y) * Math.min(1, dt * 5);
  S.shake = Math.max(0, S.shake - dt * 22);
  // HUD text.
  S.objectiveText = currentObjective(S);
  if (p.onFoot) {
    S.hintText = nearestStealableCar() ? 'Press E to get in the car' : 'WASD move · Shift run · Space punch · P pause · M mute';
  } else {
    S.hintText = 'WASD drive · E exit car · P pause · M mute';
  }
  AudioSys.setEngine(Math.abs(p.speed || 0) / TUNE.carMax, !p.onFoot);
}

// ---- Rendering ----
function drawWorld() {
  const shX = S.shake > 0 ? (S.rng() - 0.5) * S.shake : 0;
  const shY = S.shake > 0 ? (S.rng() - 0.5) * S.shake : 0;
  const camX = S.cam.x + shX, camY = S.cam.y + shY;
  ctx.save();
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  ctx.translate(-Math.round(camX), -Math.round(camY));
  const vx0 = camX - 40, vy0 = camY - 40, vx1 = camX + VIEW.w + 40, vy1 = camY + VIEW.h + 40;
  // Ground.
  ctx.fillStyle = S.night ? '#2c3a2e' : '#5b8f4e';
  ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  // Water + sand (west edge).
  ctx.fillStyle = S.night ? '#12283e' : '#2f6fb5';
  ctx.fillRect(vx0, vy0, BEACH.water - vx0 > 0 ? BEACH.water - vx0 : 0, vy1 - vy0);
  ctx.fillStyle = S.night ? '#8a7d5e' : '#e8d8a8';
  ctx.fillRect(BEACH.water, vy0, BEACH.sand - BEACH.water, vy1 - vy0);
  // Park.
  ctx.fillStyle = S.night ? '#1e4a26' : '#3f9a4a';
  ctx.fillRect(PARK.x, PARK.y, PARK.w, PARK.h);
  ctx.fillStyle = S.night ? '#2a5c30' : '#4caf50';
  ctx.beginPath(); ctx.ellipse(PARK.x + PARK.w / 2, PARK.y + PARK.h / 2, 46, 30, 0, 0, Math.PI * 2); ctx.fill();
  // Sidewalks.
  ctx.fillStyle = S.night ? '#5a6068' : '#b8bcc2';
  for (const v of ROADS_V) ctx.fillRect(v - ROAD_W / 2 - 14, vy0, ROAD_W + 28, vy1 - vy0);
  for (const h of ROADS_H) ctx.fillRect(vx0, h - ROAD_W / 2 - 14, vx1 - vx0, ROAD_W + 28);
  // Roads.
  ctx.fillStyle = S.night ? '#2b2f36' : '#3a3f46';
  for (const v of ROADS_V) ctx.fillRect(v - ROAD_W / 2, vy0, ROAD_W, vy1 - vy0);
  for (const h of ROADS_H) ctx.fillRect(vx0, h - ROAD_W / 2, vx1 - vx0, ROAD_W);
  // Lane dashes.
  ctx.strokeStyle = S.night ? '#8a7d3c' : '#e8c93c';
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 26]);
  for (const v of ROADS_V) { ctx.beginPath(); ctx.moveTo(v, vy0); ctx.lineTo(v, vy1); ctx.stroke(); }
  for (const h of ROADS_H) { ctx.beginPath(); ctx.moveTo(vx0, h); ctx.lineTo(vx1, h); ctx.stroke(); }
  ctx.setLineDash([]);
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const v of ROADS_V) {
    for (const h of ROADS_H) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(v - 30 + i * 9, h - ROAD_W / 2 - 6, 5, 12);
        ctx.fillRect(v - 30 + i * 9, h + ROAD_W / 2 - 6, 5, 12);
      }
    }
  }
  // Trees.
  for (const t of S.city.trees) {
    if (t.x < vx0 || t.x > vx1 || t.y < vy0 || t.y > vy1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(t.x + 3, t.y + 4, t.r, t.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = S.night ? '#1e4a26' : '#2f7a3e';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = S.night ? '#2a5c30' : '#3f9a4a';
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  // Buildings.
  for (const b of S.city.buildings) {
    if (b.x > vx1 || b.x + b.w < vx0 || b.y > vy1 || b.y + b.h < vy0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = S.night ? shade(b.color, -40) : b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = b.roof;
    ctx.lineWidth = 4;
    ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    // Windows.
    ctx.fillStyle = S.night ? '#ffe9a8' : 'rgba(40,60,90,0.55)';
    const cols = Math.max(1, Math.floor(b.w / 34)), rows = Math.max(1, Math.floor(b.h / 34));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (((i * 7 + j * 3 + b.x) % 5) < 3) ctx.fillRect(b.x + 10 + i * 32, b.y + 10 + j * 32, 12, 14);
      }
    }
    if (b.landmark === 'bank') {
      ctx.fillStyle = '#20242e';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SOLMAR BAY BANK', b.x + b.w / 2, b.y + b.h / 2 + 4);
      ctx.fillStyle = '#ffd94a';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('$', b.x + b.w / 2, b.y + 24);
    } else if (b.landmark === 'garage') {
      ctx.fillStyle = '#20242e';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MARINA GARAGE', b.x + b.w / 2, b.y + b.h / 2 + 4);
    } else if (b.landmark === 'hideout') {
      ctx.fillStyle = '#7fd4ff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HIDEOUT', b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }
  // Yacht at the marina.
  drawYacht();
  // Cash pickups.
  for (const pk of S.pickups) {
    const bob = Math.sin(pk.t * 4) * 3;
    ctx.fillStyle = '#1d9e4b';
    ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', pk.x, pk.y + bob + 4);
  }
  // Mission marker.
  const mk = missionMarker(S);
  if (mk) {
    const pulse = 1 + Math.sin(S.time * 5) * 0.15;
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(mk.x, mk.y, (mk.r || 80) * 0.35 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath();
    ctx.moveTo(mk.x, mk.y - 46 + Math.sin(S.time * 5) * 6);
    ctx.lineTo(mk.x - 12, mk.y - 64 + Math.sin(S.time * 5) * 6);
    ctx.lineTo(mk.x + 12, mk.y - 64 + Math.sin(S.time * 5) * 6);
    ctx.closePath(); ctx.fill();
  }
  // Cars, pedestrians, player.
  for (const c of S.cars) drawCar(ctx, c, S.time);
  for (const ped of S.peds) drawPed(ctx, ped, S.time);
  if (S.player.onFoot) drawPlayerOnFoot();
  // Headlight cones at night.
  if (S.night && !S.player.onFoot && S.player.car) {
    const car = S.player.car;
    const gx = car.x + Math.cos(car.angle) * 190;
    const gy = car.y + Math.sin(car.angle) * 190;
    const grad = ctx.createRadialGradient(car.x, car.y, 30, gx, gy, 260);
    grad.addColorStop(0, 'rgba(255,240,180,0.30)');
    grad.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(car.x + Math.cos(car.angle - 0.5) * 20, car.y + Math.sin(car.angle - 0.5) * 20);
    ctx.lineTo(gx + Math.cos(car.angle - 0.28) * 150, gy + Math.sin(car.angle - 0.28) * 150);
    ctx.lineTo(gx + Math.cos(car.angle + 0.28) * 150, gy + Math.sin(car.angle + 0.28) * 150);
    ctx.lineTo(car.x + Math.cos(car.angle + 0.5) * 20, car.y + Math.sin(car.angle + 0.5) * 20);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // Night darkness with a lit circle around the player.
  if (S.night) {
    nightCtx.clearRect(0, 0, VIEW.w, VIEW.h);
    nightCtx.fillStyle = 'rgba(8,12,28,0.62)';
    nightCtx.fillRect(0, 0, VIEW.w, VIEW.h);
    nightCtx.globalCompositeOperation = 'destination-out';
    const px = S.player.x - S.cam.x, py = S.player.y - S.cam.y;
    const g = nightCtx.createRadialGradient(px, py, 60, px, py, 320);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    nightCtx.fillStyle = g;
    nightCtx.beginPath(); nightCtx.arc(px, py, 320, 0, Math.PI * 2); nightCtx.fill();
    nightCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(nightCanvas, 0, 0);
  }
  // Vignette.
  const vg = ctx.createRadialGradient(VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.45, VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  // Punch arc flash.
  if (S.player.onFoot && S.player.punchCd > TUNE.punchCooldown - 0.15) {
    ctx.save();
    ctx.translate(S.player.x - S.cam.x, S.player.y - S.cam.y);
    ctx.rotate(S.player.angle);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 44, -TUNE.punchArc, TUNE.punchArc); ctx.stroke();
    ctx.restore();
  }
}

function drawYacht() {
  const x = 105, y = PLACES.yacht.y;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(4, 6, 62, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2f2f2';
  ctx.beginPath(); ctx.ellipse(0, 0, 58, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2f6fb5';
  ctx.beginPath(); ctx.ellipse(0, -2, 34, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd94a';
  ctx.fillRect(-2, -34, 3, 32);
  ctx.fillStyle = '#ff5f4a';
  ctx.beginPath(); ctx.moveTo(1, -32); ctx.lineTo(22, -24); ctx.lineTo(1, -16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#20242e';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('YACHT', 0, 34);
  ctx.restore();
}

function drawPlayerOnFoot() {
  const p = S.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 3, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(p.angle);
  // Body: Dana's teal jacket.
  ctx.fillStyle = '#2f8f7a';
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2c89b';
  ctx.beginPath(); ctx.arc(5, 0, 5, 0, Math.PI * 2); ctx.fill();
  // Facing tick.
  ctx.fillStyle = '#ffd94a';
  ctx.fillRect(8, -2, 6, 4);
  ctx.restore();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// ---- Main loop ----
let last = performance.now();
let frames = 0;
function loop(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  if (S.mode === 'playing') {
    update(dt);
    if (S.mode === 'playing') updateHUD(S);
  } else if (S.mode === 'start') {
    // Slow drift over the marina behind the start screen.
    S.time += dt;
    S.cam.x = 0;
    S.cam.y = 120 + Math.sin(S.time * 0.1) * 20;
  }
  drawWorld();
  if (S.mode === 'playing') updateHUD(S);
  Input.endFrame();
  frames++;
  if (S.shot && frames >= 4 && !window.__shotReady) window.__shotReady = true;
  requestAnimationFrame(loop);
}

// ---- Boot ----
resetWorld();
const isShot = setupShot(S);
if (isShot && S.mode === 'playing') {
  showOnly(null);
  showHUD(true);
} else if (!isShot) {
  showStart();
} else {
  // Start shot: keep the start screen up.
  showStart();
}
requestAnimationFrame(loop);
