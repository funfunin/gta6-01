// SOLMAR HEAT — HUD: stars, health, cash, speed, objective, timer, and the
// live minimap (player, police, mission marker, city).
import { clamp, fmtCash } from './config.js';
import { WORLD, ROADS_V, ROADS_H, BEACH, PARK, PLACES } from './city.js';
import { missionMarker } from './missions.js';

let els = null;
function getEls() {
  if (els) return els;
  els = {
    stars: document.getElementById('stars'),
    healthFill: document.getElementById('health-fill'),
    cash: document.getElementById('cash'),
    speed: document.getElementById('speed'),
    objective: document.getElementById('objective'),
    timer: document.getElementById('timer'),
    hint: document.getElementById('hint'),
    minimap: document.getElementById('minimap'),
  };
  return els;
}

export function showHUD(show) {
  const hud = document.getElementById('hud');
  if (hud) hud.classList.toggle('hidden', !show);
}

export function updateHUD(S) {
  const e = getEls();
  if (!e.stars) return;
  const w = clamp(S.wanted, 0, 5);
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < w ? '★' : '☆';
  e.stars.textContent = stars;
  e.stars.classList.toggle('hot', w >= 3);
  e.healthFill.style.width = clamp(S.player.health, 0, 100) + '%';
  e.healthFill.style.background = S.player.health > 50 ? '#58c96b' : S.player.health > 25 ? '#e8a13c' : '#d93b2e';
  e.cash.textContent = fmtCash(S.player.cash);
  const kmh = Math.round(Math.abs(S.player.speed || 0) * 0.35);
  e.speed.textContent = S.player.onFoot ? 'on foot' : kmh + ' km/h';
  e.objective.textContent = S.objectiveText || '';
  const cooling = S.wanted > 0 && S.hidden > 0;
  e.timer.textContent = cooling ? 'Cooling down… ' + Math.ceil(S.hidden) + 's' : '';
  e.hint.textContent = S.hintText || '';
  drawMinimap(S, e.minimap);
}

function drawMinimap(S, canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const sx = W / WORLD.w, sy = H / WORLD.h;
  ctx.clearRect(0, 0, W, H);
  // Land / water.
  ctx.fillStyle = '#3a7d4f';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2f6fb5';
  ctx.fillRect(0, 0, BEACH.water * sx, H);
  ctx.fillStyle = '#e8d8a8';
  ctx.fillRect(BEACH.water * sx, 0, (BEACH.sand - BEACH.water) * sx, H);
  // Park.
  ctx.fillStyle = '#2f7a3e';
  ctx.fillRect(PARK.x * sx, PARK.y * sy, PARK.w * sx, PARK.h * sy);
  // Roads.
  ctx.strokeStyle = '#555c66';
  ctx.lineWidth = 3;
  for (const v of ROADS_V) { ctx.beginPath(); ctx.moveTo(v * sx, 0); ctx.lineTo(v * sx, H); ctx.stroke(); }
  for (const h of ROADS_H) { ctx.beginPath(); ctx.moveTo(0, h * sy); ctx.lineTo(W, h * sy); ctx.stroke(); }
  // Buildings.
  ctx.fillStyle = '#8a8f98';
  for (const b of S.city.buildings) ctx.fillRect(b.x * sx, b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
  // Hideout.
  ctx.fillStyle = '#7fd4ff';
  ctx.beginPath(); ctx.arc(PLACES.hideout.x * sx, PLACES.hideout.y * sy, 3, 0, Math.PI * 2); ctx.fill();
  // Mission marker.
  const mk = missionMarker(S);
  if (mk) {
    const pulse = 3 + Math.sin(S.time * 5) * 1.5;
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath(); ctx.arc(mk.x * sx, mk.y * sy, pulse + 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(mk.x * sx, mk.y * sy, pulse + 4, 0, Math.PI * 2); ctx.stroke();
  }
  // Police.
  ctx.fillStyle = '#ff3b30';
  for (const c of S.cars) {
    if (c.kind === 'police') {
      ctx.beginPath(); ctx.arc(c.x * sx, c.y * sy, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Player.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(S.player.x * sx, S.player.y * sy, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#19c37d';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(S.player.x * sx, S.player.y * sy, 5, 0, Math.PI * 2); ctx.stroke();
  // Viewport box.
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;
  const vx = clamp(S.cam.x, 0, WORLD.w - 1280) * sx;
  const vy = clamp(S.cam.y, 0, WORLD.h - 720) * sy;
  ctx.strokeRect(vx, vy, 1280 * sx, 720 * sy);
}
