// Take screenshots of a static game from shots.json with puppeteer-core + the local Chromium.
// Usage: node tools/shoot.mjs <baseUrl> [outDir] [--only name]
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const base = process.argv[2] ?? 'http://localhost:8181';
const outDir = process.argv[3] ?? join(root, 'screenshots');
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx === -1 ? null : process.argv[onlyIdx + 1];

const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const exe = process.env.CHROME ?? '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';

mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--font-render-hinting=none', '--disable-lcd-text'],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});

for (const shot of shots) {
  if (only && !shot.name.includes(only)) continue;
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const url = `${base}/${shot.query ?? ''}`;
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  // The staged shots set window.__shotReady after painting twice; wait for it, then settle.
  await page.waitForFunction('window.__shotReady === true', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 250));
  const path = join(outDir, shot.name);
  await page.screenshot({ path, type: path.endsWith('.png') ? 'png' : 'jpeg', quality: 92 });
  const size = statSync(path).size;
  console.log(`${shot.name} ${size} bytes  ${url}`);
  await page.close();
}

await browser.close();
