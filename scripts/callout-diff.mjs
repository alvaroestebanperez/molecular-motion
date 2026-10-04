// Before/after review of callout placement. "After" is the current build (npm run build first).
// "Before" is the committed renderer, bundled once into artifacts/callout-diff/_before/:
//   mkdir -p artifacts/callout-diff/_before && git archive HEAD packages/svg/src | tar -x -C artifacts/callout-diff/_before
//   npx esbuild artifacts/callout-diff/_before/packages/svg/src/index.ts --bundle --format=esm --platform=node --external:@molecular-motion/core --outfile=artifacts/callout-diff/_before/svg.mjs
//   npx esbuild packages/react/src/player.ts --bundle --format=esm --platform=node --external:@molecular-motion/core --external:react --outfile=artifacts/callout-diff/_before/player.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileMechanism, parseMechanism } from '../packages/core/dist/index.js';
import * as after from '../packages/svg/dist/index.js';
const dest = new URL('../artifacts/callout-diff/', import.meta.url);
const before = await import(new URL('_before/svg.mjs', dest));
const { firstAppearances, upcomingActors } = await import(new URL('_before/player.mjs', dest));
mkdirSync(dest, { recursive: true });

const place = actor => `${actor.labelSide === 1 ? 'right' : 'left'}${actor.labelDrop ? ', below' : actor.labelLift ? `, +${actor.labelLift}` : ''}`;
const chainPlace = actor => actor.chain ? JSON.stringify(actor.chain.callout ?? 'usual') : '';
const rows = [];
// The current examples, and the frozen legacy documents whose callouts differ from them (the render baseline covers both).
const SOURCES = [
  ['parp1-ssb-repair', '../examples/parp1-ssb-repair.yaml'], ['homologous-recombination', '../examples/homologous-recombination.yaml'], ['egfr-dimerization', '../examples/egfr-dimerization.yaml'],
  ['homologous-recombination (schema v2)', '../packages/svg/test/fixtures/v2/homologous-recombination.yaml'], ['homologous-recombination (schema v3)', '../packages/core/test/fixtures/v3/homologous-recombination.yaml'],
];
for (const [name, path] of SOURCES) {
  const mechanism = compileMechanism(parseMechanism(readFileSync(new URL(path, import.meta.url), 'utf8')));
  const appearances = firstAppearances(mechanism);
  for (let index = 0; index < mechanism.length; index++) for (const mode of ['full', 'ghosts']) {
    const snapshot = mechanism.at(index);
    const options = mode === 'ghosts' ? { ghosts: upcomingActors(appearances, index) } : {};
    const [a, b] = [before.buildSvgScene(snapshot, options), after.buildSvgScene(snapshot, options)];
    const changes = b.actors.flatMap(actor => {
      const old = a.actors.find(item => item.id === actor.id);
      if (!old || actor.ghost) return [];
      return [
        ...(place(old) !== place(actor) ? [`${after.calloutText ? '' : ''}${actor.label}${actor.group?.size > 1 ? ` ×${actor.group.size}` : ''}: ${place(old)} → ${place(actor)}`] : []),
        ...(chainPlace(old) !== chainPlace(actor) ? [`${actor.chain.label} chain callout moved`] : []),
      ];
    });
    // In ghost mode only report what the ghosts changed, not what the full view already shows.
    if (!changes.length || (mode === 'ghosts' && rows.some(row => row.name === name && row.index === index && row.mode === 'full' && JSON.stringify(row.changes) === JSON.stringify(changes)))) continue;
    rows.push({ name, index, step: snapshot.step.id, title: snapshot.step.title, mode, changes, conflicts: b.calloutConflicts,
      exportBefore: before.exportSvg(a, { theme: 'light', idPrefix: `eb${rows.length}` }), exportAfter: after.exportSvg(b, { theme: 'light', idPrefix: `ea${rows.length}` }),
      before: before.renderSvg(a, { idPrefix: `b${rows.length}`, interactive: false }), after: after.renderSvg(b, { idPrefix: `a${rows.length}`, interactive: false }) });
  }
}
const css = after.molecularMotionCss;
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Etiquetas · antes y después</title>
<style>${css} body{margin:24px;font-family:system-ui;background:#eef1f6;color:#15213b}h1{font-size:24px}section{margin:28px 0;padding:16px;background:#fff;border-radius:14px}h2{font-size:17px;margin:0 0 4px}ul{margin:4px 0 12px;padding-left:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}figcaption{font-weight:600;margin-bottom:6px}svg{width:100%;height:auto;background:#f5f7fb;border-radius:10px}</style>
<h1>Etiquetas que cambian respecto a los baselines anteriores (${rows.length} escenas)</h1>
${rows.map(row => `<section><h2>${row.name} · ${row.index + 1}. ${row.title}${row.mode === 'ghosts' ? ' · con actores futuros' : ''}</h2><ul>${row.changes.map(change => `<li>${change}</li>`).join('')}${row.conflicts.length ? `<li>Conflictos que quedan: ${row.conflicts.map(c => `${c.actor} (${c.hard} duros, ${c.ghost} sobre futuros)`).join(', ')}</li>` : ''}</ul><div class="pair"><figure><figcaption>Antes</figcaption>${row.before}</figure><figure><figcaption>Después</figcaption>${row.after}</figure></div></section>`).join('')}</html>`;
writeFileSync(new URL('index.html', dest), html);
// One standalone before|after image per scene, for review outside the browser.
rows.forEach((row, n) => {
  const cell = (svg, x) => svg.replace(/^<\?xml[^>]+>\s*/, '').replace('<svg ', `<svg x="${x}" y="50" `);
  writeFileSync(new URL(`pair-${String(n + 1).padStart(2, '0')}-${row.name.replace(/[^a-z0-9]+/g, '-')}-${row.step}-${row.mode}.svg`, dest),
    `<svg xmlns="http://www.w3.org/2000/svg" width="1940" height="610" viewBox="0 0 1940 610"><rect width="100%" height="100%" fill="#fff"/><text x="10" y="32" font-size="24" font-family="system-ui">Antes · ${row.name} · ${row.title}${row.mode === 'ghosts' ? ' · con actores futuros' : ''}</text><text x="990" y="32" font-size="24" font-family="system-ui">Después · ${row.changes.join('; ').replace(/&/g, '&amp;')}</text>${cell(row.exportBefore, 0)}${cell(row.exportAfter, 980)}</svg>`);
});
writeFileSync(new URL('changes.json', dest), JSON.stringify(rows.map(({ before: _b, after: _a, exportBefore: _eb, exportAfter: _ea, ...row }) => row), null, 2));
// Record of what the layout could not clear, on the wide canvas and the narrow (phone) one, with upcoming actors shown.
const remaining = [];
for (const name of ['parp1-ssb-repair', 'homologous-recombination', 'egfr-dimerization', 'p53-mdm2-feedback']) {
  const mechanism = compileMechanism(parseMechanism(readFileSync(new URL(`../examples/${name}.yaml`, import.meta.url), 'utf8')));
  const appearances = firstAppearances(mechanism);
  for (const [canvas, size] of [['wide', {}], ['narrow', { width: 520, height: 600 }]]) for (let index = 0; index < mechanism.length; index++) {
    const scene = after.buildSvgScene(mechanism.at(index), { ...size, ghosts: upcomingActors(appearances, index), ...(name.startsWith('p53') && { proteinVisuals: { proteasome: after.COMPOSED_COMPLEX_VISUAL } }) });
    for (const conflict of scene.calloutConflicts) remaining.push({ mechanism: name, canvas, step: mechanism.at(index).step.id, ...conflict });
  }
}
writeFileSync(new URL('remaining-conflicts.json', dest), JSON.stringify(remaining, null, 2));
const tally = (canvas, test) => remaining.filter(item => item.canvas === canvas && test(item)).length;
console.log(`Remaining conflicts — wide: ${tally('wide', item => item.hard > 0)} hard, ${tally('wide', item => item.hard === 0)} ghost-only; narrow: ${tally('narrow', item => item.hard > 0)} hard, ${tally('narrow', item => item.hard === 0)} ghost-only`);
for (const row of rows) console.log(`${row.name} ${row.step} [${row.mode}]: ${row.changes.join('; ')}${row.conflicts.length ? ` | left: ${row.conflicts.map(c => `${c.actor} h${c.hard} g${c.ghost}`).join(', ')}` : ''}`);
console.log(`Saved ${fileURLToPath(new URL('index.html', dest))}`);
