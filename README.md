# SOLMAR HEAT

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/funfunin/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/funfunin/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

**SOLMAR HEAT** — an open-world crime game in the fictional sun-soaked coastal
city of Solmar Bay. Pure HTML5 canvas + ES modules, no engine, no network, no
build step. All art is drawn in code, all sound is WebAudio synthesis.

You play Dana Vega, a getaway driver with one last debt to pay. Six story
missions stand between Dana and the yacht waiting at the Marina.

## The city

A road grid with five named districts — Marina, Old Town, Market Row, North
Hills and the Docks — plus a beach along the west edge, a park, traffic
lights, parked cars and distinct building colours per district. The map is
bigger than one screen; the camera follows Dana.

## Missions

1. **First Wheels** — steal a parked car and drive it to the Marina garage.
2. **Package Run** — deliver a package across town in 90 seconds.
3. **Lose the Tail** — escape a 2-star police chase: break line of sight and stay hidden for 8 seconds.
4. **Bank Job** — reach the bank on foot, grab the cash, escape on foot to a getaway car.
5. **Night Run** — a night-time delivery through roadblocks, headlights on.
6. **The Yacht** — final getaway to the yacht while a 4-star chase hunts you.

## Systems

- On-foot movement with run, and driving with acceleration, braking/reverse, steering and drift feel; collision with buildings and other cars.
- Traffic: civilian cars drive the road network, stop behind each other, honk; pedestrians walk the sidewalks and flee when scared.
- Car stealing: walk up to any parked or slow civilian car, press E — the driver bails out and the car is yours.
- Wanted level 0–5 stars: stealing, hitting a pedestrian, punching someone or ramming a police car raises it. Police spawn at the city edge, chase, ram and try to box you in; on foot they run you down. Break line of sight to cool down, or reach the Hideout.
- Combat on foot: punch (Space) with a short swing arc; a pedestrian who is hit falls and drops cash.
- HUD: wanted stars, health, cash, speed, mission objective, mission timer, and a live minimap showing Dana, the police, the mission marker and the city.
- Start screen with mission select (locked missions greyed out), Continue, New game; pause panel with help.
- Save in localStorage: unlocked missions, cash, best mission times.
- Day palette with warm sun and soft shadows; mission 5 uses a night palette with headlight cones.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot / drive |
| E | Enter, exit or steal a car |
| Space | Punch (on foot) |
| Shift | Run |
| P / Esc | Pause |
| M | Mute |

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

## Files

- `game/index.html` — canvas, HUD, start/pause overlays; loads `game/src/main.js`.
- `game/style.css` — full-screen canvas, HUD and overlay styling.
- `game/src/config.js` — tuning constants and helpers.
- `game/src/city.js` — map, roads, buildings, districts, named places.
- `game/src/cars.js` — traffic, parked cars, player driving physics, collisions.
- `game/src/people.js` — pedestrians.
- `game/src/police.js` — wanted level and police chase AI.
- `game/src/missions.js` — the six missions, objectives, timers, rewards.
- `game/src/audio.js` — WebAudio synth: engine, siren, impacts, music.
- `game/src/hud.js` — HUD and live minimap.
- `game/src/input.js` — keyboard state.
- `game/src/shots.js` — deterministic `?shot=` scenes for screenshots.
- `game/src/main.js` — game loop and state machine.
- `main.ts` — hands the game in: copies `game/` + `screenshots/` to `/output` and writes `dossier.json`.

Everything in this game is original: no names, logos, characters, maps, art,
music or assets from any commercial game.
