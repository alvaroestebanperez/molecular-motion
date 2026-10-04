// Build the packages first. Renders every step of the p53–MDM2 example with the demo's presentation choices.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileMechanism, parseMechanism } from '../packages/core/dist/index.js';
import { buildSvgScene, exportSvg, COMPOSED_COMPLEX_VISUAL } from '../packages/svg/dist/index.js';

const dest = new URL('../artifacts/p53-mdm2-sequence/', import.meta.url);
mkdirSync(dest, { recursive: true });
const mechanism = compileMechanism(parseMechanism(readFileSync(new URL('../examples/p53-mdm2-feedback.yaml', import.meta.url), 'utf8')));
// Presentation only: the proteasome is one generic complex actor, drawn as a composed barrel with two caps.
const proteinVisuals = { proteasome: COMPOSED_COMPLEX_VISUAL };
for (const theme of ['light', 'dark']) {
  const steps = Array.from({ length: mechanism.length }, (_, index) => {
    const snapshot = mechanism.at(index);
    const svg = exportSvg(buildSvgScene(snapshot, { proteinVisuals }), { theme, idPrefix: `p53-${theme}-${index}` }).replace(/^<\?xml[^>]+>\s*/, '');
    writeFileSync(new URL(`${String(index + 1).padStart(2, '0')}-${snapshot.step.id}-${theme}.svg`, dest), svg);
    return { svg, title: `${index + 1}. ${snapshot.step.title}` };
  });
  const columns = 3; const rows = Math.ceil(steps.length / columns);
  const ink = theme === 'dark' ? '#e7ecf6' : '#15213b';
  const cells = steps.map(({ svg, title }, index) => `<text x="${(index % columns) * 980 + 20}" y="${Math.floor(index / columns) * 600 + 40}" font-size="26" font-family="system-ui,sans-serif" fill="${ink}">${title.replace(/&/g, '&amp;')}</text>${svg.replace('<svg ', `<svg x="${(index % columns) * 980 + 10}" y="${Math.floor(index / columns) * 600 + 55}" `)}`).join('');
  writeFileSync(new URL(`sequence-${theme}.svg`, dest), `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * 980}" height="${rows * 600 + 10}" viewBox="0 0 ${columns * 980} ${rows * 600 + 10}"><rect width="100%" height="100%" fill="${theme === 'dark' ? '#0e1422' : '#f5f7fb'}"/>${cells}</svg>`);
}
console.log(`Saved ${fileURLToPath(dest)}`);
