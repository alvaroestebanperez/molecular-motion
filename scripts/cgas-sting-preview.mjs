// Build the packages first. Renders every step of the cGAS–STING example, on the wide and the phone canvas.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileMechanism } from '../packages/core/dist/index.js';
import { parseMechanism } from '../packages/core/dist/yaml.js';
import { buildSvgScene, exportSvg } from '../packages/svg/dist/index.js';

const dest = new URL('../artifacts/cgas-sting-sequence/', import.meta.url);
mkdirSync(dest, { recursive: true });
const mechanism = compileMechanism(parseMechanism(readFileSync(new URL('../examples/cgas-sting.yaml', import.meta.url), 'utf8')));
for (const [canvas, size, W, H] of [['wide', {}, 960, 540], ['phone', { width: 520, height: 600 }, 520, 600]]) for (const theme of ['light', 'dark']) {
  const steps = Array.from({ length: mechanism.length }, (_, index) => {
    const snapshot = mechanism.at(index);
    const svg = exportSvg(buildSvgScene(snapshot, size), { theme, idPrefix: `cgas-${canvas}-${theme}-${index}` }).replace(/^<\?xml[^>]+>\s*/, '');
    writeFileSync(new URL(`${String(index + 1).padStart(2, '0')}-${snapshot.step.id}-${canvas}-${theme}.svg`, dest), svg);
    return { svg, title: `${index + 1}. ${snapshot.step.title}` };
  });
  const columns = canvas === 'wide' ? 3 : 4; const rows = Math.ceil(steps.length / columns);
  const ink = theme === 'dark' ? '#e7ecf6' : '#15213b';
  const cells = steps.map(({ svg, title }, index) => `<text x="${(index % columns) * (W + 20) + 20}" y="${Math.floor(index / columns) * (H + 60) + 40}" font-size="26" font-family="system-ui,sans-serif" fill="${ink}">${title.replace(/&/g, '&amp;')}</text>${svg.replace('<svg ', `<svg x="${(index % columns) * (W + 20) + 10}" y="${Math.floor(index / columns) * (H + 60) + 55}" `)}`).join('');
  writeFileSync(new URL(`sequence-${canvas}-${theme}.svg`, dest), `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * (W + 20)}" height="${rows * (H + 60) + 10}" viewBox="0 0 ${columns * (W + 20)} ${rows * (H + 60) + 10}"><rect width="100%" height="100%" fill="${theme === 'dark' ? '#0e1422' : '#f5f7fb'}"/>${cells}</svg>`);
}
console.log(`Saved ${fileURLToPath(dest)}`);
