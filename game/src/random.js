// Seeded randomness: one small generator, so a level's guards keep the same habits between visits
// and a ?seed=N screenshot is the same frame every time. Mulberry32, in a few lines.

export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random float in [min, max). */
export function between(random, min, max) {
  return min + random() * (max - min);
}
