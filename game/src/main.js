// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps (several
// in a slow frame, none in a fast one), and the renderer paints what is there. The game moves between
// five screens: title, play, paused, escaped and caught.
//
// ?seed=N fixes the guards' small habits. ?shot=title|play|tension|escape|caught (with &seed=N) stages
// that scene instead of running the loop, so a screenshot of the real rules is reproducible.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_ESCAPED, EVENT_LOOT, PACE_CROUCH } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_THROW, createInput } from './input.js';
import { createRenderer, SCREEN_CAUGHT, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageScene } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** How long the escaped or caught panel waits before it takes the keyboard again. */
const PANEL_SETTLE = 0.35;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageScene(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, scene.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let clock = 0;
  let settle = 0;

  // Screen readers (and anyone reading the page's text) hear each screen change.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Take the ledgers and reach the vault door.');
  }

  function endGame(caught) {
    screen = caught ? SCREEN_CAUGHT : SCREEN_OVER;
    settle = PANEL_SETTLE;
    if (!caught && world.state.secured > best) {
      best = world.state.secured;
      saveBest(best);
    }
    announce(caught
      ? `Caught. Secured ${world.state.secured}.`
      : `Escaped. Secured ${world.state.secured}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_CAUGHT)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    } else if (actions & ACTION_THROW && screen === SCREEN_PLAY) {
      // A bottle thrown at the shadow's own feet: a loud noise a guard comes to look at. It is the
      // one noise the player can make on purpose, and the worst mistake is throwing it too close.
      if (world.state.throwables > 0) {
        world.state.throwables -= 1;
        world.state.noiseAt = { x: world.state.shadow.x, y: world.state.shadow.y, reach: 470 };
        world.state.noiseTimer = 0.9;
        announce('Bottle thrown.');
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.state.shadow.pace = PACE_CROUCH;
      world.step(STEP, { x: 0, y: 0 }, true);
      return;
    }
    world.state.shadow.pace = input.pace();
    const events = world.step(STEP, input.move(), false);
    if (events & EVENT_BUSTED) endGame(true);
    else if (events & EVENT_ESCAPED) endGame(false);
    else if (events & EVENT_LOOT) announce(`Secured ${world.state.secured}.`);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    if (settle > 0) {
      settle = Math.max(0, settle - Math.min(accumulator, MAX_FRAME));
      accumulator = 0;
    }

    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      clock += Math.min(accumulator, MAX_FRAME);
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, clock);
  }

  // Leaving the tab pauses a running game rather than letting a guard walk into an unseen shadow.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Shadow Ledger. Press Space or click to enter the floor.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
