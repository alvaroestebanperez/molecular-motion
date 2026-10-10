// Draws the social card of the site (apps/demo/public/og.png, 1200×630) and the figure of the README
// (docs/assets/parp1-ssb-repair.svg) from the PARP1 example. Build first. The card needs Chrome
// (set CHROME_PATH to override). Usage: node scripts/og-image.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileMechanism } from '../packages/core/dist/index.js';
import { parseMechanism } from '../packages/core/dist/yaml.js';
import { buildSvgScene, exportSvg, mechanismReservation } from '../packages/svg/dist/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const CHROME = process.env.CHROME_PATH ?? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!CHROME) { console.error('Chrome not found; set CHROME_PATH'); process.exit(2); }

const mechanism = compileMechanism(parseMechanism(readFileSync(join(root, 'examples/parp1-ssb-repair.yaml'), 'utf8')));
const figure = exportSvg(buildSvgScene(mechanism.at('parylation'), { reservation: mechanismReservation(mechanism) }), { theme: 'light' });
mkdirSync(join(root, 'docs/assets'), { recursive: true });
writeFileSync(join(root, 'docs/assets/parp1-ssb-repair.svg'), figure);

const page = `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f6f8fb; color: #15213b; font-family: Inter, system-ui, sans-serif; }
  header { position: absolute; left: 64px; top: 52px; right: 64px; }
  h1 { margin: 0; font-size: 68px; letter-spacing: -.03em; }
  p { margin: 10px 0 0; font-size: 30px; font-weight: 600; color: #2563eb; }
  svg.mm-svg { position: absolute; left: 0; bottom: -40px; width: 1200px; height: auto; }
  .mm-export__background { fill: transparent; }
</style><header><h1>Molecular Motion</h1><p>Interactive molecular biology visualization with SVG</p></header>${figure.replace(/^<\?xml[^>]*\?>\s*/, '')}`;
const work = mkdtempSync(join(tmpdir(), 'mm-og-'));
try {
  writeFileSync(join(work, 'card.html'), page);
  mkdirSync(join(root, 'apps/demo/public'), { recursive: true });
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630', `--user-data-dir=${join(work, 'profile')}`, `--screenshot=${join(root, 'apps/demo/public/og.png')}`, `file://${join(work, 'card.html')}`], { stdio: 'ignore' });
} finally { rmSync(work, { recursive: true, force: true }); }
console.log('Wrote apps/demo/public/og.png and docs/assets/parp1-ssb-repair.svg');
