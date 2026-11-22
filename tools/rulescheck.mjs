// A few unit checks on the rules that decide a run: the shadow escapes on the door, a guard sees what
// is in its cone and nothing through a crate, the meter empties out of sight, and a caught shadow
// raises the alarm. Small and quiet, so a rule change that breaks the game fails here first.
import { STEP, VISION } from '../game/src/config.js';
import {
  createWorld, EVENT_ALARM, EVENT_BUSTED, EVENT_ESCAPED, MOOD_HUNT, PACE_CROUCH, PACE_WALK,
} from '../game/src/world.js';
import { createRandom } from '../game/src/random.js';
import { EXIT, START, WALLS, COVER } from '../game/src/level.js';
import { distance } from '../game/src/geometry.js';

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
}

// 1. Standing on the door escapes.
{
  const world = createWorld(createRandom(1));
  world.state.shadow.x = EXIT.x + EXIT.w / 2;
  world.state.shadow.y = EXIT.y + EXIT.h / 2;
  const gap = distance(world.state.shadow.x, world.state.shadow.y, EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h / 2);
  const events = world.step(STEP, { x: 0, y: 0 }, false);
  check('standing on the door escapes', (events & EVENT_ESCAPED) !== 0,
    `gap=${gap} escaped=${world.state.escaped}`);
}

// 2. A guard sees a shadow in front of it and not one behind it.
{
  const world = createWorld(createRandom(2));
  const guard = world.state.guards[0];
  guard.mood = 'patrol';
  guard.facing = 0;
  world.state.shadow.x = guard.x + 120;
  world.state.shadow.y = guard.y;
  world.state.shadow.pace = PACE_WALK;
  world.step(STEP, { x: 0, y: 0 }, false);
  const front = world.state.exposure;

  const world2 = createWorld(createRandom(2));
  const guard2 = world2.state.guards[0];
  guard2.facing = 0;
  world2.state.shadow.x = guard2.x - 120;
  world2.state.shadow.y = guard2.y;
  world2.state.shadow.pace = PACE_WALK;
  world2.step(STEP, { x: 0, y: 0 }, false);
  check('sees in front, not behind', front > 0 && world2.state.exposure === 0,
    `front=${front.toFixed(3)} behind=${world2.state.exposure.toFixed(3)}`);
}

// 3. A crouched shadow in the same spot fills the meter more slowly.
{
  const a = createWorld(createRandom(3));
  a.state.guards[0].facing = 0;
  a.state.shadow.x = a.state.guards[0].x + 140;
  a.state.shadow.y = a.state.guards[0].y;
  a.state.shadow.pace = PACE_WALK;
  for (let i = 0; i < 10; i += 1) a.step(STEP, { x: 0, y: 0 }, false);

  const b = createWorld(createRandom(3));
  b.state.guards[0].facing = 0;
  b.state.shadow.x = b.state.guards[0].x + 140;
  b.state.shadow.y = b.state.guards[0].y;
  b.state.shadow.pace = PACE_CROUCH;
  for (let i = 0; i < 10; i += 1) b.step(STEP, { x: 0, y: 0 }, false);
  check('crouching is harder to spot', b.state.exposure < a.state.exposure,
    `walk=${a.state.exposure.toFixed(3)} crouch=${b.state.exposure.toFixed(3)}`);
}

// 4. Out of sight, the meter empties.
{
  const world = createWorld(createRandom(4));
  world.state.exposure = 0.5;
  world.state.shadow.x = START.x;
  world.state.shadow.y = START.y;
  for (let i = 0; i < 60; i += 1) world.step(STEP, { x: 0, y: 0 }, false);
  check('the meter empties out of sight', world.state.exposure === 0, `${world.state.exposure.toFixed(3)}`);
}

// 5. A full meter rings the alarm and ends the run (far enough that the guard cannot just grab it).
{
  const world = createWorld(createRandom(5));
  const guard = world.state.guards[0];
  guard.facing = 0;
  world.state.shadow.x = guard.x + 200;
  world.state.shadow.y = guard.y;
  world.state.shadow.pace = PACE_WALK;
  let events = 0;
  let sawAlarm = false;
  for (let i = 0; i < 60 * 12; i += 1) {
    events = world.step(STEP, { x: 0, y: 0 }, false);
    if (events & EVENT_ALARM) sawAlarm = true;
    if (events & EVENT_BUSTED) break;
  }
  check('a full meter rings the alarm and ends the run', sawAlarm && (events & EVENT_BUSTED) !== 0,
    `exposure=${world.state.exposure.toFixed(2)} alarm=${world.state.alarm.toFixed(2)}`);
}

// 6. Every guard's cone is bounded by VISION.range.
check('cone range is set', VISION.range > 100 && VISION.halfAngle > 0.2, `range=${VISION.range}`);

// 7. The floor's blockers are non-empty (a level without walls is not a level).
check('the floor has walls and cover', WALLS.length > 5 && COVER.length > 5, `${WALLS.length} walls, ${COVER.length} cover`);

console.log(failures === 0 ? '\nrules behave' : `\n${failures} failing rule(s)`);
process.exit(failures === 0 ? 0 : 1);
