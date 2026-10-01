import { hashString } from './scene';

export type ProteinVisualState = 'normal' | 'active' | 'inactive' | 'inhibited' | 'degraded' | 'selected' | 'future';
export type ModificationVisualKind = 'phosphorylation' | 'acetylation' | 'methylation' | 'ubiquitination' | 'sumoylation' | 'glycosylation' | 'parylation';
export type DnaVisualState = 'normal' | 'damaged' | 'cleaved' | 'unwound' | 'resected' | 'elongating' | 'repaired';
export type VisualLesion = 'damaged-base' | 'ap-site' | 'mismatch' | 'nick' | 'ssb' | 'dsb' | 'crosslink' | 'adduct';
export type ActionVisualKind = 'bind' | 'unbind' | 'recruit' | 'dimerize' | 'activate' | 'inhibit' | 'modify' | 'cleave' | 'ligate' | 'synthesize' | 'degrade' | 'translocate' | 'polymerize' | 'unwind' | 'elongate' | 'conformational-change';

export interface ProteinSphere { x: number; y: number; r: number; depth: number }
export interface ProteinPrimitiveOptions {
  visualSeed: string;
  radius?: number;
  fill?: string;
  state?: ProteinVisualState;
  modifications?: readonly { kind: ModificationVisualKind; length?: number; branched?: boolean }[];
}

const esc = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const round = (value: number) => Math.round(value * 10) / 10;

/** Stable pseudo-3D surface geometry. It never reads biological role or global randomness. */
export function proteinGeometry(visualSeed: string, radius = 52, count = 28): ProteinSphere[] {
  let state = hashString(visualSeed) || 1;
  const random = () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507) ^ Math.imul(state ^ (state >>> 13), 3266489909);
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
  const aspect = .88 + random() * .34;
  const lobes = 2 + Math.floor(random() * 3);
  const spheres: ProteinSphere[] = [];
  for (let index = 0; index < count; index++) {
    const lobe = index % lobes;
    const lobeAngle = lobe / lobes * Math.PI * 2 + random() * .35;
    const lobeX = Math.cos(lobeAngle) * radius * .2;
    const lobeY = Math.sin(lobeAngle) * radius * .13;
    const angle = index * 2.399963 + random() * .55;
    const distance = radius * (.08 + .5 * Math.sqrt(index / count));
    const depth = random();
    spheres.push({
      x: lobeX + Math.cos(angle) * distance * aspect,
      y: lobeY + Math.sin(angle) * distance / aspect * .88,
      r: radius * (.16 + random() * .1) * (.88 + depth * .18),
      depth,
    });
  }
  return spheres.sort((a, b) => a.depth - b.depth);
}

export function renderProteinPrimitive(options: ProteinPrimitiveOptions): string {
  const radius = options.radius ?? 52;
  const state = options.state ?? 'normal';
  const fill = options.fill ?? 'var(--mm-protein,#7d78d8)';
  const spheres = proteinGeometry(options.visualSeed, radius, state === 'degraded' ? 18 : 28);
  const fragmented = state === 'degraded';
  const body = spheres.map((sphere, index) => {
    const scatter = fragmented ? 1.25 + index / spheres.length * .8 : 1;
    const opacity = .72 + sphere.depth * .28;
    return `<circle cx="${round(sphere.x * scatter)}" cy="${round(sphere.y * scatter)}" r="${round(sphere.r)}" opacity="${round(opacity)}"/>`;
  }).join('');
  const halo = state === 'active' || state === 'selected' ? `<circle class="mm-primitive__halo" r="${radius + 14}"/>` : '';
  const inhibit = state === 'inhibited' ? `<g class="mm-primitive__inhibition"><circle r="${radius + 8}"/><path d="M${-radius * .72} ${radius * .72}L${radius * .72} ${-radius * .72}"/></g>` : '';
  const modifications = (options.modifications ?? []).map((modification, index) => renderModificationPrimitive(modification, {
    x: Math.cos(-2.3 + index * .55) * radius * .92,
    y: Math.sin(-2.3 + index * .55) * radius * .92,
  })).join('');
  return `<g class="mm-primitive mm-primitive--protein mm-primitive--${state}" data-visual-seed="${esc(options.visualSeed)}" style="--mm-protein:${esc(fill)}">${halo}<g class="mm-primitive__surface" fill="${esc(fill)}">${body}</g>${inhibit}${modifications}</g>`;
}

