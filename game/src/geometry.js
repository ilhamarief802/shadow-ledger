// The small amount of geometry the rules need: does a circle overlap a box, does a segment reach a
// box, and how far along a ray the first box sits. Separated out because both the world (who can
// walk where, what blocks a cone) and the renderer (how far a cone draws) ask the same questions and
// must agree; a cone that draws through a crate while the guard cannot see through it reads as broken.

/** True when the circle at (cx, cy, r) overlaps the rectangle. */
export function circleHitsRect(cx, cy, r, rect) {
  const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy < r * r;
}

/** True when the circle overlaps any rectangle in the list. */
export function circleHitsAny(cx, cy, r, rects) {
  for (let index = 0; index < rects.length; index += 1) {
    if (circleHitsRect(cx, cy, r, rects[index])) return true;
  }
  return false;
}

/**
 * The distance along a ray to its first hit on a rectangle, or Infinity. The ray starts at (ox, oy)
 * and points along (dx, dy), which must be a unit vector. A ray starting inside the rectangle counts
 * as an immediate hit (0), because a guard's eye is never inside a wall.
 */
export function rayRectDistance(ox, oy, dx, dy, rect, maxDistance) {
  const minX = rect.x;
  const maxX = rect.x + rect.w;
  const minY = rect.y;
  const maxY = rect.y + rect.h;

  if (ox >= minX && ox <= maxX && oy >= minY && oy <= maxY) return 0;

  let near = -Infinity;
  let far = Infinity;

  if (dx === 0) {
    if (ox < minX || ox > maxX) return Infinity;
  } else {
    const t1 = (minX - ox) / dx;
    const t2 = (maxX - ox) / dx;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
  }

  if (dy === 0) {
    if (oy < minY || oy > maxY) return Infinity;
  } else {
    const t1 = (minY - oy) / dy;
    const t2 = (maxY - oy) / dy;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
  }

  if (far < 0 || near > far) return Infinity;
  const hit = near > 0 ? near : far;
  return hit <= maxDistance ? hit : Infinity;
}

/** The nearest distance along a ray to any rectangle in the list, capped at maxDistance. */
export function raycast(ox, oy, dx, dy, rects, maxDistance) {
  let best = maxDistance;
  for (let index = 0; index < rects.length; index += 1) {
    const hit = rayRectDistance(ox, oy, dx, dy, rects[index], best);
    if (hit < best) best = hit;
  }
  return best;
}

/** The shortest angular difference from a to b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}
