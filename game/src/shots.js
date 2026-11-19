// SOLMAR HEAT — deterministic ?shot= scenes for screenshots.
// Each scene sets up a fixed game state so the four screenshots are
// reproducible: start / chase / street / mission.
import { mulberry32 } from './config.js';
import { PLACES } from './city.js';
import { makeCar, POLICE_COLOR } from './cars.js';
import { startMission } from './missions.js';

function putPlayerInCar(S, x, y, angle, color) {
  const car = makeCar(x, y, angle, color || '#c94f42', 'civ', 'player');
  car.speed = 0;
  S.cars.push(car);
  const p = S.player;
  p.onFoot = false;
  p.car = car;
  p.x = x; p.y = y; p.angle = angle; p.speed = 0;
  return car;
}

export function setupShot(S) {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot) return false;
  const seed = parseInt(q.get('seed') || '1', 10);
  S.rng = mulberry32(seed);
  S.shot = shot;
  S.mode = 'playing';
  S.time = 12;

  if (shot === 'start') {
    // Start screen over the Marina.
    S.mode = 'start';
    S.cam.x = 0;
    S.cam.y = 120;
    return true;
  }

  if (shot === 'chase') {
    // Mission 3 in progress: 3 stars, three police cars closing in.
    startMission(S, 3);
    S.wanted = 3;
    putPlayerInCar(S, 1250, 1350, 0, '#c94f42');
    S.player.car.speed = 300;
    const spots = [
      { x: 950, y: 1350, a: 0 },
      { x: 1520, y: 1150, a: Math.PI * 0.8 },
      { x: 1120, y: 1620, a: -Math.PI * 0.6 },
    ];
    for (const s of spots) {
      const pc = makeCar(s.x, s.y, s.a, POLICE_COLOR, 'police', 'police');
      pc.maxSpeed = 460;
      pc.speed = 330;
      pc.state = 'chase';
      S.cars.push(pc);
    }
    // A couple of civilians scattering ahead.
    const civ1 = makeCar(1560, 1350, 0, '#4a7fb5', 'civ', 'civ');
    civ1.axis = 'h'; civ1.road = 2; civ1.dir = 1; civ1.speed = 140;
    S.cars.push(civ1);
    const civ2 = makeCar(1300, 1050, Math.PI / 2, '#d9a441', 'civ', 'civ');
    civ2.axis = 'v'; civ2.road = 2; civ2.dir = 1; civ2.speed = 120;
    S.cars.push(civ2);
    clearToast();
    return true;
  }

  if (shot === 'street') {
    // Free roam on foot on Market Row: traffic and pedestrians around Dana.
    S.mission = null;
    S.wanted = 0;
    S.night = false;
    const p = S.player;
    p.onFoot = true;
    p.car = null;
    p.x = 1238; p.y = 860; p.angle = Math.PI / 2;
    p.health = 100;
    const civ1 = makeCar(1300, 700, Math.PI / 2, '#7ba05b', 'civ', 'civ');
    civ1.axis = 'v'; civ1.road = 2; civ1.dir = 1; civ1.speed = 130;
    S.cars.push(civ1);
    const civ2 = makeCar(1300, 1020, -Math.PI / 2, '#8e6bb5', 'civ', 'civ');
    civ2.axis = 'v'; civ2.road = 2; civ2.dir = -1; civ2.speed = 120;
    S.cars.push(civ2);
    const civ3 = makeCar(1560, 1200, Math.PI, '#c9c9c9', 'civ', 'civ');
    civ3.axis = 'h'; civ3.road = 2; civ3.dir = -1; civ3.speed = 110;
    S.cars.push(civ3);
    return true;
  }

  if (shot === 'mission') {
    // Mission 2 mid-delivery: Dana in a car, package on board, timer running,
    // delivery marker visible just ahead to the south.
    startMission(S, 2);
    S.mission.step = 1;
    S.mission.timer = 62;
    // On the road south toward the drop, marker visible ahead.
    putPlayerInCar(S, 800, 1750, Math.PI / 2, '#4a7fb5');
    S.player.car.speed = 260;
    const civ1 = makeCar(1300, 1650, 0, '#d9577e', 'civ', 'civ');
    civ1.axis = 'h'; civ1.road = 3; civ1.dir = 1; civ1.speed = 130;
    S.cars.push(civ1);
    clearToast();
    return true;
  }

  return true;
}

function clearToast() {
  const t = document.getElementById('toast');
  if (t) t.classList.remove('show');
}
