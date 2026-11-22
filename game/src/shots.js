// The screenshot scenes behind ?shot=title|play|tension|escape. Each one plays the real rules forward
// from a fresh floor, steered by the game's own planner (autopilot.js) — the same code the title
// screen's attract run uses and the balance test measures. So a still frame is a moment that really
// happened in a run, never a pose, and the same seed always gives the same frame.
//
// There is exactly one pilot in this game. An earlier version of this file carried its own small
// pilot, which drifted from the real one: the escape scene showed a spotted shadow while the balance
// test reported a clean escape, because the two were playing two different games.
import { STEP } from './config.js';
import { EVENT_BUSTED, EVENT_ESCAPED, PACE_CROUCH, PACE_SPRINT } from './world.js';
import { SCREEN_CAUGHT, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { nextGoal, plan } from './autopilot.js';

/** One step of the real game, with the planner choosing the move and the pace. */
function step(world) {
  const move = plan(world.state, nextGoal(world.state));
  world.state.shadow.pace = move.pace;
  return world.step(STEP, { x: move.x, y: move.y }, false);
}

/** Run the whole floor with the planner until it ends or the clock runs out. */
function playFloor(world, maxSeconds) {
  const steps = Math.round(maxSeconds / STEP);
  let events = 0;
  for (let i = 0; i < steps; i += 1) {
    events = step(world);
    if (events & (EVENT_BUSTED | EVENT_ESCAPED)) break;
  }
  return events;
}

/**
 * Stage one screenshot: reset the floor, play it forward to the moment the scene wants, and hand back
 * the screen to paint, the record and the world clock.
 */
export function stageScene(name, world) {
  world.reset();

  if (name === 'title') {
    // The title: guards on their first legs, the shadow still in its cell, nothing seen or scored.
    for (let i = 0; i < 40; i += 1) world.step(STEP, { x: 0, y: 0 }, true);
    return { screen: SCREEN_TITLE, best: 0, time: world.state.elapsed };
  }

  if (name === 'tension') {
    // A real run, stopped at its most exposed instant: every step is replayed against the world it
    // actually produced, and the frame kept is the one where the meter has risen furthest. Breaking on
    // the first half-full meter is not enough — a planner that dodges well can cross a cone and be gone
    // again within two frames, so the peak is caught rather than a threshold.
    const steps = Math.round(120 / STEP);
    let best = null;
    let peak = 0;
    for (let i = 0; i < steps; i += 1) {
      const events = step(world);
      if (events & (EVENT_BUSTED | EVENT_ESCAPED)) break;
      if (world.state.exposure > 0.5 && world.state.exposure > peak) {
        peak = world.state.exposure;
        best = {
          x: world.state.shadow.x, y: world.state.shadow.y,
          guards: world.state.guards.map((guard) => ({ ...guard })),   // frozen for the repaint
          exposure: world.state.exposure, secured: world.state.secured,
          elapsed: world.state.elapsed, seen: true, inCover: world.state.inCover,
        };
      }
      if (world.state.exposure > 0.66) break;
    }
    if (best !== null) {
      // Put the floor back to the peak frame so the renderer paints that moment, not the one after it.
      world.state.shadow.x = best.x;
      world.state.shadow.y = best.y;
      world.state.exposure = best.exposure;
      world.state.secured = best.secured;
      world.state.elapsed = best.elapsed;
      world.state.seen = best.seen;
      world.state.inCover = best.inCover;
      world.state.guards = best.guards;
    }
    return { screen: SCREEN_PLAY, best: 0, time: world.state.elapsed };
  }

  if (name === 'escape') {
    // The whole floor, played by the real planner: the escape screen if it got out, and the spotted
    // screen honestly if a guard caught it on the way. Never a faked door.
    const events = playFloor(world, 180);
    const escaped = (events & EVENT_ESCAPED) !== 0;
    return {
      screen: escaped ? SCREEN_OVER : SCREEN_CAUGHT,
      best: world.state.secured,
      time: world.state.elapsed,
    };
  }

  // 'play' and anything unknown: the same run, stopped a little way in, so the frame shows a route
  // being walked rather than the start of one.
  const steps = Math.round(9 / STEP);
  let events = 0;
  for (let i = 0; i < steps; i += 1) {
    events = step(world);
    if (events & (EVENT_BUSTED | EVENT_ESCAPED)) break;
  }
  return { screen: SCREEN_PLAY, best: 0, time: world.state.elapsed };
}