const MODIFICATION_LABELS: Record<ModificationVisualKind, string> = {
  phosphorylation: 'P', acetylation: 'Ac', methylation: 'Me', ubiquitination: 'Ub', sumoylation: 'SUMO', glycosylation: 'sugar', parylation: 'PAR',
};

export function renderModificationPrimitive(modification: { kind: ModificationVisualKind; length?: number; branched?: boolean }, at = { x: 0, y: 0 }): string {
  const { kind } = modification;
  if (kind === 'parylation' || (kind === 'ubiquitination' && (modification.length ?? 0) > 1)) {
    const count = Math.max(2, Math.min(modification.length ?? 6, 14));
    const links: string[] = [];
    const beads: string[] = [];
    let previous = at;
    for (let index = 0; index < count; index++) {
      const point = { x: at.x + 11 + index * 12, y: at.y - index * 7 + Math.sin(index * 1.2) * 6 };
      links.push(`M${round(previous.x)} ${round(previous.y)}L${round(point.x)} ${round(point.y)}`);
      beads.push(`<circle cx="${round(point.x)}" cy="${round(point.y)}" r="${kind === 'ubiquitination' ? 7 : 5.5}"/>`);
      if (modification.branched && index > 1 && index % 4 === 2) {
        links.push(`M${round(point.x)} ${round(point.y)}l-3 -15`);
        beads.push(`<circle cx="${round(point.x - 3)}" cy="${round(point.y - 15)}" r="5"/>`);
      }
      previous = point;
    }
    return `<g class="mm-modification mm-modification--chain mm-modification--${kind}"><path d="${links.join('')}"/>${beads.join('')}</g>`;
  }
  const label = MODIFICATION_LABELS[kind];
  const width = Math.max(18, label.length * 6 + 10);
  return `<g class="mm-modification mm-modification--${kind}" transform="translate(${round(at.x)} ${round(at.y)})"><rect x="${-width / 2}" y="-10" width="${width}" height="20" rx="10"/><text y="3.5">${label}</text></g>`;
}

export interface SmallMoleculeOptions { visualSeed: string; label?: string; x?: number; y?: number; scale?: number; ion?: boolean }
export function renderSmallMoleculePrimitive(options: SmallMoleculeOptions): string {
  const x = options.x ?? 0; const y = options.y ?? 0; const scale = options.scale ?? 1;
  const seed = hashString(options.visualSeed);
  const count = options.ion ? 1 : 5 + seed % 5;
  const points = Array.from({ length: count }, (_, index) => ({
    x: x + (index - (count - 1) / 2) * 10 * scale,
    y: y + Math.sin(index * (1.35 + seed % 3 * .2) + seed % 7) * 9 * scale,
    r: (options.ion ? 9 : 4.5 + (seed + index) % 3) * scale,
    atom: ['c', 'n', 'o', 'p'][(seed + index * 3) % 4]!,
  }));
  const bonds = points.slice(1).map((point, index) => `<path d="M${round(points[index]!.x)} ${round(points[index]!.y)}L${round(point.x)} ${round(point.y)}"/>`).join('');
  const atoms = points.map(point => `<circle class="mm-atom mm-atom--${point.atom}" cx="${round(point.x)}" cy="${round(point.y)}" r="${round(point.r)}"/>`).join('');
  return `<g class="mm-primitive mm-primitive--molecule" data-visual-seed="${esc(options.visualSeed)}"><g class="mm-molecule__bonds">${bonds}</g>${atoms}${options.label ? `<text class="mm-molecule__label" x="${round(x)}" y="${round(y - 20 * scale)}">${esc(options.label)}</text>` : ''}</g>`;
}

export interface NucleicAcidOptions {
  kind?: 'dsdna' | 'ssdna' | 'rna' | 'mrna'; state?: DnaVisualState; lesion?: VisualLesion; x?: number; y?: number; width?: number;
  /** Elongating state: requested 5′ start and 3′ end of the nascent strand, as fractions of `width`. */
  nascent?: { start?: number; end?: number };
  /** Elongating state: grow the nascent strand from its 3′ end (5′ fixed). Static under reduced motion. Default true. */
  animate?: boolean;
  /** Elongating state: label 5′/3′ polarity of the template and nascent strands. */
  showDirectionality?: boolean;
}

