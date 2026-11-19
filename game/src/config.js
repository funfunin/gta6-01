// SOLMAR HEAT — tuning constants and math helpers.
// Original work for the make.fun gta6-01 bounty. No third-party code.
export const WORLD = { w: 3200, h: 2400 };
export const VIEW = { w: 1280, h: 720 };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.hypot(dx, dy); }
export function angNorm(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function angLerp(a, b, t) { return a + angNorm(b - a) * t; }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function fmtCash(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
export function fmtTime(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m + ':' + String(r).padStart(2, '0');
}

export const TUNE = {
  walkSpeed: 155,
  runSpeed: 265,
  carAccel: 360,
  carBrake: 560,
  carReverseMax: 170,
  carMax: 440,
  carGrip: 4.5,
  carTurn: 2.7,
  policeMax: 430,
  policeAccel: 400,
  punchRange: 54,
  punchArc: 1.15,
  punchCooldown: 0.45,
  hideRadius: 650,
  hideTimePerStar: 10,
  bustedTime: 1.5,
  civCruiseMin: 110,
  civCruiseMax: 165,
};
