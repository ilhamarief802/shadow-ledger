// The one hand-built level: a vault floor split into rooms by walls, with crates and cabinets to
// hide behind, four guards on looping patrol routes, and a vault door to reach unseen. Every
// number here is in the playfield's own coordinates (0..1280, 0..720), so the map reads as drawn.
//
// The floor is authored the way a level designer would: rectangles for walls, rectangles for cover,
// a polygon for each guard's route (it walks the loop, pausing at each corner to sweep), and the
// two points that matter, where the shadow starts and the door it has to reach.

export const START = { x: 74, y: 646 };

export const EXIT = { x: 1196, y: 96, w: 62, h: 76, label: 'VAULT' };

/** Solid walls: the shadow cannot walk through them and a cone cannot see through them. */
export const WALLS = [
  // Outer shell, leaving a little margin so the playfield edge is not the wall itself.
  { x: 14, y: 14, w: 1252, h: 14 },
  { x: 14, y: 14, w: 14, h: 692 },
  { x: 14, y: 692, w: 1252, h: 14 },
  { x: 1252, y: 14, w: 14, h: 692 },
  // The west room (the shadow's cell) and its neck into the hall.
  { x: 300, y: 14, w: 14, h: 220 },
  { x: 300, y: 380, w: 14, h: 326 },
  // The hall's north wall, split into two legs around the doorway to the vault corridor.
  { x: 314, y: 300, w: 300, h: 14 },
  { x: 700, y: 300, w: 250, h: 14 },
  // The mid spine that separates the west hall from the east corridor.
  { x: 560, y: 314, w: 14, h: 200 },
  { x: 560, y: 596, w: 14, h: 110 },
  // The north corridor's south wall, with the door at its east end.
  { x: 950, y: 200, w: 14, h: 128 },
  { x: 964, y: 200, w: 288, h: 14 },
  // The east counting room.
  { x: 964, y: 214, w: 14, h: 172 },
  { x: 964, y: 470, w: 14, h: 236 },
  { x: 978, y: 470, w: 274, h: 14 },
  // The south passage, between the hall and the yard.
  { x: 314, y: 512, w: 250, h: 14 },
  { x: 314, y: 526, w: 14, h: 180 },
];

/** Cover: low boxes and cabinets. They block a cone's line of sight but the shadow cannot pass them. */
export const COVER = [
  { x: 96, y: 120, w: 74, h: 74, kind: 'crate' },
  { x: 190, y: 280, w: 88, h: 52, kind: 'crate' },
  { x: 396, y: 96, w: 118, h: 60, kind: 'cabinet' },
  { x: 440, y: 420, w: 92, h: 92, kind: 'crate' },
  { x: 620, y: 396, w: 72, h: 72, kind: 'crate' },
  { x: 706, y: 96, w: 60, h: 132, kind: 'cabinet' },
  { x: 880, y: 344, w: 104, h: 68, kind: 'crate' },
  { x: 1044, y: 250, w: 88, h: 88, kind: 'crate' },
  { x: 1124, y: 560, w: 104, h: 60, kind: 'cabinet' },
  { x: 396, y: 580, w: 118, h: 74, kind: 'crate' },
  { x: 660, y: 600, w: 76, h: 76, kind: 'crate' },
];

/** The ledgers the shadow lifts on the way: walking over one banks it. */
export const LOOT = [
  { x: 168, y: 470, value: 60, name: 'ledger' },
  { x: 512, y: 366, value: 90, name: 'strongbox' },
  { x: 796, y: 250, value: 80, name: 'ledger' },
  { x: 1104, y: 396, value: 120, name: 'vault slip' },
  { x: 900, y: 620, value: 70, name: 'ledger' },
  { x: 232, y: 150, value: 60, name: 'ledger' },
];

/**
 * Guards: `route` is the polygon they walk, `dwell` the seconds they stand at each corner, and
 * `facing` the angle they look along while between corners. A route with two points paces back and
 * forth instead of looping. `patience` is how long this one looks before giving up a chase.
 */
export const GUARDS = [
  {
    name: 'Corporal Vess',
    route: [{ x: 392, y: 380 }, { x: 780, y: 380 }, { x: 780, y: 244 }, { x: 392, y: 244 }],
    dwell: 1.5,
  },
  {
    name: 'Sergeant Oru',
    route: [{ x: 998, y: 330 }, { x: 1200, y: 330 }, { x: 1200, y: 648 }, { x: 1020, y: 648 }],
    dwell: 1.1,
  },
  {
    name: 'Clerk Hade',
    route: [{ x: 620, y: 650 }, { x: 900, y: 650 }],
    dwell: 1.9,
  },
  {
    name: 'Warden Saye',
    route: [{ x: 1080, y: 116 }, { x: 1080, y: 172 }, { x: 1224, y: 172 }, { x: 1224, y: 116 }],
    dwell: 1.4,
  },
];

/** Where the alarm light stands, and the two rooms the HUD names as the shadow crosses them. */
export const ROOMS = [
  { name: 'Cell block', x: 20, y: 20, w: 280, h: 686 },
  { name: 'Main hall', x: 314, y: 314, w: 246, h: 198 },
  { name: 'West yard', x: 328, y: 526, w: 218, h: 152 },
  { name: 'Corridor', x: 574, y: 314, w: 400, h: 392 },
  { name: 'Counting room', x: 978, y: 214, w: 274, h: 256 },
  { name: 'Vault antechamber', x: 964, y: 84, w: 288, h: 116 },
];
