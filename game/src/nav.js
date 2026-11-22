// Navigation: a coarse walkability grid and a breadth-first search over it, so a route across the
// floor can be found (and proven to exist) rather than guessed. The autopilot behind the screenshots
// uses it, and the game itself uses it for the hint trail; the level is authored once, and this is the
// check that its rooms are actually connected.
import { circleHitsAny } from './geometry.js';
import { COVER, WALLS } from './level.js';
import { FIELD } from './config.js';

export const CELL = 16;
const BLOCKERS = [...WALLS, ...COVER];
const RADIUS = 12;

export const COLS = Math.floor(FIELD.width / CELL);
export const ROWS = Math.floor(FIELD.height / CELL);

/** The walkable grid: a cell is open when a body standing in it touches no blocker. */
function buildGrid() {
  const open = new Uint8Array(COLS * ROWS);
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const x = col * CELL + CELL / 2;
      const y = row * CELL + CELL / 2;
      open[row * COLS + col] = circleHitsAny(x, y, RADIUS, BLOCKERS) ? 0 : 1;
    }
  }
  return open;
}

export const GRID = buildGrid();

export function cellOf(x, y) {
  const col = Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL)));
  const row = Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL)));
  return row * COLS + col;
}

/** The world point at the middle of a cell. */
export function pointOf(index) {
  const col = index % COLS;
  const row = (index - col) / COLS;
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

export function walkable(index) {
  return GRID[index] === 1;
}

/** The nearest open cell to a point, searching rings outward: a drop or door may sit in a tight spot. */
export function nearestOpen(x, y) {
  const start = cellOf(x, y);
  if (walkable(start)) return start;
  const col = start % COLS;
  const row = (start - col) / COLS;
  for (let ring = 1; ring < 12; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const c = col + dx;
        const r = row + dy;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        const index = r * COLS + c;
        if (walkable(index)) return index;
      }
    }
  }
  return -1;
}

/**
 * A breadth-first route of world points from one point to another over the walkable grid, or an empty
 * array when the two cannot be joined. The first and last points are the requested ones.
 */
export function findPath(fromX, fromY, toX, toY) {
  const start = nearestOpen(fromX, fromY);
  const goal = nearestOpen(toX, toY);
  if (start < 0 || goal < 0) return [];
  if (start === goal) return [{ x: fromX, y: fromY }, { x: toX, y: toY }];

  const cameFrom = new Int32Array(COLS * ROWS).fill(-1);
  const seen = new Uint8Array(COLS * ROWS);
  const queue = new Int32Array(COLS * ROWS);
  let head = 0;
  let tail = 0;
  queue[tail] = start;
  tail += 1;
  seen[start] = 1;

  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let found = false;
  while (head < tail) {
    const current = queue[head];
    head += 1;
    if (current === goal) {
      found = true;
      break;
    }
    const col = current % COLS;
    const row = (current - col) / COLS;
    for (let s = 0; s < steps.length; s += 1) {
      const c = col + steps[s][0];
      const r = row + steps[s][1];
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      const next = r * COLS + c;
      if (seen[next] || !walkable(next)) continue;
      seen[next] = 1;
      cameFrom[next] = current;
      queue[tail] = next;
      tail += 1;
    }
  }

  if (!found) return [];

  const points = [];
  let current = goal;
  for (let guard = 0; guard < COLS * ROWS && current !== -1; guard += 1) {
    const col = current % COLS;
    const row = (current - col) / COLS;
    points.push({ x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 });
    if (current === start) break;
    current = cameFrom[current];
  }
  points.reverse();
  points[0] = { x: fromX, y: fromY };
  points[points.length - 1] = { x: toX, y: toY };
  return points;
}

/** True when a body can walk from one point to another without meeting a blocker. */
export function reachable(fromX, fromY, toX, toY) {
  return findPath(fromX, fromY, toX, toY).length > 0;
}

/**
 * The cells a guard's cone can actually see, as a per-cell danger weight: 1 where a body standing there
 * would be seen right now with a line of sight, 0 in the dark. Sampled per cell against the real
 * geometry (raycast), so cover works exactly as it does in the rules, not as a radius approximation.
 * `seenAt(x, y)` is the caller's test; it is passed in so the cone test has one owner (the planner).
 */
export function dangerField(seenAt) {
  const field = new Float32Array(COLS * ROWS);
  for (let index = 0; index < field.length; index += 1) {
    if (GRID[index] !== 1) continue;
    const point = pointOf(index);
    field[index] = seenAt(point.x, point.y) ? 1 : 0;
  }
  return field;
}

/**
 * The cheapest walkable route from a point to a point, where standing in a watched cell costs far more
 * than the detour around it. Pass a `danger` field from dangerField() and a `cost` per cell of being
 * seen, and a route of world points comes back (empty when no route exists).
 *
 * Dijkstra with a bucket queue: the weights are integers (1 per cell plus `penalty` for a watched
 * cell), so a bucket queue is exact here and much simpler than a binary heap.
 */
export function findSafePath(fromX, fromY, toX, toY, danger, penalty) {
  const start = nearestOpen(fromX, fromY);
  const goal = nearestOpen(toX, toY);
  if (start < 0 || goal < 0) return [];
  if (start === goal) return [{ x: fromX, y: fromY }, { x: toX, y: toY }];

  const total = COLS * ROWS;
  const best = new Float64Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  // Every step costs at least 1, so a cell is finalised at a weight no higher than this.
  const buckets = [];
  const push = (weight, index) => {
    const key = Math.round(weight);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(index);
  };

  best[start] = 1 + (danger[start] ? penalty : 0);
  push(best[start], start);

  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let found = false;
  for (let weight = 0; weight < buckets.length && !found; weight += 1) {
    const bucket = buckets[weight];
    if (!bucket) continue;
    for (let b = 0; b < bucket.length; b += 1) {
      const current = bucket[b];
      // Lazily skip an entry superseded by a cheaper one found later.
      if (best[current] < weight - 0.5) continue;
      if (current === goal) {
        found = true;
        break;
      }
      const col = current % COLS;
      const row = (current - col) / COLS;
      for (let s = 0; s < steps.length; s += 1) {
        const c = col + steps[s][0];
        const r = row + steps[s][1];
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        const next = r * COLS + c;
        if (!walkable(next)) continue;
        const weight_ = best[current] + 1 + (danger[next] ? penalty : 0);
        if (weight_ >= best[next]) continue;
        best[next] = weight_;
        cameFrom[next] = current;
        push(weight_, next);
      }
    }
  }

  if (!found) return [];
  const points = [];
  let current = goal;
  for (let limit = 0; limit < total && current !== -1; limit += 1) {
    points.push(pointOf(current));
    if (current === start) break;
    current = cameFrom[current];
  }
  points.reverse();
  points[0] = { x: fromX, y: fromY };
  points[points.length - 1] = { x: toX, y: toY };
  return points;
}
