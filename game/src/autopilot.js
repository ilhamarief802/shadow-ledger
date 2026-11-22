// A planner that plays the floor the way a careful person does: it plans a route that keeps out of the
// cones rather than feeling its way one step at a time. Each frame it samples which cells of the
// walkable grid a guard can see right now (the real cone test, with the real cover), prices a watched
// cell far higher than the detour around it, and searches for the cheapest route to the goal. The
// shadow then follows that route, and drifts back onto it when a guard pushes it off.
//
// Why a route and not a step: from one cell away, two steps can look equally safe and the one that
// walks straight into a cone two seconds later wins. A route knows the cone is there and goes round.
//
// Four habits, in order:
//   1. A route, not attraction. Walls cost a detour instead of a stall.
//   2. Watched costs more than long. A cell a guard can see is priced at hundreds of steps, so a safe
//      detour always beats a shortcut through a cone — and when the whole floor is watched (an alarm
//      has the house looking), the cheapest route is still returned rather than none.
//   3. Never lock up. No progress for a while and the goal is set aside for the next reachable one; a
//      guard already hunting drops the route and the shadow runs for the nearest cover away from it.
//   4. Plan on a beat. The cone field is rebuilt a few times a second, not every frame, so a whole run
//      costs a few hundred small searches rather than tens of thousands.
//
// Two jobs: the title screen plays a real run with it (the attract screen is a run, not a pose), and
// the screenshot scenes behind ?shot= use it, so a still frame is a moment that really happened.
import { PLAYER, STEP, VISION } from './config.js';
import { COVER, EXIT, WALLS } from './level.js';
import { circleHitsAny, distance, raycast } from './geometry.js';
import {
  CELL, COLS, GRID, ROWS, cellOf, dangerField, findSafePath, nearestOpen, pointOf, walkable,
} from './nav.js';
import {
  MOOD_HUNT, MOOD_PATROL, PACE_CROUCH, PACE_SPRINT, PACE_WALK,
} from './world.js';

const BLOCKERS = [...WALLS, ...COVER];
/** How close to a waypoint counts as reached, and how far off the route still counts as on it. */
const ARRIVE = 20;
const OFF_ROUTE = 52;
/** Seconds without progress before the current goal is set aside. */
const STALL_LIMIT = 2.2;
/** Seconds a goal that stalled stays set aside. */
const SHELVE = 6.0;
/** How many plan-and-replan ticks a second, and the cost of one cell inside a cone. */
const PLAN_HZ = 6;
const WATCHED_COST = 420;
/** The eight ways it may step, so it can slip along a wall instead of sticking on it. */
const DIRECTIONS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071],
];

/**
 * Per-run planner memory, kept beside the state rather than inside it, so the rules stay the rules.
 * Keyed by the state object, so a new world starts clean and nothing leaks between runs.
 */
export const MEMORY = new WeakMap();

function memoryOf(state) {
  let memory = MEMORY.get(state);
  if (memory === undefined) {
    memory = {
      route: null,
      key: null,
      index: 0,
      danger: null,
      planClock: 0,
      planCell: -1,
      /** goalKey -> seconds until it may be tried again. */
      shelved: new Map(),
      lastPosition: { x: state.shadow.x, y: state.shadow.y },
      still: 0,
    };
    MEMORY.set(state, memory);
  }
  return memory;
}

/** True when the point is inside any guard's cone right now, with a line of sight. */
export function watched(state, x, y) {
  for (const guard of state.guards) {
    const dx = x - guard.x;
    const dy = y - guard.y;
    const range = Math.hypot(dx, dy);
    if (range > VISION.range || range < 1) continue;
    let off = Math.atan2(dy, dx) - guard.facing;
    while (off > Math.PI) off -= Math.PI * 2;
    while (off <= -Math.PI) off += Math.PI * 2;
    if (Math.abs(off) > VISION.halfAngle) continue;
    const hit = raycast(guard.x, guard.y, dx / range, dy / range, BLOCKERS, range);
    if (hit >= range - 1) return true;
  }
  return false;
}

