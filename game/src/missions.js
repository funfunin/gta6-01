// SOLMAR HEAT — the six-mission story: objectives, timers, rewards, save.
// Dana Vega, getaway driver in Solmar Bay. All names and places are invented.
import { dist, fmtTime } from './config.js';
import { PLACES } from './city.js';
import { makeCar, POLICE_COLOR } from './cars.js';
import { AudioSys } from './audio.js';

export const MISSIONS = [
  {
    id: 1, name: 'First Wheels', reward: 200,
    intro: 'Dana needs wheels. Steal a parked car and bring it to the Marina garage.',
    steps: [
      { type: 'steal', text: 'Steal a car — walk up to one and press E' },
      { type: 'reachCar', x: PLACES.marinaGarage.x, y: PLACES.marinaGarage.y, r: 110, text: 'Drive to the Marina garage' },
    ],
  },
  {
    id: 2, name: 'Package Run', reward: 350,
    intro: 'A package for the south side. Ninety seconds. Do not stop for anyone.',
    steps: [
      { type: 'reach', x: PLACES.packagePickup.x, y: PLACES.packagePickup.y, r: 80, text: 'Pick up the package at the Docks' },
      { type: 'deliver', x: PLACES.deliverySouth.x, y: PLACES.deliverySouth.y, r: 100, time: 90, text: 'Deliver the package — 90 seconds!' },
    ],
  },
  {
    id: 3, name: 'Lose the Tail', reward: 400,
    intro: 'Two stars and a tail you cannot shake by driving. Break line of sight and stay hidden.',
    steps: [
      { type: 'escape', time: 8, text: 'Stay out of sight for 8s' },
    ],
  },
  {
    id: 4, name: 'Bank Job', reward: 600,
    intro: 'The Solmar Bay Bank keeps its cash behind one sleepy guard. Get in on foot, grab it, run.',
    steps: [
      { type: 'reachFoot', x: PLACES.bank.x, y: PLACES.bank.y, r: 90, text: 'Reach the bank on foot' },
      { type: 'grab', x: PLACES.bank.x, y: PLACES.bank.y, r: 80, need: 2.5, text: 'Grab the cash — hold your ground' },
      { type: 'reachFoot', x: PLACES.getawayCar.x, y: PLACES.getawayCar.y, r: 90, text: 'Escape on foot to the getaway car' },
      { type: 'reachCar', x: PLACES.marinaGarage.x, y: PLACES.marinaGarage.y, r: 110, text: 'Drive to the Marina garage to lay low' },
    ],
  },
  {
    id: 5, name: 'Night Run', reward: 500, night: true,
    intro: 'A night delivery through the roadblocks. Headlights on, foot down, no stopping.',
    steps: [
      { type: 'reachCar', x: PLACES.roadblockA.x, y: PLACES.roadblockA.y, r: 110, text: 'Drive through the south roadblock' },
      { type: 'reachCar', x: PLACES.roadblockB.x, y: PLACES.roadblockB.y, r: 110, text: 'Drive through the north roadblock' },
      { type: 'reachCar', x: PLACES.deliverySouth.x, y: PLACES.deliverySouth.y, r: 100, text: 'Deliver to the south drop' },
    ],
  },
  {
    id: 6, name: 'The Yacht', reward: 1000,
    intro: 'The last job. Four stars, the whole city hunting Dana — get to the yacht at the Marina.',
    steps: [
      { type: 'steal', text: 'Steal a car — any car, fast' },
      { type: 'reachCar', x: PLACES.yacht.x, y: PLACES.yacht.y, r: 120, text: 'Drive to the yacht at the Marina' },
    ],
  },
];

export function startMission(S, id) {
  const def = MISSIONS.find((m) => m.id === id);
  if (!def) return false;
  // Clean slate: player on foot at the spawn, no police, no wanted heat.
  S.wanted = 0;
  S.hidden = 0;
  S.bustedT = 0;
  S.cars = S.cars.filter((c) => c.kind === 'parked' || (c.kind === 'civ' && c.driver === 'civ'));
  S.pickups = [];
  const p = S.player;
  p.onFoot = true;
  p.car = null;
  p.x = PLACES.spawn.x; p.y = PLACES.spawn.y; p.angle = 0; p.speed = 0;
  p.health = 100;
  S.night = !!def.night;
  S.mission = { def, step: 0, timer: 0, progress: 0, hiddenTime: 0 };
  if (id === 3) {
    S.wanted = 2;
    S.toast('Two stars! The police are on you — lose them.');
  }
  if (id === 6) {
    S.wanted = 4;
    S.toast('Four stars! The whole city is hunting Dana.');
  }
  if (id === 4) {
    // A getaway car waits near the bank.
    const gc = makeCar(PLACES.getawayCar.x, PLACES.getawayCar.y, Math.PI / 2, '#c94f42', 'parked', 'none');
    S.cars.push(gc);
  }
  if (id === 5) {
    // Two police roadblocks across the route.
    for (const rb of [PLACES.roadblockA, PLACES.roadblockB]) {
      const block = makeCar(rb.x, rb.y, 0, POLICE_COLOR, 'police', 'police');
      block.state = 'block';
      block.speed = 0;
      S.cars.push(block);
    }
  }
  S.toast('Mission ' + def.id + ': ' + def.name);
  return true;
}

