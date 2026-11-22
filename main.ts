// The game's hand-in program: plain Node 22, standard library only. It takes the static game in
// game/ — the folder a desktop browser loads offline, no build step, no library, no network — and
// the screenshots taken from it, checks them against the scorer's own caps, copies them to the
// output directory, and writes dossier.json: the summary a judge reads and the pictures it sees.
//
// The caps are not decoration. A dossier over its image count, an index.html over its size, a path
// over a thousand bytes or a game folder over 48 MiB is refused by the scorer, and a refusal found
// there costs the entry rather than a round trip. So this program measures the entry before it hands
// it over and exits non-zero, naming the cap that broke, instead of shipping something doomed.
//
// Run it outside the grader's container with:
//   MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The scorer's caps, in one object, so a message can always say which one was broken. */
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Every cap this program enforces, as a list of problems rather than the first one it met. */
const problems = [];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

// ---- the game ---------------------------------------------------------------------------------

if (!existsSync(gameDir)) problems.push(`no game/ folder beside main.ts: the browser would have nothing to load`);

const indexHtml = join(gameDir, 'index.html');
if (existsSync(gameDir) && !existsSync(indexHtml)) {
  problems.push(`game/index.html is missing: a desktop browser opening the entry loads it first`);
}

let gameFiles = 0;
let gameBytes = 0;
if (existsSync(gameDir)) {
  for (const file of walk(gameDir)) {
    gameFiles += 1;
    gameBytes += statSync(file).size;
    const path = relative(gameDir, file).split(sep).join('/');
    if (Buffer.byteLength(path, 'utf8') > CAPS.game_path_max_bytes) {
      problems.push(`a path under game/ is over ${CAPS.game_path_max_bytes} bytes: ${path}`);
    }
  }
  if (gameFiles > CAPS.game_max_files) problems.push(`game/ holds ${gameFiles} files, over its ${CAPS.game_max_files}`);
  if (gameBytes > CAPS.game_max_bytes) problems.push(`game/ holds ${gameBytes} bytes, over its ${CAPS.game_max_bytes}`);
  if (gameFiles === 0) problems.push('game/ is empty');
}

if (existsSync(indexHtml) && statSync(indexHtml).size > 1024 * 1024) {
  problems.push(`game/index.html is over 1 MiB, which the scorer refuses`);
}

// ---- the screenshots --------------------------------------------------------------------------

let shots = 0;
if (existsSync(shotsDir)) {
  for (const name of readdirSync(shotsDir).sort()) {
    const file = join(shotsDir, name);
    if (!statSync(file).isFile()) continue;
    const bytes = statSync(file).size;
    shots += 1;
    if (bytes > CAPS.screenshots.max_bytes) {
      problems.push(`screenshots/${name} is ${bytes} bytes, over the ${CAPS.screenshots.max_bytes} one may be`);
    }
  }
  if (shots === 0) problems.push('screenshots/ holds no picture: the judge sees the game through them');
  if (shots > CAPS.screenshots.max) problems.push(`screenshots/ holds ${shots} pictures, over its ${CAPS.screenshots.max}`);
} else {
  problems.push('no screenshots/ folder: the judge sees the game through them');
}

// ---- the verdict, before anything is copied -----------------------------------------------------

if (problems.length > 0) {
  console.error('main.ts: this entry would be refused. Nothing was written.');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

// ---- hand it over ------------------------------------------------------------------------------

mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The library reads the entry back out of the output directory, so what is measured is exactly what
// ships: the copy, not the source tree.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));

console.log(`main.ts: handed in ${gameFiles} game files (${(gameBytes / 1024).toFixed(0)} KiB), `
  + `${shots} screenshots, and dossier.json to ${out}`);
