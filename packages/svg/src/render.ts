import type { SvgScene } from './scene';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

export function renderSvg(scene: SvgScene, options: { idPrefix?: string; selectedActor?: string | null } = {}): string {
  const prefix = escape(options.idPrefix ?? 'mm');
  const connections = scene.connections.map(connection => `<path class="mm-connection" d="M${connection.from.x} ${connection.from.y} Q${(connection.from.x + connection.to.x) / 2 + 28} ${(connection.from.y + connection.to.y) / 2} ${connection.to.x} ${connection.to.y}" />`).join('');
  const actors = scene.actors.map(actor => actor.type === 'dna' || actor.type === 'rna'
    ? nucleicAcid(actor.id, actor.label, actor.x, actor.y, actor.color, actor.id === options.selectedActor)
    : molecule(actor.id, actor.label, actor.x, actor.y, actor.color, actor.polymer, actor.id === options.selectedActor)).join('');
  const lesions = scene.lesions.map(lesion => `<g class="mm-lesion" transform="translate(${lesion.x} ${lesion.y})" aria-label="${escape(lesion.type)}"><path d="M-13-24l9 11-8 10 10 12M13-24L4-13l8 10-10 12" /></g>`).join('');
  return `<svg class="mm-svg" viewBox="0 0 ${scene.width} ${scene.height}" role="img" aria-labelledby="${prefix}-title ${prefix}-description" xmlns="http://www.w3.org/2000/svg"><title id="${prefix}-title">${escape(scene.title)}</title><desc id="${prefix}-description">${escape(scene.description)}</desc><g class="mm-connections">${connections}</g><g class="mm-actors">${actors}</g><g class="mm-lesions">${lesions}</g></svg>`;
}

function nucleicAcid(id: string, label: string, x: number, y: number, color: string, selected: boolean) {
  return `<g class="mm-actor mm-nucleic" data-actor="${escape(id)}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="${escape(label)}" style="--mm-actor:${escape(color)}"><text x="${x}" y="${y - 42}" text-anchor="middle">${escape(label)}</text><path d="M70 ${y - 12}C190 ${y - 58},${x - 100} ${y + 34},${x} ${y - 8}S710 ${y - 58},830 ${y - 12}M70 ${y + 12}C190 ${y + 58},${x - 100} ${y - 34},${x} ${y + 8}S710 ${y + 58},830 ${y + 12}" /></g>`;
}

function molecule(id: string, label: string, x: number, y: number, color: string, polymer?: { product: string; length: number }, selected = false) {
  const beads = polymer ? Array.from({ length: Math.min(polymer.length, 14) }, (_, index) => `<circle cx="${x + 50 + index * 11}" cy="${y - 32 + Math.sin(index * .8) * 13}" r="6" />`).join('') : '';
  return `<g class="mm-actor mm-molecule" data-actor="${escape(id)}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="${escape(label)}" style="--mm-actor:${escape(color)}"><circle class="mm-halo" cx="${x}" cy="${y}" r="46"/><path class="mm-blob" d="M${x - 43} ${y}C${x - 43} ${y - 33},${x - 13} ${y - 44},${x + 8} ${y - 34}C${x + 37} ${y - 42},${x + 51} ${y - 13},${x + 39} ${y + 11}C${x + 48} ${y + 39},${x + 13} ${y + 48},${x - 10} ${y + 36}C${x - 35} ${y + 45},${x - 51} ${y + 20},${x - 43} ${y}Z"/><text x="${x}" y="${y + 4}" text-anchor="middle">${escape(label)}</text>${polymer ? `<g class="mm-polymer">${beads}<text x="${x + 53}" y="${y - 55}">${escape(polymer.product)}</text></g>` : ''}</g>`;
}

export const molecularMotionCss = `
.mm-svg{display:block;width:100%;height:auto;background:radial-gradient(circle at 50% 62%,#22d3ee10,transparent 35%)}
.mm-connection{fill:none;stroke:#64748b;stroke-width:1.5;stroke-dasharray:5 7;vector-effect:non-scaling-stroke;animation:mm-dash 1s linear infinite}
.mm-actor{cursor:pointer;outline:none}.mm-actor text{fill:#f8fafc;font:600 13px system-ui,sans-serif}.mm-nucleic path{fill:none;stroke:var(--mm-actor);stroke-width:3;vector-effect:non-scaling-stroke}.mm-nucleic text{font:500 13px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase}
.mm-blob{fill:color-mix(in srgb,var(--mm-actor) 18%,#111827);stroke:var(--mm-actor);stroke-width:2;filter:drop-shadow(0 7px 15px #0008);animation:mm-enter .45s cubic-bezier(.2,.8,.2,1)}.mm-halo{fill:none;stroke:transparent;stroke-width:3}.mm-actor:hover .mm-halo,.mm-actor:focus .mm-halo,.mm-actor[aria-pressed=true] .mm-halo{stroke:#22d3ee}
.mm-lesion path{fill:none;stroke:#fb923c;stroke-width:3}.mm-polymer circle{fill:var(--mm-actor);stroke:#fff;stroke-width:1;animation:mm-enter .35s both}.mm-polymer text{font:500 11px ui-monospace,monospace;fill:#cbd5e1}
@keyframes mm-enter{from{opacity:0;transform:translateY(-8px) scale(.9)}}@keyframes mm-dash{to{stroke-dashoffset:-12}}
@media(prefers-reduced-motion:reduce){.mm-svg *{animation-duration:.001ms!important;animation-iteration-count:1!important}}
`;
