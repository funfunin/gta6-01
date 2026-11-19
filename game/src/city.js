// SOLMAR HEAT — the city of Solmar Bay: road grid, districts, buildings,
// landmarks, named places. All generated deterministically from a fixed seed.
import { mulberry32, pick, clamp } from './config.js';

export const WORLD = { w: 3200, h: 2400 };
export const ROADS_V = [300, 800, 1300, 1800, 2300, 2800];
export const ROADS_H = [300, 750, 1200, 1650, 2100];
export const ROAD_W = 96;
export const BEACH = { water: 130, sand: 205 };
export const PARK = { x: 1450, y: 1330, w: 260, h: 210 };

// Named mission / story places (centres, in world coordinates).
export const PLACES = {
  spawn: { x: 900, y: 1250 },
  marinaGarage: { x: 485, y: 500 },
  bank: { x: 1435, y: 950 },
  getawayCar: { x: 1560, y: 1010 },
  yacht: { x: 175, y: 1180 },
  packagePickup: { x: 2420, y: 1350 },
  deliverySouth: { x: 900, y: 2050 },
  hideout: { x: 2650, y: 640 },
  roadblockA: { x: 1300, y: 1650 },
  roadblockB: { x: 1800, y: 750 },
  parkCenter: { x: 1580, y: 1430 },
};

const DISTRICT_COLORS = {
  Marina: ['#f2e3c6', '#e8d3a8', '#cfe0d8', '#f6ead2', '#d9e6ea'],
  'Old Town': ['#c98f5f', '#b5764a', '#d9a066', '#a86b45', '#c08352'],
  'Market Row': ['#d96a5f', '#e8a13c', '#7fb069', '#5f8fd9', '#c95f9e'],
  'North Hills': ['#9aa7b5', '#7e8fa0', '#b5c0cb', '#8a97a8', '#a8b4c2'],
  Docks: ['#8a7a63', '#a08a6a', '#7a6a55', '#b09a72', '#94816a'],
};

export function districtAt(x, y) {
  if (x < 800) return 'Marina';
  if (y < 750) return 'North Hills';
  if (x >= 2300) return 'Docks';
  if (y >= 1200 && x < 1800) return 'Old Town';
  return 'Market Row';
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function nearPlace(x, y, r) {
  for (const k of Object.keys(PLACES)) {
    const p = PLACES[k];
    if (Math.hypot(p.x - x, p.y - y) < r) return true;
  }
  return false;
}

export function buildCity(seed = 1337) {
  const rng = mulberry32(seed);
  const buildings = [];
  // Landmarks (also collidable buildings).
  buildings.push({ x: 1360, y: 810, w: 150, h: 110, color: '#e8dcc0', roof: '#b09a6a', district: 'Market Row', landmark: 'bank' });
  buildings.push({ x: 400, y: 360, w: 170, h: 110, color: '#d9c9a8', roof: '#8a7a55', district: 'Marina', landmark: 'garage' });
  buildings.push({ x: 2580, y: 520, w: 140, h: 90, color: '#9aa7b5', roof: '#5f6f80', district: 'North Hills', landmark: 'hideout' });

  // City blocks: gaps between roads (and the world edges). xs/xe and ys/ye
  // are paired arrays: block i spans [xs[i], xe[i]] x [ys[j], ye[j]].
  const xs = [BEACH.sand + 8, ...ROADS_V.map((v) => v + ROAD_W / 2)];
  const xe = [...ROADS_V.map((v) => v - ROAD_W / 2), WORLD.w - 30];
  const ys = [40, ...ROADS_H.map((h) => h + ROAD_W / 2)];
  const ye = [...ROADS_H.map((h) => h - ROAD_W / 2), WORLD.h - 40];
  for (let bi = 0; bi < xs.length; bi++) {
    for (let bj = 0; bj < ys.length; bj++) {
      const bx = xs[bi] + 14, by = ys[bj] + 14;
      const bw = xe[bi] - xs[bi] - 28, bh = ye[bj] - ys[bj] - 28;
      if (!Number.isFinite(bw) || !Number.isFinite(bh) || bw < 70 || bh < 70) continue;
      if (rectsOverlap({ x: bx, y: by, w: bw, h: bh }, PARK)) continue;
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        for (let attempt = 0; attempt < 9; attempt++) {
          const w = 90 + rng() * 100, h = 80 + rng() * 90;
          const x = bx + rng() * Math.max(1, bw - w);
          const y = by + rng() * Math.max(1, bh - h);
          const cx = x + w / 2, cy = y + h / 2;
          if (nearPlace(cx, cy, 150)) continue;
          const b = { x, y, w, h, district: districtAt(cx, cy) };
          b.color = pick(rng, DISTRICT_COLORS[b.district]);
          b.roof = pick(rng, ['#6b5a48', '#7a6a55', '#54606e', '#8a4a3a']);
          if (buildings.some((o) => rectsOverlap(o, { x: x - 12, y: y - 12, w: w + 24, h: h + 24 }))) continue;
          buildings.push(b);
          break;
        }
      }
    }
  }
  // Trees: park grove + scattered sidewalk trees.
  const trees = [];
  for (let i = 0; i < 26; i++) {
    trees.push({ x: PARK.x + 16 + rng() * (PARK.w - 32), y: PARK.y + 16 + rng() * (PARK.h - 32), r: 12 + rng() * 10 });
  }
  for (let i = 0; i < 40; i++) {
    const x = 240 + rng() * (WORLD.w - 480), y = 60 + rng() * (WORLD.h - 120);
    if (isOnRoad(x, y)) continue;
    if (buildings.some((b) => x > b.x - 8 && x < b.x + b.w + 8 && y > b.y - 8 && y < b.y + b.h + 8)) continue;
    if (rectsOverlap({ x: x - 10, y: y - 10, w: 20, h: 20 }, PARK)) continue;
    trees.push({ x, y, r: 9 + rng() * 8 });
  }
  return { buildings, trees };
}

export function isOnRoad(x, y) {
  for (const v of ROADS_V) if (Math.abs(x - v) < ROAD_W / 2) return true;
  for (const h of ROADS_H) if (Math.abs(y - h) < ROAD_W / 2) return true;
  return false;
}
export function onBeach(x) { return x < BEACH.sand; }
export function inPark(x, y) {
  return x > PARK.x && x < PARK.x + PARK.w && y > PARK.y && y < PARK.y + PARK.h;
}

// Push a circle (x, y, r) out of every building rect it overlaps.
// Returns {x, y, hit} with corrected coordinates.
export function resolveBuildings(x, y, r, buildings) {
  let hit = false;
  for (const b of buildings) {
    // Defensive: skip any building with non-finite geometry.
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.w) || !Number.isFinite(b.h)) continue;
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        y = cy + (dy / d) * r;
      } else {
        // Centre inside the rect: push out along the smallest penetration axis.
        const pl = x - b.x + r, pr = b.x + b.w - x + r;
        const pt = y - b.y + r, pb = b.y + b.h - y + r;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.x - r;
        else if (m === pr) x = b.x + b.w + r;
        else if (m === pt) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
  }
  return { x, y, hit };
}
export function pointInBuilding(x, y, buildings) {
  for (const b of buildings) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return b;
  }
  return null;
}
