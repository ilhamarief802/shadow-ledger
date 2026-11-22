import { STEP } from '../game/src/config.js';
import { createWorld } from '../game/src/world.js';
import { createRandom } from '../game/src/random.js';
import { nextGoal, plan } from '../game/src/autopilot.js';

// Reproduce the BROWSER lifecycle exactly: createWorld, then reset() (which stageScene always calls
// first), and only then run. My earlier seedhunt skipped the reset, so it measured a different floor.
function run(seed, doReset) {
  const world = createWorld(createRandom(seed));
  if (doReset) world.reset();
  let peak = 0, peakAt = 0, escaped = false;
  const steps = Math.round(180 / STEP);
  for (let i = 0; i < steps; i += 1) {
    const move = plan(world.state, nextGoal(world.state));
    world.state.shadow.pace = move.pace;
    const ev = world.step(STEP, { x: move.x, y: move.y }, false);
    if (world.state.exposure > peak) { peak = world.state.exposure; peakAt = world.state.elapsed; }
    if (ev & 0b1100) { escaped = !!(ev & 8); break; }
  }
  return { peak: Number(peak.toFixed(3)), peakAt: Number(peakAt.toFixed(1)), escaped, secured: world.state.secured };
}

console.log('seed 11 WITHOUT reset (what seedhunt measured):', JSON.stringify(run(11, false)));
console.log('seed 11 WITH reset (what the browser actually stages):', JSON.stringify(run(11, true)));

// Hunt seeds under the real lifecycle.
const found = [];
for (let seed = 1; seed <= 30 && found.length < 8; seed += 1) {
  const r = run(seed, true);
  if (r.peak >= 0.6) found.push({ seed, ...r });
}
console.log('heated seeds under the real lifecycle:', JSON.stringify(found, null, 1));
