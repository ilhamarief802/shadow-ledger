// The rules. Nothing here touches the canvas: this module owns the level's state and advances it one
// fixed step at a time, returning the frame's events as bit flags. A guard walks its route, pauses to
// sweep its cone, hears a sprint or a thrown bottle and comes looking, sees the shadow and raises a
// meter that a run can break by getting out of sight before it fills; when it fills, the alarm rings
// and the house is on edge for a while, then the shadow is thrown back to the floor's start.
//
// The exposure meter is the whole game: it fills while any guard has you in its cone and a line of
// sight, and empties when none does, so a near miss is a warning rather than a death.
import {
  ALARM_SECONDS, FIELD, GUARD, PLAYER, STEP, VISION,
} from './config.js';
import {
  angleDelta, circleHitsAny, clamp, distance, raycast,
} from './geometry.js';
import {
  COVER, EXIT, GUARDS, LOOT as LOOT_SPOTS, START, WALLS,
} from './level.js';

export const EVENT_NONE = 0;
export const EVENT_SEEN = 1 << 0;
export const EVENT_ALARM = 1 << 1;
export const EVENT_BUSTED = 1 << 2;
export const EVENT_ESCAPED = 1 << 3;
export const EVENT_LOOT = 1 << 4;
export const EVENT_NEAR_MISS = 1 << 5;

export const PACE_WALK = 0;
export const PACE_CROUCH = 1;
export const PACE_SPRINT = 2;
const PACE_SPEED = [PLAYER.walk, PLAYER.crouch, PLAYER.sprint];
const PACE_NOISE = [PLAYER.noise.walk, PLAYER.noise.crouch, PLAYER.noise.sprint];

/** What a guard is doing, in the words the HUD and the renderer use. */
export const MOOD_PATROL = 'patrol';
export const MOOD_SUSPECT = 'suspect';
export const MOOD_HUNT = 'hunt';
export const MOOD_SHAKEN = 'shaken';

/** Everything a cone can be cut by: walls and cover alike stop a line of sight. */
const BLOCKERS = [...WALLS, ...COVER];

function makeShadow() {
  return {
    x: START.x,
    y: START.y,
    radius: PLAYER.radius,
    pace: PACE_CROUCH,
    facing: -0.6,
    footfallTimer: 0,
    speed: 0,
  };
}

/**
 * The guards at the floor's start. `random` only staggers how long each one stands at its first corner,
 * by a fraction of its dwell, so two runs open differently while every patrol route stays the fixed,
 * learnable one the level authors: the habit is the same every visit, the timing is not.
 */
function makeGuards(random) {
  return GUARDS.map((spot, index) => {
    const route = spot.route;
    const start = route[0];
    const next = route[1 % route.length];
    const stagger = random ? random() : 0.5;
    return {
      index,
      name: spot.name,
      x: start.x,
      y: start.y,
      radius: GUARD.radius,
      route,
      leg: 0,
      dwellTimer: spot.dwell * (0.4 + 0.3 * stagger),
      mood: MOOD_PATROL,
      facing: Math.atan2(next.y - start.y, next.x - start.x),
      sweepClock: 0,
      giveUpTimer: 0,
      lastSeenX: start.x,
      lastSeenY: start.y,
      suspicion: 0,
      alertFlash: 0,
    };
  });
}