/** The nearest guard that is hunting, or null: a hunt is the one case where the cone stops mattering. */
function closestHunting(state) {
  let nearest = null;
  let gap = Infinity;
  for (const guard of state.guards) {
    if (guard.mood !== MOOD_HUNT) continue;
    const range = distance(state.shadow.x, state.shadow.y, guard.x, guard.y);
    if (range < gap) {
      gap = range;
      nearest = guard;
    }
  }
  return nearest;
}

/**
 * The step: follow the waypoint, never step into a cone if a clear step exists, and never ask for a
 * step longer than the one that was tested.
 *
 * That last clause is the bug this function had: it tested every direction at a walk's stride and
 * then returned a sprint, so during a chase the world moved 5px where the planner had cleared 2.8px.
 * The body reached 0.2px into a wall, the move was refused, and the shadow pinned there for the rest
 * of the run — a stall that looked like bad navigation and was arithmetic. Each direction is now
 * tested at the stride its pace will actually take, and a direction that only fits at a walk is
 * returned as a walk.
 */
function chooseStep(state, waypoint, hunting) {
  const shadow = state.shadow;
  const strides = hunting
    ? [{ pace: PACE_SPRINT, length: PLAYER.sprint * STEP }, { pace: PACE_WALK, length: PLAYER.walk * STEP }]
    : [{ pace: PACE_WALK, length: PLAYER.walk * STEP }];

  // One candidate per direction, at the longest stride that direction actually fits through.
  const options = [];
  for (const direction of DIRECTIONS) {
    for (const stride of strides) {
      const x = shadow.x + direction[0] * stride.length;
      const y = shadow.y + direction[1] * stride.length;
      if (circleHitsAny(x, y, shadow.radius, BLOCKERS)) continue;
      options.push({
        x, y, dx: direction[0], dy: direction[1], pace: stride.pace,
        progress: distance(shadow.x, shadow.y, waypoint.x, waypoint.y)
          - distance(x, y, waypoint.x, waypoint.y),
        watched: watched(state, x, y),
      });
      break; // the longest stride that fits is the one to keep
    }
  }
  if (options.length === 0) return { x: 0, y: 0, pace: PACE_CROUCH };

  // A resting step, never into a cone: the one the shadow takes when nothing better is safe.
  const safe = options.filter((option) => !option.watched);

  if (safe.length > 0) {
    // Of the steps no cone can see, the one that gets nearest the waypoint; on a tie, the first.
    let best = safe[0];
    for (let index = 1; index < safe.length; index += 1) {
      if (safe[index].progress > best.progress + 1e-9) best = safe[index];
    }
    // Standing still in the dark beats walking through a cone, but only when no safe step progresses.
    if (best.progress <= 0 && !watched(state, shadow.x, shadow.y)) {
      return { x: 0, y: 0, pace: PACE_CROUCH };
    }
    // The pace is the one this step was tested at, so the world can never move further than the planner
    // checked: a sprint through a gap that only fits a walk is returned as a walk.
    return { x: best.dx, y: best.dy, pace: best.pace };
  }

  // Every way is watched: take the one that spends least of the next moment seen, and keep moving.
  let best = null;
  for (const option of options) {
    if (option.progress <= 0) continue;
    if (best === null || option.progress > best.progress) best = option;
  }
  if (best) return { x: best.dx, y: best.dy, pace: best.pace };
  return { x: 0, y: 0, pace: PACE_CROUCH };
}

/**
 * The step the planner wants, given where it is trying to get to. `goal` is {x, y, key}. The route is
 * replanned on a beat, and only sooner when the goal changes or the shadow leaves it.
 */