const HELIX_AMPLITUDE = 13;
const HELIX_SCALE = 25;
const HALF_TURN = Math.PI * HELIX_SCALE;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface NascentStrandGeometry {
  phase: number;
  /** Absolute x where the nascent strand starts growing when animated. */
  growFromX: number;
  /** Attributes for a group that should travel with the 3′ end (class `mm-nucleic__follow`). */
  follow: string;
  fivePrime: { x: number; y: number };
  threePrime: { x: number; y: number };
  templateY(x: number): number;
  nascentY(x: number): number;
}

/**
 * Geometry of a template strand partially copied by a complementary nascent strand. The nascent
 * strand is the template's partner backbone, so it can never cross between backbones. Its 5′ and 3′
 * ends sit at points of maximal strand separation, where no helix crossing can hide them.
 */
export function nascentStrandGeometry(options: NucleicAcidOptions = {}): NascentStrandGeometry {
  const x0 = options.x ?? 0; const y0 = options.y ?? 0; const width = options.width ?? 220;
  const start = clamp(options.nascent?.start ?? .05, 0, .9) * width;
  const requested = Math.round(((options.nascent?.end ?? .7) * width - start) / HALF_TURN);
  const halfTurns = clamp(requested, 1, Math.max(1, Math.floor((width - start) / HALF_TURN)));
  const end = Math.min(width, start + halfTurns * HALF_TURN);
  const phase = Math.PI / 2 - start / HELIX_SCALE;
  const templateY = (x: number) => y0 + Math.sin((x - x0) / HELIX_SCALE + phase) * HELIX_AMPLITUDE;
  const nascentY = (x: number) => 2 * y0 - templateY(x);
  const point = (px: number) => ({ x: round(x0 + px), y: round(nascentY(x0 + px)) });
  const growFromX = round(x0 + start + (end - start) * .35);
  const follow = `class="mm-nucleic__follow" style="--mm-follow-from:${round(growFromX - x0 - end)}px"`;
  return { phase, growFromX, follow, fivePrime: point(start), threePrime: point(end), templateY, nascentY };
}

