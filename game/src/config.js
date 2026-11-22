// Every tuning number, colour and timing in one place, so no rule is buried in a drawing call.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the window, so nothing
// below depends on the screen size, and a screenshot at 1280x720 is the whole playfield.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** How the shadow moves: a walk is quiet, a crouch quieter and slower, a sprint fast and loud. */
export const PLAYER = {
  radius: 11,
  walk: 168,
  sprint: 300,
  crouch: 78,
  /** Seconds of extra grace after being seen before the meter starts to empty again. */
  grace: 0.9,
  /**
   * How loud each pace is, as the radius (px) a guard's ear reaches. A walk and a crouch are silent;
   * a sprint carries to 210, inside a cone's own 250 reach. That ordering is the whole point: running
   * is faster than a guard's chase, so it must not also be a shout across the floor. When it reached
   * further than the eye, fleeing a hunt told every guard in the room exactly where the shadow was,
   * and running away was the surest way to be caught.
   */
  noise: { walk: 0, crouch: 0, sprint: 210 },
  /** Seconds between two footfalls of a sprint. */
  footfall: 0.30,
};

/** A guard's cone: how wide, how far, and how fast it fills the exposure meter at that distance. */
export const VISION = {
  halfAngle: 0.55,       // radians either side of the facing (~63 degrees wide)
  range: 250,
  nearRange: 96,         // inside this the cone fills the meter faster
  fillRate: 0.62,        // meter per second at the cone's edge
  nearScale: 1.85,       // multiplier inside nearRange
  crouchScale: 0.42,     // a crouched shadow is harder to spot
  decayRate: 0.55,       // meter per second once out of sight
  rays: 33,              // rays drawn per cone, so its edge bends around cover
};

export const GUARD = {
  radius: 11,
  patrol: 74,
  investigate: 132,
  /**
   * A chase is slower than the shadow's walk (PLAYER.walk): a guard closes in, but a player who
   * keeps their head can always back away. That is what makes the exposure meter the real threat
   * rather than an ornament: you are caught by staying in a cone, not by being outrun by one.
   */
  chase: 158,
  /** How far a shouted alarm carries, and how long a given guard looks before giving up. */
  shoutRange: 430,
  giveUp: 5.5,
  /** Seconds it stands at the end of a leg, sweeping its cone, before turning back. */
  dwell: 1.3,
  sweep: 0.62,            // radians it sweeps either way while standing
  sweepPeriod: 2.6,
  /** A grab needs the meter this high, so a guard reaching you early is a scare, not a death. */
  grabExposure: 0.8,
  catchRange: 24,
};

/** Seconds the alarm rings before a caught shadow is thrown back to the floor's start. */
export const ALARM_SECONDS = 2.2;

export const PALETTE = {
  backdrop: '#080b10',
  floor: '#141922',
  floorLine: '#1c2430',
  wall: '#2b3442',
  wallTop: '#3a4658',
  crate: '#6b4a2f',
  crateTop: '#8a613d',
  crateLine: '#4a3220',
  player: '#5ce6cf',
  playerCore: '#d9fff8',
  guard: '#e0b566',
  guardDark: '#8f6d33',
  guardAlert: '#ff6b5e',
  cone: '255, 214, 120',
  coneAlert: '255, 107, 94',
  loot: '#ffcf5c',
  exposureCool: '#5cc8e6',
  exit: '#57e089',
  exitDark: '#1f5a38',
  panel: '#151b25',
  text: '#eef3f8',
  muted: '#8b95a6',
  danger: '#ff6b5e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = '"JetBrains Mono", "SF Mono", ui-monospace, monospace';

/** Where the best run is kept between visits (this browser only). */
export const BEST_KEY = 'shadow-ledger.best';

/** The pace keys, as the HUD names them. */
export const PACES = ['WALK', 'CROUCH', 'SPRINT'];
