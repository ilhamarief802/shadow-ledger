// Check the level's own connectivity: every drop, the start and the door must be reachable from the
// start over the walkable grid, and each of the four guard routes must be on walkable floor. A level
// that fails this is unwinnable, so this runs before any balance test.
import { findPath } from '../game/src/nav.js';
import { COVER, EXIT, GUARDS, LOOT, START, WALLS } from '../game/src/level.js';
import { circleHitsAny } from '../game/src/geometry.js';

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
}

const BLOCKERS = [...WALLS, ...COVER];

// 1. The start and the door stand on open floor.
check('start is clear', !circleHitsAny(START.x, START.y, 12, BLOCKERS));
check('exit is clear', !circleHitsAny(EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h / 2, 12, BLOCKERS));

// 2. Every drop is reachable from the start.
for (const drop of LOOT) {
  const path = findPath(START.x, START.y, drop.x, drop.y);
  check(`drop ${drop.name} at ${drop.x},${drop.y} reachable`, path.length > 0, `${path.length} points`);
}

// 3. The door is reachable from the start.
const toExit = findPath(START.x, START.y, EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h / 2);
check('exit reachable from start', toExit.length > 0, `${toExit.length} points`);

// 4. Every guard route point stands on walkable floor.
for (const guard of GUARDS) {
  for (const point of guard.route) {
    check(`${guard.name} route point ${point.x},${point.y} clear`, !circleHitsAny(point.x, point.y, 11, BLOCKERS));
  }
}

console.log(failures === 0 ? '\nlevel is winnable' : `\n${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);