/** Template + partial nascent strand. Final geometry is static; CSS only reveals it from 5′ to 3′. */
function renderElongatingNucleicAcid(options: NucleicAcidOptions): string {
  const x0 = options.x ?? 0; const y0 = options.y ?? 0; const width = options.width ?? 220;
  const animate = options.animate ?? true;
  const geometry = nascentStrandGeometry(options);
  const { fivePrime, threePrime, templateY, nascentY } = geometry;
  const xs = (from: number, to: number) => {
    const values = [from];
    for (let x = Math.ceil(from / 4) * 4; x < to; x += 4) if (x > from) values.push(x);
    return [...values, to];
  };
  const template = xs(x0, x0 + width).map((x, index) => `${index ? 'L' : 'M'}${round(x)} ${round(templateY(x))}`).join('');
  const nascentXs = xs(fivePrime.x, threePrime.x);
  const nascent = nascentXs.map((x, index) => `${index ? 'L' : 'M'}${round(x)} ${round(nascentY(x))}`).join('');
  // Cumulative arc length of the nascent polyline, so CSS dash fractions map to positions on it.
  const arc = [0];
  for (let index = 1; index < nascentXs.length; index++) {
    const [a, b] = [nascentXs[index - 1]!, nascentXs[index]!];
    arc.push(arc[index - 1]! + Math.hypot(b - a, nascentY(b) - nascentY(a)));
  }
  const total = arc[arc.length - 1]!;
  const fractionAt = (x: number) => {
    const index = Math.max(1, nascentXs.findIndex(value => value >= x));
    const [a, b] = [nascentXs[index - 1]!, nascentXs[index]!];
    return (arc[index - 1]! + (arc[index]! - arc[index - 1]!) * (b > a ? (x - a) / (b - a) : 0)) / total;
  };
  const grownFrom = fractionAt(geometry.growFromX);
  const grow = (className: string, from: number, to: number) => animate
    ? ` class="${`${className} mm-nucleic__grow`.trim()}" style="--mm-grow-from:${Math.round(from * 1000) / 1000};--mm-grow-to:${Math.round(to * 1000) / 1000}"`
    : className ? ` class="${className}"` : '';

  const templateBases: string[] = [];
  const newBases: string[] = [];
  for (let px = 5; px <= width; px += 16) {
    const x = x0 + px;
    if (Math.abs(templateY(x) - y0) < 2.5) continue;
    templateBases.push(`<path d="M${round(x)} ${round(templateY(x))}L${round(x)} ${y0}"/>`);
    if (x < fivePrime.x || x > threePrime.x) continue;
    const at = fractionAt(x);
    // With a 1000/1000 dash, offsets above 1000 hide the base and offsets up to 999 show it fully:
    // the offset falls linearly with the 3′ end's progress, so each base appears as the end reaches it.
    const offset = (progress: number) => 999 + 40 * (at - progress);
    const attributes = at > grownFrom ? grow('', offset(grownFrom), offset(1)) : '';
    newBases.push(`<path${attributes} pathLength="1" stroke-dasharray="1000 1000" stroke-dashoffset="${round(offset(1))}" d="M${round(x)} ${round(nascentY(x))}L${round(x)} ${y0}"/>`);
  }

  const polarity = options.showDirectionality ? (() => {
    const outward = (point: { x: number; y: number }) => point.y + Math.sign(point.y - y0 || -1) * 14 + 3;
    const text = (value: string, x: number, y: number, extra = '') => `<text class="mm-nucleic__polarity${extra}" x="${round(x)}" y="${round(y)}">${value}</text>`;
    return `<g class="mm-nucleic__polarities">`
      + text('3′', x0 - 9, templateY(x0) + 3) + text('5′', x0 + width + 9, templateY(x0 + width) + 3)
      + text('5′', fivePrime.x - 2, outward(fivePrime))
      + text('3′', threePrime.x + 4, outward(threePrime), animate ? ' mm-nucleic__polarity--grow' : '')
      + `</g>`;
  })() : '';

  return `<g class="mm-primitive mm-primitive--nucleic mm-primitive--${options.kind ?? 'dsdna'} mm-primitive--elongating" data-five-prime="${fivePrime.x} ${fivePrime.y}" data-three-prime="${threePrime.x} ${threePrime.y}">`
    + `<g class="mm-nucleic__bases">${templateBases.join('')}</g>`
    + `<g class="mm-nucleic__bases mm-nucleic__bases--new">${newBases.join('')}</g>`
    + `<g class="mm-nucleic__nascent"><path${grow('mm-nucleic__new', 1 - grownFrom, 0)} pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0" d="${nascent}"/></g>`
    + `<path class="mm-nucleic__strand mm-nucleic__strand--template" d="${template}"/>`
    + `<g class="mm-nucleic__nascent"><path${grow('mm-nucleic__terminus', -grownFrom, -.999)} pathLength="1" stroke-dasharray=".001 3" stroke-dashoffset="-.999" d="${nascent}"/></g>`
    + polarity + `</g>`;
}

