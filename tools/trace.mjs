import { STEP } from '../game/src/config.js';
import { createWorld, EVENT_BUSTED, EVENT_ESCAPED } from '../game/src/world.js';
import { createRandom } from '../game/src/random.js';
import { nextGoal, plan, watched } from '../game/src/autopilot.js';
import { distance } from '../game/src/geometry.js';

const seed = Number(process.argv[2] ?? 1037);
const world = createWorld(createRandom(seed));
let lastKey = '';
let stillFor = 0;
let last = { x: 0, y: 0 };
for (let s = 0; s < 60 * 200; s += 1) {
  const goal = nextGoal(world.state);
  const move = plan(world.state, goal);
  world.state.shadow.pace = move.pace;
  const ev = world.step(STEP, { x: move.x, y: move.y }, false);
  const st = world.state;
  const moved = distance(st.shadow.x, st.shadow.y, last.x, last.y);
  last = { x: st.shadow.x, y: st.shadow.y };
  stillFor = moved < 0.4 ? stillFor + STEP : 0;
  if (s % 30 === 0 || goal.key !== lastKey || ev) {
    const near = st.guards
      .map((g) => ({ n: g.name.split(' ')[1], d: Math.round(distance(g.x, g.y, st.shadow.x, st.shadow.y)), m: g.mood }))
      .sort((a, b) => a.d - b.d)[0];
    console.log((s / 60).toFixed(1), 'sh', Math.round(st.shadow.x), Math.round(st.shadow.y),
      'goal', goal.key, 'mv', move.x.toFixed(2), move.y.toFixed(2), 'still', stillFor.toFixed(1),
      'exp', st.exposure.toFixed(2), 'seen', watched(st, st.shadow.x, st.shadow.y),
      'near', near.n, near.d, near.m, ev ? `EV${ev}` : '');
    lastKey = goal.key;
  }
  if (ev & 0b1100) { console.log('END', ev, (s / 60).toFixed(1)); break; }
}
