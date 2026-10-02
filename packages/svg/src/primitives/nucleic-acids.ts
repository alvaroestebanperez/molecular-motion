import { type VisualLesion, renderLesionPrimitive } from './lesions';
import { round, clamp } from './shared';

export type DnaVisualState = 'normal' | 'damaged' | 'cleaved' | 'unwound' | 'resected' | 'elongating' | 'repaired';

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

/** Nucleic acids, including the elongating strand. */
export const nucleicCss = `.mm-primitive--nucleic path{fill:none;stroke-linecap:round;stroke-linejoin:round}.mm-nucleic__strand{stroke:#477fd8;stroke-width:7}.mm-nucleic__strand--back{stroke:#9bb5e3;stroke-width:6}.mm-primitive--nucleic>path:not(.mm-nucleic__strand):not(.mm-nucleic__new){stroke:#819ed7;stroke-width:2.8}.mm-nucleic__new{stroke:#ed6680;stroke-width:5}.mm-nucleic__terminus{stroke:#e04b67;stroke-width:11}.mm-nucleic__bases path{stroke:#819ed7;stroke-width:2.8}.mm-nucleic__bases--new path{stroke:#f09aac}
.mm-nucleic__polarity{fill:currentColor;font:700 10px Inter,system-ui;text-anchor:middle}.mm-nucleic__grow{animation:mm-nucleic-grow 6s cubic-bezier(.45,0,.35,1) infinite}.mm-nucleic__polarity--grow{animation:mm-nucleic-reveal 6s linear infinite}.mm-nucleic__follow{animation:mm-nucleic-follow 6s cubic-bezier(.45,0,.35,1) infinite}.mm-nucleic__rung--mismatch{stroke:#e5484d!important;stroke-width:4!important}`;