export function renderNucleicAcidPrimitive(options: NucleicAcidOptions = {}): string {
  if (options.state === 'elongating') return renderElongatingNucleicAcid(options);
  const kind = options.kind ?? 'dsdna'; const x0 = options.x ?? 0; const y0 = options.y ?? 0; const width = options.width ?? 220;
  const single = kind !== 'dsdna' || options.state === 'unwound' || options.state === 'resected';
  const phase = (x: number, offset = 0) => y0 + Math.sin(x / 25 + offset) * 13;
  const gap = options.lesion === 'nick' ? 5 : options.lesion === 'ssb' ? 15 : options.lesion === 'dsb' || options.state === 'cleaved' ? 18 : 0;
  const path = (offset: number, broken: boolean) => {
    const segments: string[] = []; let drawing = false;
    for (let px = 0; px <= width; px += 4) {
      const absent = broken && Math.abs(px - width / 2) < gap;
      if (absent) { drawing = false; continue; }
      segments.push(`${drawing ? 'L' : 'M'}${round(x0 + px)} ${round(phase(px, offset))}`); drawing = true;
    }
    return segments.join('');
  };
  const frontBroken = Boolean(gap); const backBroken = options.lesion === 'dsb' || options.state === 'cleaved';
  const rungs = single ? '' : Array.from({ length: Math.floor(width / 16) }, (_, index) => {
    const px = index * 16 + 5;
    if (Math.abs(px - width / 2) < gap + 4 || options.lesion === 'ap-site' && Math.abs(px - width / 2) < 9) return '';
    const mismatch = options.lesion === 'mismatch' && Math.abs(px - width / 2) < 9;
    return `<path class="${mismatch ? 'mm-nucleic__rung--mismatch' : ''}" d="M${round(x0 + px)} ${round(phase(px))}L${round(x0 + px + (mismatch ? 7 : 0))} ${round(phase(px, Math.PI))}"/>`;
  }).join('');
  const lesion = renderLesionPrimitive(options.lesion, { x: x0 + width / 2, y: y0 }, width);
  const second = single ? '' : `<path class="mm-nucleic__strand mm-nucleic__strand--back" d="${path(Math.PI, backBroken)}"/>`;
  const unwound = options.state === 'unwound' ? `<path class="mm-nucleic__strand mm-nucleic__strand--back" d="M${x0 + width * .48} ${y0}Q${x0 + width * .72} ${y0 - 62} ${x0 + width} ${y0 - 38}"/>` : '';
  return `<g class="mm-primitive mm-primitive--nucleic mm-primitive--${kind} mm-primitive--${options.state ?? 'normal'}">${rungs}${second}<path class="mm-nucleic__strand mm-nucleic__strand--front" d="${path(0, frontBroken)}"/>${unwound}${lesion}</g>`;
}

export function renderLesionPrimitive(lesion: VisualLesion | undefined, at: { x: number; y: number }, width = 220): string {
  if (!lesion || lesion === 'nick' || lesion === 'ssb' || lesion === 'dsb') return '';
  const x = round(at.x); const y = round(at.y);
  switch (lesion) {
    case 'damaged-base': return `<g class="mm-lesion mm-lesion--damaged-base"><path d="M${x - 7} ${y - 8}l14 16m0-16-14 16"/></g>`;
    case 'ap-site': return `<circle class="mm-lesion mm-lesion--ap-site" cx="${x}" cy="${y}" r="7"/>`;
    case 'mismatch': return `<g class="mm-lesion mm-lesion--mismatch"><circle cx="${x - 5}" cy="${y - 7}" r="4"/><circle cx="${x + 7}" cy="${y + 7}" r="4"/></g>`;
    case 'crosslink': return `<path class="mm-lesion mm-lesion--crosslink" d="M${x - 11} ${y - 18}Q${x} ${y} ${x + 11} ${y + 18}M${x + 11} ${y - 18}Q${x} ${y} ${x - 11} ${y + 18}"/>`;
    case 'adduct': return `<g class="mm-lesion mm-lesion--adduct"><circle cx="${x}" cy="${y - 4}" r="6"/><circle cx="${x + 9}" cy="${y - 13}" r="5"/><circle cx="${x - 8}" cy="${y - 15}" r="4"/></g>`;
    default: return `<path class="mm-lesion" d="M${x - width * .03} ${y}h${width * .06}"/>`;
  }
}

export interface MembraneOptions { x?: number; y?: number; length?: number; orientation?: 'horizontal' | 'vertical' | 'curved' }
export function renderMembranePrimitive(options: MembraneOptions = {}): string {
  const x = options.x ?? 0; const y = options.y ?? 0; const length = options.length ?? 240; const orientation = options.orientation ?? 'horizontal';
  const lipids = Array.from({ length: Math.floor(length / 14) }, (_, index) => {
    const along = index * 14 + 7;
    const curve = orientation === 'curved' ? Math.sin(along / length * Math.PI) * 18 : 0;
    const transform = orientation === 'vertical' ? `translate(${x + curve} ${y + along}) rotate(90)` : `translate(${x + along} ${y - curve})`;
    return `<g transform="${transform}"><circle cx="0" cy="-9" r="4"/><path d="M-1-5v10M2-5v10"/><circle cx="0" cy="9" r="4"/></g>`;
  }).join('');
  return `<g class="mm-primitive mm-primitive--membrane mm-membrane--${orientation}">${lipids}</g>`;
}