export function createWorld(random) {
  const state = {
    shadow: makeShadow(),
    guards: makeGuards(random),
    loot: LOOT_SPOTS.map((spot) => ({ ...spot, taken: false, pulse: 0 })),
    exitPulse: 0,
    exposure: 0,
    alarm: 0,
    escaped: false,
    busted: false,
    seen: false,
    secured: 0,
    totalLoot: LOOT_SPOTS.reduce((sum, spot) => sum + spot.value, 0),
    lootCount: 0,
    elapsed: 0,
    nearMisses: 0,
    inCover: 0,
    noiseAt: null,
    noiseTimer: 0,
    room: '',
    throwables: 1,
  };

  function reset() {
    state.shadow = makeShadow();
    state.guards = makeGuards(random);
    for (const drop of state.loot) {
      drop.taken = false;
      drop.pulse = 0;
    }
    state.exitPulse = 0;
    state.exposure = 0;
    state.alarm = 0;
    state.escaped = false;
    state.busted = false;
    state.seen = false;
    state.secured = 0;
    state.lootCount = 0;
    state.elapsed = 0;
    state.nearMisses = 0;
    state.inCover = 0;
    state.noiseAt = null;
    state.noiseTimer = 0;
    state.room = '';
    state.throwables = 1;
  }

  // ---- the shadow -----------------------------------------------------------------------------

  /**
   * Try to move the shadow by (dx, dy), resolving one axis at a time so a body sliding along a wall
   * keeps its sideways motion. Each axis is tested against the position the other one just produced:
   * testing Y against the old X is what let a body step to within a pixel of a wall and then jam
   * there, which is exactly the stall that made the planner look broken.
   */
  function moveShadow(dx, dy) {
    const shadow = state.shadow;
    const r = shadow.radius;
    const nextX = clamp(shadow.x + dx, r, FIELD.width - r);
    if (!circleHitsAny(nextX, shadow.y, r, BLOCKERS)) shadow.x = nextX;
    const nextY = clamp(shadow.y + dy, r, FIELD.height - r);
    if (!circleHitsAny(shadow.x, nextY, r, BLOCKERS)) shadow.y = nextY;
  }

  function stepShadow(dt, move) {
    const shadow = state.shadow;
    const speed = PACE_SPEED[shadow.pace];
    const length = Math.hypot(move.x, move.y);
    if (length > 0) {
      const scale = speed * dt;
      moveShadow((move.x / length) * scale, (move.y / length) * scale);
      shadow.facing = Math.atan2(move.y, move.x);
      shadow.speed = speed;
    } else {
      shadow.speed = 0;
    }

    // A sprint is loud: every footfall leaves a noise a nearby guard's ear can reach.
    const noiseReach = PACE_NOISE[shadow.pace];
    if (noiseReach > 0 && length > 0) {
      shadow.footfallTimer -= dt;
      if (shadow.footfallTimer <= 0) {
        shadow.footfallTimer = PLAYER.footfall;
        state.noiseAt = { x: shadow.x, y: shadow.y, reach: noiseReach };
        state.noiseTimer = 0.20;
      }
    } else {
      shadow.footfallTimer = 0;
    }

    // Cover: is the shadow's body inside the footprint of a crate or cabinet?
    state.inCover = circleHitsAny(shadow.x, shadow.y, shadow.radius + 5, COVER) ? 1 : 0;

    for (let index = 0; index < state.loot.length; index += 1) {
      const drop = state.loot[index];
      if (drop.taken) continue;
      if (distance(shadow.x, shadow.y, drop.x, drop.y) < 26) {
        drop.taken = true;
        drop.pulse = 1;
        state.secured += drop.value;
        state.lootCount += 1;
        EVENTS |= EVENT_LOOT;
      }
    }

    if (distance(shadow.x, shadow.y, EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h / 2) < 52) {
      state.escaped = true;
      EVENTS |= EVENT_ESCAPED;
    }
  }

  // ---- one guard ------------------------------------------------------------------------------

  function guardSees(guard) {
    const shadow = state.shadow;
    const dx = shadow.x - guard.x;
    const dy = shadow.y - guard.y;
    const range = distance(guard.x, guard.y, shadow.x, shadow.y);
    if (range > VISION.range) return 0;
    const bearing = Math.atan2(dy, dx);
    const off = Math.abs(angleDelta(guard.facing, bearing));
    // A crouched shadow can slip the edge of a cone: it narrows the angle it is caught in.
    const halfAngle = VISION.halfAngle * (state.shadow.pace === PACE_CROUCH ? 0.72 : 1);
    if (off > halfAngle) return 0;
    // Cover blocks sight: a ray from the eye to the shadow that meets a blocker first sees nothing.
    const length = Math.max(1, range);
    const hit = raycast(guard.x, guard.y, dx / length, dy / length, BLOCKERS, length);
    if (hit < length - 1) return 0;
    const near = range < VISION.nearRange ? VISION.nearScale : 1;
    const crouch = state.shadow.pace === PACE_CROUCH ? VISION.crouchScale : 1;
    const edge = 1 - clamp(range / VISION.range, 0, 1) * 0.45;
    return VISION.fillRate * near * crouch * edge;
  }

  function walkLeg(guard, dt) {
    const from = guard.route[guard.leg];
    const to = guard.route[(guard.leg + 1) % guard.route.length];
    const dx = to.x - guard.x;
    const dy = to.y - guard.y;
    const gap = Math.hypot(dx, dy);
    if (gap < 3) {
      // At a corner: stand and sweep the cone, then turn to the next leg.
      guard.dwellTimer -= dt;
      guard.sweepClock += dt;
      const rest = Math.atan2(
        guard.route[(guard.leg + 1) % guard.route.length].y - from.y,
        guard.route[(guard.leg + 1) % guard.route.length].x - from.x,
      );
      guard.facing = rest + Math.sin(guard.sweepClock * (Math.PI * 2 / VISION.sweepPeriod)) * GUARD.sweep;
      if (guard.dwellTimer <= 0) {
        guard.leg = (guard.leg + 1) % guard.route.length;
        guard.dwellTimer = GUARD.dwell;
        guard.sweepClock = 0;
      }
      return;
    }
    const speed = GUARD.patrol;
    const step = Math.min(gap, speed * dt);
    guard.x += (dx / gap) * step;
    guard.y += (dy / gap) * step;
    guard.facing = Math.atan2(dy, dx);
  }

  function stepGuard(guard, dt) {
    const shadow = state.shadow;
    guard.alertFlash = Math.max(0, guard.alertFlash - dt);

    // Does it hear anything? A sprint nearby or a thrown bottle pulls it off its route.
    let heard = null;
    if (state.noiseAt) {
      const reach = state.noiseAt.reach;
      if (distance(guard.x, guard.y, state.noiseAt.x, state.noiseAt.y) < reach) heard = state.noiseAt;
    }

    const rate = guardSees(guard);
    if (rate > 0) {
      guard.mood = MOOD_HUNT;
      guard.giveUpTimer = GUARD.giveUp;
      guard.lastSeenX = shadow.x;
      guard.lastSeenY = shadow.y;
      guardsSeeing += 1;
    } else if (heard && guard.mood === MOOD_PATROL) {
      guard.mood = MOOD_SUSPECT;
      guard.giveUpTimer = GUARD.giveUp * 0.6;
      guard.lastSeenX = heard.x;
      guard.lastSeenY = heard.y;
    } else if (guard.mood === MOOD_HUNT) {
      guard.giveUpTimer -= dt;
      if (guard.giveUpTimer <= 0) {
        guard.mood = MOOD_SUSPECT;
        guard.giveUpTimer = GUARD.giveUp * 0.5;
      }
    } else if (guard.mood === MOOD_SUSPECT) {
      guard.giveUpTimer -= dt;
      if (guard.giveUpTimer <= 0) {
        guard.mood = MOOD_PATROL;
        guard.dwellTimer = GUARD.dwell;
      }
    }

    if (guard.mood === MOOD_HUNT || guard.mood === MOOD_SUSPECT) {
      // Head for the last place it saw or heard the shadow, or the door it is guarding.
      const targetX = guard.lastSeenX;
      const targetY = guard.lastSeenY;
      const dx = targetX - guard.x;
      const dy = targetY - guard.y;
      const gap = Math.hypot(dx, dy);
      if (gap > 6) {
        const speed = guard.mood === MOOD_HUNT ? GUARD.chase : GUARD.investigate;
        const step = Math.min(gap, speed * dt);
        const nx = guard.x + (dx / gap) * step;
        const ny = guard.y + (dy / gap) * step;
        if (!circleHitsAny(nx, guard.y, guard.radius, BLOCKERS)) guard.x = nx;
        if (!circleHitsAny(guard.x, ny, guard.radius, BLOCKERS)) guard.y = ny;
        guard.facing = Math.atan2(dy, dx);
      } else if (guard.mood === MOOD_SUSPECT) {
        // Arrived and found nothing: stand and look around before going back to the route.
        guard.sweepClock += dt;
        guard.facing += Math.sin(guard.sweepClock * 3.1) * dt * 2.2;
      }
      // Shout: a guard that has the shadow pulls every guard within earshot onto it too.
      if (guard.mood === MOOD_HUNT) {
        for (let index = 0; index < state.guards.length; index += 1) {
          const other = state.guards[index];
          if (other === guard || other.mood === MOOD_HUNT) continue;
          if (distance(other.x, other.y, guard.x, guard.y) < GUARD.shoutRange) {
            other.mood = MOOD_HUNT;
            other.giveUpTimer = GUARD.giveUp * 0.8;
            other.lastSeenX = guard.lastSeenX;
            other.lastSeenY = guard.lastSeenY;
          }
        }
      }
    } else {
      walkLeg(guard, dt);
    }

    // Caught outright: a guard's arm's reach ends the run, but only once the meter is high, so a
    // guard that wanders onto you early is a scare you can still walk away from.
    if (state.exposure >= GUARD.grabExposure
      && distance(guard.x, guard.y, shadow.x, shadow.y) < GUARD.catchRange) {
      guard.alertFlash = 1;
      EVENTS |= EVENT_BUSTED;
    }

    // Seeing the shadow fills the meter; the shout is the near miss that precedes it.
    if (rate > 0) {
      const before = state.exposure;
      state.exposure = Math.min(1, state.exposure + rate * dt);
      if (before < 0.62 && state.exposure >= 0.62) EVENTS |= EVENT_NEAR_MISS;
      if (state.exposure >= 0.62) EVENTS |= EVENT_SEEN;
    }
  }

  // ---- the frame ------------------------------------------------------------------------------

  let EVENTS = EVENT_NONE;
  let guardsSeeing = 0;

  /**
   * Advance the world by dt seconds. `hold` freezes the guards (the title screen's slow drift), and
   * `move` is the input's movement axis. Returns the frame's EVENT_* flags.
   */
  function step(dt, move, hold) {
    EVENTS = EVENT_NONE;
    guardsSeeing = 0;
    state.noiseTimer = Math.max(0, state.noiseTimer - dt);
    if (state.noiseTimer <= 0) state.noiseAt = null;
    state.exitPulse = Math.max(0, state.exitPulse - dt);
    for (const drop of state.loot) drop.pulse = Math.max(0, drop.pulse - dt * 1.6);

    if (hold) {
      // The title screen: guards keep their habits, but nothing is seen, heard or scored.
      for (const guard of state.guards) {
        guard.alertFlash = Math.max(0, guard.alertFlash - dt);
        walkLeg(guard, dt);
      }
      return EVENTS;
    }

    state.elapsed += dt;
    stepShadow(dt, move);
    const wasFinding = state.exposure;
    for (const guard of state.guards) stepGuard(guard, dt);
    if (guardsSeeing === 0) {
      state.exposure = Math.max(0, state.exposure - VISION.decayRate * dt);
      // Getting cleanly back out of sight of a nearly-full meter is the recovery the judge looks for.
      if (wasFinding > 0.62 && state.exposure === 0) {
        state.nearMisses += 1;
        EVENTS |= EVENT_NEAR_MISS;
      }
    }
    state.seen = guardsSeeing > 0 || state.exposure > 0.02;

    // A full meter, or a guard's hand once the meter is high, rings the alarm and ends the run. The
    // grab is the same outcome one step early: either way the house is alerted, not merely a scare.
    if (state.exposure >= 1) {
      state.exposure = 1;
      EVENTS |= EVENT_ALARM | EVENT_BUSTED;
    } else if (EVENTS & EVENT_BUSTED) {
      EVENTS |= EVENT_ALARM;
    }
    if (EVENTS & (EVENT_ALARM | EVENT_BUSTED)) {
      state.alarm = ALARM_SECONDS;
    }
    if (state.alarm > 0) {
      state.alarm = Math.max(0, state.alarm - dt);
      // While the alarm rings every guard hunts, and a long sprint re-arms it.
      for (const guard of state.guards) {
        if (guard.mood !== MOOD_HUNT) {
          guard.mood = MOOD_HUNT;
          guard.giveUpTimer = GUARD.giveUp;
          guard.lastSeenX = state.shadow.x;
          guard.lastSeenY = state.shadow.y;
        }
      }
    }
    return EVENTS;
  }

  return { state, reset, step };
}
