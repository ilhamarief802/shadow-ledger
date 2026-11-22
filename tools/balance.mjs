// Prove the floor is beatable and measure what a run looks like: run the real rules headless with the
// same autopilot the screenshots use, many seeds, and print whether it reached the door, how much it
// secured, how long it took and how often it was nearly caught. This is the balance test, not a demo:
// it imports the game's own modules, so a rule change that makes the floor unfair shows up here.
//
// Run with: node tools/balance.mjs [runs]
import { STEP } from '../game/src/config.js';
import { createWorld, EVENT_BUSTED, EVENT_ESCAPED } from '../game/src/world.js';
import { createRandom } from '../game/src/random.js';
import { nextGoal, plan } from '../game/src/autopilot.js';

function runOne(seed) {
  const world = createWorld(createRandom(seed));
  const state = world.state;
  let events = 0;
  let nearMisses = 0;
  let peak = 0;
  const steps = Math.round(240 / STEP);
  let sawLoot = 0;
  for (let i = 0; i < steps; i += 1) {
    // The same planner the screenshot scenes and the title screen use: one pilot, not two. A second
    // pilot here would measure a game nobody plays.
    const move = plan(state, nextGoal(state));
    state.shadow.pace = move.pace;
    events = world.step(STEP, { x: move.x, y: move.y }, false);
    nearMisses = state.nearMisses;
    peak = Math.max(peak, state.exposure);
    sawLoot = state.lootCount;
    if (events & (EVENT_BUSTED | EVENT_ESCAPED)) break;
  }
  return {
    seed,
    escaped: (events & EVENT_ESCAPED) !== 0,
    busted: (events & EVENT_BUSTED) !== 0,
    secured: state.secured,
    of: state.totalLoot,
    drops: sawLoot,
    seconds: Number(state.elapsed.toFixed(1)),
    peak: Number(peak.toFixed(2)),
    nearMisses,
  };
}

const runs = Number(process.argv[2] ?? 12);
const results = [];
for (let i = 0; i < runs; i += 1) results.push(runOne(1000 + i * 37));

const escaped = results.filter((r) => r.escaped);
const busted = results.filter((r) => r.busted);
console.log('runs', runs);
console.log('escaped', escaped.length, `(${Math.round((escaped.length / runs) * 100)}%)`);
console.log('busted', busted.length, `(${Math.round((busted.length / runs) * 100)}%)`);
console.log('timed out', runs - escaped.length - busted.length);
const avg = (list, key) => list.length === 0 ? 0 : (list.reduce((s, r) => s + r[key], 0) / list.length);
console.log('avg secured', avg(results, 'secured').toFixed(1), 'of', results[0].of);
console.log('avg drops', avg(results, 'drops').toFixed(1));
console.log('avg seconds', avg(results, 'seconds').toFixed(1));
console.log('avg peak exposure', avg(results, 'peak').toFixed(2));
console.log('avg near misses', avg(results, 'nearMisses').toFixed(1));
console.table(results);
