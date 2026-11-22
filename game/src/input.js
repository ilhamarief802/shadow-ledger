// Keyboard and pointer input for a top-down sneak: a movement vector from the keys held, a pace held
// down (Shift sprints, C crouches), and one-shot presses (start, pause, throw a bottle) queued as bit
// flags and taken once by the loop, so a press between two frames is never lost nor counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_THROW = 4;

export const PACE_WALK = 0;
export const PACE_CROUCH = 1;
export const PACE_SPRINT = 2;

const MOVES = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
};
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['Escape', 'KeyP']);
const THROW = new Set(['KeyE']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const CROUCH = new Set(['KeyC']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (event.code in MOVES) held.add(event.code);
    else if (SPRINT.has(event.code) || CROUCH.has(event.code)) held.add(event.code);
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (THROW.has(event.code)) {
      if (!event.repeat) actions |= ACTION_THROW;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => held.clear());
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  function anyOf(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** The movement axis, each component -1, 0 or 1, from the keys currently held. */
    move() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        if (code in MOVES) {
          x += MOVES[code][0];
          y += MOVES[code][1];
        }
      }
      return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    },
    /** Which pace the held keys ask for: a crouch wins over a sprint, which wins over a walk. */
    pace() {
      if (anyOf(CROUCH)) return PACE_CROUCH;
      if (anyOf(SPRINT)) return PACE_SPRINT;
      return PACE_WALK;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