export function renderCompartmentPrimitive(kind: 'extracellular' | 'cytoplasm' | 'nucleus' | 'organelle' | 'er' | 'golgi' | 'mitochondrion' | 'lysosome' | 'endosome', at = { x: 0, y: 0 }): string {
  if (kind === 'extracellular' || kind === 'cytoplasm') return `<g class="mm-primitive mm-compartment mm-compartment--${kind}">${Array.from({ length: 12 }, (_, i) => `<ellipse cx="${at.x + (i * 37) % 180}" cy="${at.y + (i * 23) % 80}" rx="${5 + i % 3 * 2}" ry="${3 + i % 2}"/>`).join('')}</g>`;
  if (kind === 'er' || kind === 'golgi') return `<g class="mm-primitive mm-compartment mm-compartment--${kind}">${Array.from({ length: 5 }, (_, i) => `<path d="M${at.x + 10 + i * 7} ${at.y + 12 + i * 14}C${at.x + 50} ${at.y + i * 14} ${at.x + 130} ${at.y + 28 + i * 10} ${at.x + 180 - i * 8} ${at.y + 12 + i * 14}"/>`).join('')}</g>`;
  const inner = kind === 'mitochondrion' ? `<path d="M${at.x + 25} ${at.y + 48}c22-36 42 36 66 0s42 36 68 0"/>` : '';
  return `<g class="mm-primitive mm-compartment mm-compartment--${kind}"><ellipse cx="${at.x + 95}" cy="${at.y + 48}" rx="88" ry="44"/>${inner}</g>`;
}

export function renderInteractionPrimitive(points: readonly { id: string; x: number; y: number }[]): string {
  if (points.length < 2) return '';
  const links = points.slice(1).map((point, index) => `<path data-interaction="${esc(points[index]!.id)}:${esc(point.id)}" d="M${points[index]!.x} ${points[index]!.y}L${point.x} ${point.y}"/>`).join('');
  return `<g class="mm-primitive mm-primitive--interaction">${links}</g>`;
}

export function renderActionVisual(kind: ActionVisualKind, from: { x: number; y: number }, to: { x: number; y: number }): string {
  const path = `M${from.x} ${from.y}Q${round((from.x + to.x) / 2)} ${round(Math.min(from.y, to.y) - 16)} ${to.x} ${to.y}`;
  if (kind === 'inhibit') return `<g class="mm-action mm-action--inhibit"><path d="${path}"/><path d="M${to.x - 7} ${to.y - 7}l14 14m0-14-14 14"/></g>`;
  if (kind === 'cleave') return `<g class="mm-action mm-action--cleave"><path d="${path}"/><path d="m${to.x - 7} ${to.y - 8} 14 16m0-16-14 16"/></g>`;
  return `<g class="mm-action mm-action--${kind}"><path d="${path}"/><path d="M${to.x - 8} ${to.y - 5}L${to.x} ${to.y}l-8 5"/></g>`;
}