export function plan(state, goal) {
  const memory = memoryOf(state);
  const shadow = state.shadow;
  const hunting = closestHunting(state) !== null;

  // Progress bookkeeping: a planner that has not moved in STALL_LIMIT seconds must change its mind.
  const moved = distance(shadow.x, shadow.y, memory.lastPosition.x, memory.lastPosition.y);
  memory.lastPosition = { x: shadow.x, y: shadow.y };
  memory.still = moved < 0.4 ? memory.still + STEP : 0;

  if (memory.still > STALL_LIMIT && memory.key) {
    memory.shelved.set(memory.key, SHELVE);
    memory.still = 0;
    memory.route = null;
    memory.key = null;
    memory.danger = null;
  }
  for (const [key, left] of memory.shelved) {
    const next = left - STEP;
    if (next <= 0) memory.shelved.delete(key);
    else memory.shelved.set(key, next);
  }

  const cell = cellOf(shadow.x, shadow.y);
  const onRoute = memory.route !== null && memory.index < memory.route.length
    && distance(shadow.x, shadow.y, memory.route[memory.index].x, memory.route[memory.index].y) <= OFF_ROUTE;

  memory.planClock -= STEP;
  const replan = memory.route === null || memory.key !== goal.key || !onRoute
    || memory.planClock <= 0 || cell !== memory.planCell;

  if (replan) {
    const seenAt = (x, y) => watched(state, x, y);
    memory.danger = dangerField(seenAt);
    memory.planClock = 1 / PLAN_HZ;
    memory.planCell = cell;
    memory.key = goal.key;

    const from = nearestOpen(shadow.x, shadow.y);
    const to = nearestOpen(goal.x, goal.y);
    // A hunt widens the penalty: being seen now costs more than any detour.
    const penalty = hunting ? WATCHED_COST * 3 : WATCHED_COST;
    const route = (from >= 0 && to >= 0 && walkable(from) && walkable(to))
      ? findSafePath(shadow.x, shadow.y, goal.x, goal.y, memory.danger, penalty)
      : [];
    memory.route = route.length > 0 ? route : null;

    // Keep the shadow's progress along the new route rather than restarting it.
    memory.index = 0;
    if (memory.route) {
      let bestGap = Infinity;
      for (let index = 0; index < memory.route.length; index += 1) {
        const gap = distance(shadow.x, shadow.y, memory.route[index].x, memory.route[index].y);
        if (gap < bestGap) {
          bestGap = gap;
          memory.index = index;
        }
      }
    }
  }

  if (memory.route === null) {
    // No route at all (a sealed room or a goal in a wall): never grind, just take the best local step.
    return chooseStep(state, goal, hunting);
  }

  // Follow the route: step the waypoint forward while it is reached.
  while (memory.index < memory.route.length - 1
    && distance(shadow.x, shadow.y, memory.route[memory.index].x, memory.route[memory.index].y) < ARRIVE) {
    memory.index += 1;
  }
  const waypoint = memory.route[Math.min(memory.index, memory.route.length - 1)];
  return chooseStep(state, waypoint, hunting);
}

/**
 * The next thing the planner would go for: the nearest drop it can reach that is not set aside, else the
 * door. The goal carries a key, so the route survives between frames.
 */
export function nextGoal(state) {
  const memory = memoryOf(state);
  let best = null;
  let bestGap = Infinity;
  for (const drop of state.loot) {
    if (drop.taken) continue;
    const key = `drop:${drop.x},${drop.y}`;
    if (memory.shelved.has(key)) continue;
    const gap = distance(state.shadow.x, state.shadow.y, drop.x, drop.y);
    if (gap < bestGap) {
      bestGap = gap;
      best = { x: drop.x, y: drop.y, key };
    }
  }
  if (best) return best;
  return { x: EXIT.x + EXIT.w / 2, y: EXIT.y + EXIT.h / 2, key: 'exit' };
}

/**
 * Play the floor forward for `seconds` with the planner driving, returning the last step's events.
 * Used by the screenshot scenes and the balance test: there is no second simulation hidden here, it is
 * the same world.step the player's keys feed.
 */
export function drive(world, seconds) {
  let events = 0;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const move = plan(world.state, nextGoal(world.state));
    world.state.shadow.pace = move.pace;
    events = world.step(STEP, { x: move.x, y: move.y }, false);
    if (events & 0b1100) break; // escaped (8) or busted (4): the run is over
  }
  return events;
}