function stepDone(S, step) {
  const p = S.player;
  switch (step.type) {
    case 'steal':
      return !p.onFoot;
    case 'reach':
      return dist(p.x, p.y, step.x, step.y) < step.r;
    case 'reachCar':
      return !p.onFoot && dist(p.x, p.y, step.x, step.y) < step.r;
    case 'reachFoot':
      return p.onFoot && dist(p.x, p.y, step.x, step.y) < step.r;
    case 'deliver':
      return dist(p.x, p.y, step.x, step.y) < step.r;
    case 'grab': {
      if (dist(p.x, p.y, step.x, step.y) < step.r) {
        S.mission.progress += 1 / 60;
        return S.mission.progress >= step.need;
      }
      S.mission.progress = Math.max(0, S.mission.progress - 1 / 30);
      return false;
    }
    case 'escape': {
      const nearest = S.nearestPolice === Infinity ? 9999 : S.nearestPolice;
      // Out of sight, or laying low in the Hideout (counts triple).
      const inHideout = dist(p.x, p.y, PLACES.hideout.x, PLACES.hideout.y) < 130;
      if (nearest > 650 || S.wanted === 0 || inHideout) S.mission.hiddenTime += (inHideout ? 3 : 1) / 60;
      else S.mission.hiddenTime = Math.max(0, S.mission.hiddenTime - 1 / 30);
      return S.mission.hiddenTime >= step.time;
    }
    default:
      return false;
  }
}

export function updateMission(S, dt) {
  const m = S.mission;
  if (!m) return;
  const step = m.def.steps[m.step];
  if (!step) return;
  // Timed steps count down in real seconds.
  if (step.time && (step.type === 'deliver')) {
    if (m.timer === 0) m.timer = step.time;
    m.timer -= dt;
    if (m.timer <= 0) {
      S.failMission('Out of time — the package never arrived.');
      return;
    }
  }
  // stepDone uses a fixed 1/60 tick for progress accumulation; scale by dt.
  if (step.type === 'grab' || step.type === 'escape') {
    // Recompute with real dt inside stepDone by calling it with a scaled loop.
    const sub = Math.max(1, Math.round(dt * 60));
    let done = false;
    for (let i = 0; i < sub; i++) { done = stepDone(S, step); if (done) break; }
    if (done) advance(S);
    return;
  }
  if (stepDone(S, step)) advance(S);
}

function advance(S) {
  const m = S.mission;
  m.step++;
  m.timer = 0;
  m.progress = 0;
  m.hiddenTime = 0;
  if (m.step >= m.def.steps.length) completeMission(S);
  else S.toast(m.def.steps[m.step].text);
}

function completeMission(S) {
  const m = S.mission;
  const def = m.def;
  S.player.cash += def.reward;
  S.save.cash = S.player.cash;
  S.save.unlocked = Math.max(S.save.unlocked, def.id + 1);
  S.save.best[def.id] = S.time;
  S.saveGame();
  S.mission = null;
  S.wanted = 0;
  S.night = false;
  AudioSys.missionDone();
  S.endScreen('Mission Complete', def.name + ' — Dana earned ' + def.reward + ' cash. Next mission unlocked.', 'complete', def.id);
}

export function currentObjective(S) {
  if (!S.mission) return 'Free roam — explore Solmar Bay. Press P for the menu.';
  const step = S.mission.def.steps[S.mission.step];
  if (!step) return '';
  let text = 'Mission ' + S.mission.def.id + ' · ' + S.mission.def.name + ' — ' + step.text;
  if (step.type === 'deliver' && S.mission.timer > 0) text += '  ⏱ ' + fmtTime(S.mission.timer);
  if (step.type === 'grab') text += '  (' + Math.ceil(S.mission.progress) + 's / ' + step.need + 's)';
  if (step.type === 'escape') text += '  (' + Math.max(0, step.time - S.mission.hiddenTime).toFixed(0) + 's to go)';
  return text;
}

export function missionMarker(S) {
  if (!S.mission) return null;
  const step = S.mission.def.steps[S.mission.step];
  if (!step || step.x === undefined) return null;
  return { x: step.x, y: step.y, r: step.r || 80 };
}
