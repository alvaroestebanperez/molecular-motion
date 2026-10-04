// Build the packages first. Optional PNG rendering: MM_SVG_RASTERIZER=/path/to/resvg-js/index.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PROTEIN_ARCHITECTURES, PROTEIN_PROFILE_CATALOG, resolveProteinVisualProfile,
  renderProteinPrimitive, renderProteinAssembly, renderVocabularyGlyph, primitiveCss, COMPOSED_COMPLEX_TEST,
} from '../packages/svg/dist/index.js';
const dest = new URL('../artifacts/protein-profile-review/', import.meta.url);
mkdirSync(dest, { recursive: true });
const Resvg = process.env.MM_SVG_RASTERIZER ? (await import(process.env.MM_SVG_RASTERIZER)).Resvg : undefined;
const boards = [];
const perRow = 4;
// One section per dimension; the catalog declares which concrete profiles illustrate each.
const sections = [
  ['architecture', 'Arquitectura · forma global'],
  ['fold', 'Fold · motivo estructural del cuerpo plegado'],
  ['disorder', 'Desorden · cola (tail) sobre un cuerpo plegado, o proteína extendida'],
].map(([group, title]) => ({ title, items: PROTEIN_PROFILE_CATALOG.filter(item => item.id.startsWith(`profile-${group}-`)) }));
let cursor = 95;
for (const section of sections) { section.y = cursor; cursor += 36 + Math.ceil(section.items.length / perRow) * 215 + 14; }
const shift = cursor - (95 + 4 * 215); // sections below the grid move down with it
const height = 1480 + shift;
const columns = 10; // small-size row wraps
for (const theme of ['light', 'dark']) {
  const dark = theme === 'dark';
  const palette = { bg: dark ? '#0e1422' : '#f5f7fb', ink: dark ? '#e7ecf6' : '#15213b', line: dark ? '#26314a' : '#dfe4ee', surface: dark ? '#141b2b' : '#ffffff', alert: dark ? '#ff6b6b' : '#e5484d' };
  const css = primitiveCss.replace(/var\(--mm-ink(?:,[^)]+)?\)/g, palette.ink).replace(/var\(--mm-surface(?:,[^)]+)?\)/g, palette.surface).replace(/var\(--mm-alert(?:,[^)]+)?\)/g, palette.alert).replace(/var\(--mm-protein(?:,[^)]+)?\)/g, '#8b78d0').replace(/var\(--mm-accent(?:,[^)]+)?\)/g, '#6ea0ff');
  const text = (content,x,y,size=14,anchor='start') => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${palette.ink}">${content}</text>`;
  const protein = (profile, state, radius=44) => renderProteinPrimitive({ visualSeed: 'architecture-reference', visualProfile: profile, radius, fill: '#8b78d0', state });
  const cards = sections.map(section => text(section.title,20,section.y+18,18) + section.items.map((item,i) => {
    const profile = item.proteinVisual.profile;
    return `<g transform="translate(${20+(i%perRow)*285} ${section.y+36+Math.floor(i/perRow)*215})"><rect width="270" height="200" rx="14" fill="${palette.surface}" stroke="${palette.line}"/>${text(item.label,15,29,item.label.length>30?13:16)}<g transform="translate(72 108)">${protein(profile,'normal')}</g><g transform="translate(202 108)">${protein(profile,'inhibited')}</g>${text('Normal',72,181,12,'middle')}${text('Inhibida',202,181,12,'middle')}</g>`;
  }).join('')).join('');
  const small = PROTEIN_PROFILE_CATALOG.map((item,i) => `<g transform="translate(${45+(i%columns)*60} ${1026+Math.floor(i/columns)*46})">${protein(item.proteinVisual.profile,i%2?'inhibited':'normal',17)}</g>`).join('');
  const crowded = Array.from({length:6},(_,i)=>`<g transform="translate(${720+i*58} 1033)">${protein(resolveProteinVisualProfile({architecture:'surface'}),'inhibited',22)}</g>`).join('');
  const assembly = `<g transform="translate(250 1280) scale(1.9)">${renderProteinAssembly(COMPOSED_COMPLEX_TEST)}</g>`;
  const legends = `${text('19S · multisubunit',400,1185,16)}${text('20S · barrel',400,1285,16)}${text('19S · multisubunit',400,1385,16)}`;
  const poly = renderVocabularyGlyph('ubiquitination', {idPrefix:`poly-${theme}`}).replace('<svg ', '<svg x="760" y="1150" ').replace(/<style>[\s\S]*?<\/style>/, '');
  const content = `${text('Molecular Motion · perfiles visuales genéricos',20,40,26)}${text('Tres dimensiones independientes: arquitectura, fold y desorden · misma identidad normal/inhibida',20,69,16)}${cards}<g transform="translate(0 ${shift})">${text('Tamaño pequeño (radio 17 px), en el orden de las tarjetas',25,992,16)}${small}${text('Coexistencia de estados inhibidos',660,992,16)}${crowded}${text('26S compuesto · prueba de presentación',25,1120,21)}${assembly}${legends}${text('Poly-Ub · una modificación, cuatro marcadores',750,1120,17)}${poly}${text('Geometría conceptual SVG; sin PDB, actores adicionales ni selección por nombre.',25,1445,15)}</g>`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="${height}" viewBox="0 0 1180 ${height}" class="mm-profile-review-${theme}" role="img" aria-labelledby="title-${theme}"><title id="title-${theme}">Comparación de ${PROTEIN_PROFILE_CATALOG.length} perfiles visuales y complejo 26S compuesto, ${theme}</title><style>${css.replace(/&/g,'&amp;').replace(/</g,'&lt;')} .mm-profile-review-${theme} text{font-family:system-ui,sans-serif}</style><rect width="1180" height="${height}" fill="${palette.bg}"/>${content}</svg>`;
  svg = svg.replace(/var\(--mm-alert(?:,[^)]+)?\)/g, palette.alert).replace(/var\(--mm-ink(?:,[^)]+)?\)/g, palette.ink).replace(/var\(--mm-surface(?:,[^)]+)?\)/g, palette.surface);
  writeFileSync(new URL(`comparison-${theme}.svg`, dest), svg);
  if (Resvg) writeFileSync(new URL(`comparison-${theme}.png`, dest), new Resvg(svg, { fitTo: { mode: 'width', value: 1180 } }).render().asPng());
  boards.push(`<section><h2>${theme === 'light' ? 'Claro' : 'Oscuro'}</h2><img src="comparison-${theme}.svg" alt="${PROTEIN_PROFILE_CATALOG.length} perfiles, estados y prueba 26S, tema ${theme}"></section>`);
}
writeFileSync(new URL('comparison.html',dest), `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Perfiles de proteínas · revisión</title><style>body{margin:24px;font-family:system-ui;background:#eef1f6;color:#15213b}section{margin:32px 0}img{width:100%;max-width:1180px;height:auto;border-radius:12px}h1{font-size:26px}</style><h1>Perfiles de proteína · arquitectura, fold y desorden</h1><p>${PROTEIN_PROFILE_CATALOG.length} perfiles, comparación normal/inhibida, lectura a tamaño pequeño y 26S compuesto. La prueba 26S permanece en el catálogo; no se integra en p53–MDM2.</p>${boards.join('')}</html>`);
console.log(`Saved ${fileURLToPath(new URL('comparison.html',dest))}`);
