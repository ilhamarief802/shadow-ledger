import { STEP } from '../game/src/config.js';
import { createWorld, EVENT_BUSTED, EVENT_ESCAPED } from '../game/src/world.js';
import { createRandom } from '../game/src/random.js';
import { drive, nextGoal, plan } from '../game/src/autopilot.js';

let escaped = 0;
let busted = 0;
let out = 0;
const rows = [];
for (let i = 0; i < 10; i += 1) {
  const seed = 1000 + i * 37;
  const world = createWorld(createRandom(seed));
  let events = 0;
  let peak = 0;
  for (let s = 0; s < 180 * 60; s += 1) {
    const move = plan(world.state, nextGoal(world.state));
    world.state.shadow.pace = move.pace;
    events = world.step(STEP, { x: move.x, y: move.y }, false);
    peak = Math.max(peak, world.state.exposure);
    if (events & 0b1100) break;
  }
  if (events & EVENT_ESCAPED) escaped += 1;
  else if (events & EVENT_BUSTED) busted += 1;
  else out += 1;
  rows.push({ seed, esc: !!(events & EVENT_ESCAPED), bust: !!(events & EVENT_BUSTED),
    secured: world.state.secured, of: world.state.totalLoot, t: +world.state.elapsed.toFixed(0),
    peak: +peak.toFixed(2) });
}
console.log(`escaped ${escaped}/10  busted ${busted}  timed out ${out}`);
for (const r of rows) console.log(JSON.stringify(r));
