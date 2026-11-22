// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield is
// scaled to fit the window and centred, the margin filled with the backdrop colour.
//
// Lighting is the part that matters to a player: the floor is lit only inside the guards' cones, so
// where is safe reads at a glance. Each cone is drawn as a fan of rays that stop at walls and cover,
// which is the same raycast the rules use to decide what a guard can see, so the cone never shows
// through a crate the guard cannot see through. The shadow's own lamp lights a small ring around it.
import {
  EXIT, GUARDS as GUARD_SPOTS, LOOT as LOOT_SPOTS, ROOMS, START, WALLS,
} from './level.js';
import { COVER } from './level.js';
import {
  FIELD, FONT, GUARD, MONO, PALETTE, VISION, PACES,
} from './config.js';
import { MOOD_HUNT, MOOD_SUSPECT, MOOD_PATROL } from './world.js';
import { raycast } from './geometry.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_CAUGHT = 'caught';

const CONE_BLOCKERS = [...WALLS, ...COVER];
const HUD_HEIGHT = 74;

function rgbTriplet(name) {
  return name.replace(/\s+/g, '').split(',');
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const taper = rgbTriplet(PALETTE.cone);
  const hot = rgbTriplet(PALETTE.coneAlert);
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(window.innerWidth * ratio));
    const height = Math.max(1, Math.round(window.innerHeight * ratio));
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function font(size, family) {
    const key = `${size}:${family}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${family}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, family = FONT) {
    context.font = font(size, family);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  // ---- the floor ------------------------------------------------------------------------------

  function drawFloor(alpha) {
    context.fillStyle = PALETTE.floor;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    // A hairline grid: it reads as tiled floor and gives the eye a scale for distances.
    context.globalAlpha = 0.5 * alpha;
    context.strokeStyle = PALETTE.floorLine;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = HUD_HEIGHT; x < FIELD.width; x += 64) {
      context.moveTo(x, 0);
      context.lineTo(x, FIELD.height);
    }
    for (let y = HUD_HEIGHT; y < FIELD.height; y += 64) {
      context.moveTo(0, y);
      context.lineTo(FIELD.width, y);
    }
    context.stroke();

    // The rooms, faintly named on the floor so a screenshot reads as a plan, not a maze.
    context.globalAlpha = 0.26 * alpha;
    for (const room of ROOMS) {
      text(room.name.toUpperCase(), room.x + 12, room.y + 26, 15, PALETTE.muted, 'left', MONO);
    }
    context.globalAlpha = alpha;
    context.globalAlpha = 1;
  }

  /** Paint the cone of one guard, clipped by the same blockers the rules use. */
  function drawCone(guard, mood) {
    const alert = mood === MOOD_HUNT;
    const colour = alert ? hot : taper;
    const spread = VISION.halfAngle * 2;
    const rays = VISION.rays;
    const points = [];

    for (let i = 0; i <= rays; i += 1) {
      const angle = guard.facing - VISION.halfAngle + (spread * i) / rays;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const reach = raycast(guard.x, guard.y, dx, dy, CONE_BLOCKERS, VISION.range);
      points.push([guard.x + dx * reach, guard.y + dy * reach, reach]);
    }

    // A soft body, then a brighter core along the centre so the aim reads at a glance.
    context.beginPath();
    context.moveTo(guard.x, guard.y);
    for (const point of points) context.lineTo(point[0], point[1]);
    context.closePath();
    const gradient = context.createRadialGradient(
      guard.x, guard.y, 10,
      guard.x, guard.y, VISION.range,
    );
    const strength = alert ? 0.42 : mood === MOOD_SUSPECT ? 0.3 : 0.24;
    gradient.addColorStop(0, `rgba(${colour[0]},${colour[1]},${colour[2]},${strength * 1.5})`);
    gradient.addColorStop(0.55, `rgba(${colour[0]},${colour[1]},${colour[2]},${strength * 0.7})`);
    gradient.addColorStop(1, `rgba(${colour[0]},${colour[1]},${colour[2]},0)`);
    context.fillStyle = gradient;
    context.fill();

    // The cone's edge: a hairline, so a player can judge exactly where it ends.
    context.strokeStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${alert ? 0.75 : 0.34})`;
    context.lineWidth = alert ? 2 : 1;
    context.beginPath();
    context.moveTo(guard.x, guard.y);
    for (const point of points) context.lineTo(point[0], point[1]);
    context.closePath();
    context.stroke();
  }

  function drawCover() {
    for (const box of COVER) {
      // A drop shadow first: cover that sits above the floor reads at a glance.
      context.fillStyle = 'rgba(0,0,0,0.45)';
      context.fillRect(box.x + 5, box.y + 7, box.w, box.h);
      context.fillStyle = box.kind === 'cabinet' ? PALETTE.wall : PALETTE.crate;
      context.fillRect(box.x, box.y, box.w, box.h);
      // The top face, inset, gives the box height without a sprite.
      context.fillStyle = box.kind === 'cabinet' ? PALETTE.wallTop : PALETTE.crateTop;
      context.fillRect(box.x + 3, box.y + 3, box.w - 6, box.h - 6);
      context.strokeStyle = PALETTE.crateLine;
      context.lineWidth = 2;
      context.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
    }
  }

  function drawWalls() {
    for (const wall of WALLS) {
      context.fillStyle = PALETTE.wall;
      context.fillRect(wall.x, wall.y, wall.w, wall.h);
      context.strokeStyle = PALETTE.wallTop;
      context.lineWidth = 2;
      context.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
    }
  }

  function drawExit(time) {
    const pulse = 0.55 + 0.45 * Math.sin(time * 2.4);
    context.save();
    context.shadowColor = PALETTE.exit;
    context.shadowBlur = 22 * pulse;
    context.strokeStyle = PALETTE.exit;
    context.lineWidth = 3;
    context.strokeRect(EXIT.x, EXIT.y, EXIT.w, EXIT.h);
    context.restore();
    context.fillStyle = `rgba(87,224,137,${0.10 + 0.10 * pulse})`;
    context.fillRect(EXIT.x, EXIT.y, EXIT.w, EXIT.h);
    // The door's grille, so it reads as a door and not a rectangle.
    context.strokeStyle = PALETTE.exitDark;
    context.lineWidth = 2;
    context.beginPath();
    for (let x = EXIT.x + 10; x < EXIT.x + EXIT.w - 6; x += 10) {
      context.moveTo(x, EXIT.y + 8);
      context.lineTo(x, EXIT.y + EXIT.h - 8);
    }
    context.stroke();
    text('EXIT', EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h / 2 + 5, 13, PALETTE.exit, 'center', MONO);
  }

  function drawLoot(state) {
    for (const drop of state.loot) {
      if (drop.taken) continue;
      const glow = 0.6 + 0.4 * Math.sin(state.elapsed * 3 + drop.x);
      context.save();
      context.shadowColor = PALETTE.loot;
      context.shadowBlur = 12 * glow;
      context.fillStyle = PALETTE.loot;
      context.beginPath();
      context.moveTo(drop.x, drop.y - 8);
      context.lineTo(drop.x + 8, drop.y);
      context.lineTo(drop.x, drop.y + 8);
      context.lineTo(drop.x - 8, drop.y);
      context.closePath();
      context.fill();
      context.restore();
    }
  }

  /** The small lamp the shadow carries: what it can see of the floor right around it. */
  function drawShadow(state) {
    const shadow = state.shadow;
    const lamp = context.createRadialGradient(shadow.x, shadow.y, 4, shadow.x, shadow.y, 92);
    lamp.addColorStop(0, 'rgba(92,230,207,0.16)');
    lamp.addColorStop(1, 'rgba(92,230,207,0)');
    context.fillStyle = lamp;
    context.beginPath();
    context.arc(shadow.x, shadow.y, 92, 0, Math.PI * 2);
    context.fill();

    // A crouched shadow is drawn smaller and dimmer: the player's body is their visibility.
    const crouched = state.shadow.pace === 1;
    const radius = crouched ? 9 : 11;
    context.fillStyle = crouched ? 'rgba(92,230,207,0.75)' : PALETTE.player;
    context.beginPath();
    context.arc(shadow.x, shadow.y, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.playerCore;
    context.beginPath();
    context.arc(shadow.x, shadow.y, 3.4, 0, Math.PI * 2);
    context.fill();

    // The way it faces: a short wedge, so its facing is legible in a still frame.
    context.strokeStyle = PALETTE.playerCore;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(shadow.x, shadow.y);
    context.lineTo(shadow.x + Math.cos(shadow.facing) * 17, shadow.y + Math.sin(shadow.facing) * 17);
    context.stroke();
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      const alert = guard.mood === MOOD_HUNT;
      const suspect = guard.mood === MOOD_SUSPECT;
      drawCone(guard, guard.mood);

      // A bubble rings a guard that is looking: its colour is its mood, readable in one glance.
      const ring = alert ? PALETTE.guardAlert : suspect ? PALETTE.loot : PALETTE.guardDark;
      context.strokeStyle = ring;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(guard.x, guard.y, GUARD.radius + 6, 0, Math.PI * 2);
      context.stroke();

      context.fillStyle = 'rgba(0,0,0,0.5)';
      context.beginPath();
      context.arc(guard.x + 2, guard.y + 3, GUARD.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = alert ? PALETTE.guardAlert : PALETTE.guard;
      context.beginPath();
      context.arc(guard.x, guard.y, GUARD.radius, 0, Math.PI * 2);
      context.fill();

      // Its facing, as a heavy tick from the body: the cone's origin is unambiguous.
      context.strokeStyle = alert ? PALETTE.guardAlert : PALETTE.guardDark;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(guard.x, guard.y);
      context.lineTo(guard.x + Math.cos(guard.facing) * 20, guard.y + Math.sin(guard.facing) * 20);
      context.stroke();

      // The alert flash: a bright ring right after it calls out.
      if (guard.alertFlash > 0) {
        context.strokeStyle = `rgba(255,107,94,${guard.alertFlash})`;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(guard.x, guard.y, GUARD.radius + 14 * (1 - guard.alertFlash) + 10, 0, Math.PI * 2);
        context.stroke();
      }

      // The guard's name, small under it, so the player can learn who patrols where.
      text(guard.name.split(' ').pop(), guard.x, guard.y + 30, 11, PALETTE.muted, 'center', MONO);
    }
  }

  function drawNoise(state) {
    if (!state.noiseAt) return;
    const left = state.noiseTimer / 0.2;
    for (let ring = 0; ring < 3; ring += 1) {
      const radius = 20 + ring * 26 + (1 - left) * 16;
      context.strokeStyle = `rgba(255,207,92,${0.35 * left * (1 - ring / 3)})`;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(state.noiseAt.x, state.noiseAt.y, radius, 0, Math.PI * 2);
      context.stroke();
    }
  }

  // ---- the screen furniture -------------------------------------------------------------------

  function drawHud(state, screen) {
    context.fillStyle = 'rgba(8,11,16,0.9)';
    context.fillRect(0, 0, FIELD.width, HUD_HEIGHT);
    context.strokeStyle = PALETTE.floorLine;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, HUD_HEIGHT);
    context.lineTo(FIELD.width, HUD_HEIGHT);
    context.stroke();

    context.textBaseline = 'alphabetic';

    // Column 1: what the run is worth so far.
    text('SECURED', 24, 24, 10, PALETTE.muted, 'left', MONO);
    text(`${state.secured}`, 24, 60, 28, PALETTE.text, 'left', MONO);
    const securedWidth = `${state.secured}`.length * 17;
    text(`/ ${state.totalLoot}`, 24 + securedWidth + 6, 60, 15, PALETTE.muted, 'left', MONO);

    // Column 2: the pace, three words with the active one lit.
    const paceX = 200;
    text('PACE', paceX, 24, 10, PALETTE.muted, 'left', MONO);
    for (let index = 0; index < PACES.length; index += 1) {
      const active = state.shadow.pace === index;
      const x = paceX + index * 84;
      text(PACES[index], x, 50, 13, active ? PALETTE.player : PALETTE.muted, 'left', MONO);
      if (active) {
        context.fillStyle = PALETTE.player;
        context.fillRect(x, 56, 58, 2);
      }
    }

    // Column 3: the exposure meter, the number this game is about.
    const meterX = 470;
    const meterW = 240;
    text('EXPOSURE', meterX, 24, 10, PALETTE.muted, 'left', MONO);
    context.fillStyle = '#1b2430';
    context.fillRect(meterX, 38, meterW, 16);
    const fill = state.exposure;
    const colour = fill > 0.85 ? PALETTE.danger : fill > 0.5 ? PALETTE.loot : PALETTE.exposureCool;
    context.fillStyle = colour;
    context.fillRect(meterX, 38, Math.max(0, meterW * fill), 16);
    // The threshold tick: a player can see exactly where a near miss turns into an alarm.
    context.fillStyle = PALETTE.muted;
    context.fillRect(meterX + meterW * 0.62, 32, 2, 28);
    if (fill > 0.62) {
      context.strokeStyle = PALETTE.danger;
      context.lineWidth = 1;
      context.strokeRect(meterX - 1, 37, meterW + 2, 18);
    }
    text(`${Math.round(fill * 100)}%`, meterX + meterW + 14, 54, 15, colour, 'left', MONO);

    // Column 4: what the house is doing, in one phrase.
    let mood = 'PATROL';
    let moodColour = PALETTE.muted;
    for (const guard of state.guards) {
      if (guard.mood === MOOD_HUNT) {
        mood = 'SPOTTED';
        moodColour = PALETTE.danger;
        break;
      }
      if (guard.mood === MOOD_SUSPECT) {
        mood = 'HEARD SOMETHING';
        moodColour = PALETTE.loot;
      }
    }
    text('HOUSE', 800, 24, 10, PALETTE.muted, 'left', MONO);
    text(mood, 800, 52, 15, moodColour, 'left', MONO);

    // The right edge: the alarm's countdown, or the cover's word, then what is left to throw.
    if (state.alarm > 0) {
      text(`ALARM ${state.alarm.toFixed(1)}s`, FIELD.width - 24, 52, 16, PALETTE.danger, 'right', MONO);
    } else {
      text(state.inCover ? 'IN COVER' : 'IN THE OPEN', FIELD.width - 24, 52, 13,
        state.inCover ? PALETTE.exit : PALETTE.muted, 'right', MONO);
    }
    text(`${state.throwables} BOTTLE${state.throwables === 1 ? '' : 'S'}  [E]`, FIELD.width - 24, 26, 10, PALETTE.muted, 'right', MONO);
  }

  function drawPanel(title, lines, prompt, tint) {
    const width = 720;
    const line = 34;
    const height = 210 + lines.length * line;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(8,11,16,0.86)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = tint;
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, width - 2, height - 2);

    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, tint, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 130 + index * line, 20, PALETTE.text, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 44, 20, PALETTE.loot, 'center', MONO);
  }

  const TITLE_LINES = [
    'A vault, four guards, one door. Take the ledgers and leave unseen.',
    'WASD / arrows to move.  Hold SHIFT to sprint (loud), C or S to crouch (quiet).',
    'Their cones are their eyes. Break the line of sight before the meter fills.',
  ];

  function drawVignette(strength, colour) {
    if (strength <= 0) return;
    const vignette = context.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.30,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.85,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(${colour},${strength})`);
    context.fillStyle = vignette;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  /**
   * Paint one frame: floor, cones, cover, actors, HUD, then the screen's own panel.
   * `best` is the saved record, `time` the world clock seconds.
   */
  function draw(state, screen, best, time) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    drawFloor(1);
    // Cones under the cover: a cone that reaches a crate is drawn up to it, never across.
    for (const guard of state.guards) drawCone(guard, guard.mood);
    drawWalls();
    drawCover();
    drawExit(time);
    drawLoot(state);
    drawNoise(state);
    drawShadow(state);
    drawGuards(state);

    // The alarm reddens the edges of the frame; a near miss flashes once.
    drawVignette(state.alarm > 0 ? 0.42 : 0, '255,60,40');
    drawHud(state, screen);

    if (screen === SCREEN_TITLE) {
      drawPanel('SHADOW LEDGER', TITLE_LINES, 'Press SPACE or click to enter', PALETTE.player);
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The house will wait.', `Secured so far: ${state.secured} / ${state.totalLoot}`],
        'Press ESC to resume', PALETTE.text);
    } else if (screen === SCREEN_OVER) {
      const perfect = state.lootCount === LOOT_SPOTS.length;
      drawPanel(
        perfect ? 'CLEAN GETAWAY' : 'ESCAPED',
        [
          `Secured ${state.secured} of ${state.totalLoot} from ${state.lootCount} of ${LOOT_SPOTS.length} drops.`,
          `Time ${state.elapsed.toFixed(1)}s  ·  Near misses ${state.nearMisses}  ·  Best ${best}`,
        ],
        'Press SPACE to run the floor again',
        PALETTE.exit,
      );
    } else if (screen === SCREEN_CAUGHT) {
      drawPanel(
        'SPOTTED',
        [
          'A guard had a clear look and the alarm filled.',
          `Secured ${state.secured} / ${state.totalLoot}. Get back out of sight sooner.`,
        ],
        'Press SPACE to try the floor again',
        PALETTE.danger,
      );
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