export const primitiveCss = `
.mm-primitive__surface{stroke:color-mix(in srgb,var(--mm-protein) 58%,#17213b);stroke-width:1;filter:drop-shadow(0 4px 4px #17213b20)}
.mm-primitive--inactive{opacity:.48;filter:saturate(.45)}.mm-primitive--future{opacity:.26;filter:blur(2.2px);pointer-events:none}.mm-primitive--degraded{opacity:.55}.mm-primitive__halo{fill:var(--mm-protein);opacity:.16;animation:mm-primitive-breathe 3s ease-in-out infinite}.mm-primitive--selected .mm-primitive__halo{stroke:var(--mm-accent,#2563eb);stroke-width:2}
.mm-primitive__inhibition circle{fill:none;stroke:var(--mm-alert,#e5484d);stroke-width:3}.mm-primitive__inhibition path{stroke:var(--mm-alert,#e5484d);stroke-width:4;stroke-linecap:round}
.mm-modification rect{fill:#fff;stroke:#334155;stroke-width:1}.mm-modification text{text-anchor:middle;fill:#17213b;font:700 9px Inter,system-ui}.mm-modification--phosphorylation rect,.mm-modification--acetylation rect{fill:#f7c85c}.mm-modification--methylation rect{fill:#e9829b}.mm-modification--sumoylation rect{fill:#82b7e8}.mm-modification--glycosylation rect{fill:#ec8bad}.mm-modification--chain path{fill:none;stroke:#c354bd;stroke-width:2}.mm-modification--chain circle{fill:#ce65c6;stroke:#fff;stroke-width:1}
.mm-molecule__bonds{fill:none;stroke:#718096;stroke-width:3;stroke-linecap:round}.mm-atom{stroke:#fff;stroke-width:1}.mm-atom--c{fill:#9aa7bb}.mm-atom--n{fill:#4f84d4}.mm-atom--o{fill:#e75d67}.mm-atom--p{fill:#eaaa38}.mm-molecule__label{text-anchor:middle;fill:currentColor;font:600 10px Inter,system-ui}
.mm-primitive--nucleic path{fill:none;stroke-linecap:round;stroke-linejoin:round}.mm-nucleic__strand{stroke:#477fd8;stroke-width:7}.mm-nucleic__strand--back{stroke:#9bb5e3;stroke-width:6}.mm-primitive--nucleic>path:not(.mm-nucleic__strand):not(.mm-nucleic__new){stroke:#819ed7;stroke-width:2.8}.mm-nucleic__new{stroke:#ed6680;stroke-width:5}.mm-nucleic__terminus{stroke:#e04b67;stroke-width:11}.mm-nucleic__bases path{stroke:#819ed7;stroke-width:2.8}.mm-nucleic__bases--new path{stroke:#f09aac}
.mm-nucleic__polarity{fill:currentColor;font:700 10px Inter,system-ui;text-anchor:middle}.mm-nucleic__grow{animation:mm-nucleic-grow 6s cubic-bezier(.45,0,.35,1) infinite}.mm-nucleic__polarity--grow{animation:mm-nucleic-reveal 6s linear infinite}.mm-nucleic__follow{animation:mm-nucleic-follow 6s cubic-bezier(.45,0,.35,1) infinite}.mm-nucleic__rung--mismatch{stroke:#e5484d!important;stroke-width:4!important}
.mm-lesion{stroke:#e5484d;stroke-width:3;fill:none}.mm-lesion--ap-site{fill:#fff}.mm-lesion--mismatch circle,.mm-lesion--adduct circle{fill:#e5484d;stroke:#fff;stroke-width:1}.mm-lesion--crosslink{stroke-width:4}
.mm-primitive--membrane circle{fill:#e89a83;stroke:#bd705f;stroke-width:1}.mm-primitive--membrane path{stroke:#cb7c69;stroke-width:1.5}.mm-compartment{fill:#8aa7d5;opacity:.72}.mm-compartment path{fill:none;stroke:#5d86cc;stroke-width:6;stroke-linecap:round}.mm-compartment--mitochondrion{fill:#e57443}.mm-compartment--mitochondrion path{stroke:#fff}.mm-compartment--lysosome{fill:#8268bd}.mm-compartment--endosome{fill:#5b8fd8}
.mm-primitive--interaction path{fill:none;stroke:#64748b;stroke-width:2;stroke-dasharray:3 3}.mm-action{color:var(--mm-action,currentColor)}.mm-action path{fill:none;stroke:currentColor;stroke-opacity:.82;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.mm-action--inhibit path{stroke:#e5484d;stroke-opacity:1}.mm-action--cleave path:last-child{stroke-opacity:1;stroke-width:3}
@keyframes mm-primitive-breathe{50%{transform:scale(1.05);opacity:.23}}@keyframes mm-nucleic-grow{0%,12%{stroke-dashoffset:var(--mm-grow-from)}70%,100%{stroke-dashoffset:var(--mm-grow-to)}}@keyframes mm-nucleic-reveal{0%,68%{opacity:0}74%,100%{opacity:1}}@keyframes mm-nucleic-follow{0%,12%{transform:translateX(var(--mm-follow-from))}70%,100%{transform:none}}@media(prefers-reduced-motion:reduce){.mm-primitive *,.mm-action *,.mm-nucleic__follow{animation:none!important;transition:none!important}}
`;
