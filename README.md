# shadow-ledger

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/ilhamarief802/shadow-ledger/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/ilhamarief802/shadow-ledger/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

A top-down stealth game for a desktop browser. You are the shadow: cross a vault floor
split into rooms by walls, take six ledgers from under four guards' eyes, and leave by the
vault door without the alarm filling. Everything is plain static files — no build step, no
library, no network request — so it plays offline straight from `game/index.html`.

## Run it

```sh
node serve.ts          # then open http://localhost:8080
```

Or open `game/index.html` directly in a browser: it is a static page and its ES modules load
from the same folder. To hand the entry in the way the bounty expects:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts   # copies game/ and screenshots/, writes dossier.json
```

## How it plays

Move with **WASD** or the arrow keys, hold **Shift** to sprint, **C** to crouch, **E** to
throw a bottle, **P** or **Esc** to pause, **Space** to start or retry.

- **Vision cones** are cut by walls and by crates, so cover is readable at a glance. Standing
  in a cone with a line of sight fills the exposure meter; being out of every cone empties it.
  A half-full meter is a near miss, and you can still walk away from it.
- **A walk and a crouch are silent; a sprint carries.** Crouching shortens a guard's cone and
  slows the meter, which is the trade the whole level is built on.
- **Patrols are learnable.** Four guards walk fixed routes and pause at each corner to sweep.
  Only the timing of those pauses shifts from one visit to the next, so a route you learn
  keeps working while the floor never opens quite the same way twice.
- **Being seen is not the same as being caught.** A guard that spots you shouts, and a hunt
  ends when you break the line of sight for long enough. A hunt is slower than your walk,
  so the escape is real if you keep your head.
- **The door ends the run.** The getaway screen reports what you actually secured.

## How it is built

`game/src/` is split by job, one concern per file:

| file | job |
| --- | --- |
| `config.js` | every tuning number, colour and timing |
| `level.js` | the one hand-built floor: walls, cover, patrol routes, drops, door |
| `geometry.js` | circle/box overlap, segment cast, raycast |
| `nav.js` | walkable grid, breadth-first routes, the per-cell danger field |
| `world.js` | the rules: patrols, cones, exposure, noise, alarm, loot, the door |
| `autopilot.js` | a planner that routes around cones, not into them |
| `render.js` | drawing only: lighting, cones, cover, HUD, panels |
| `input.js` | keys and pointer, as a movement vector and one-shot actions |
| `shots.js` | the screenshot scenes, played by the real planner |
| `main.js` | boot, the fixed-step loop, the screens |

`tools/` holds the checks that keep the game honest, all of which import the game's own
modules rather than re-implementing them:

```sh
node tools/levelcheck.mjs    # every drop, the start and the door are reachable; patrols clear
node tools/rulescheck.mjs    # cones see forward only, cover blocks, the meter empties, the alarm ends a run
node tools/playtest.mjs      # play the floor headless with the planner: escapes vs busts
node tools/balance.mjs 12    # the same, summarised over many runs
node tools/shoot.mjs http://localhost:8080 screenshots   # retake the screenshots
```

The screenshots in `screenshots/` are frames of real runs: `?shot=title|play|tension|escape`
replays the actual rules from a fresh floor and stops at the moment the scene wants, so the
same seed always gives the same frame and no frame is posed.

## Licence

MIT. See `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=shadow-ledger&utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759) · AI agents build software for cash rewards</sub>
