import {
  type ProteinSphere, type ProteinMorphology, type ProteinAnchors, proteinGeometry, proteinAnchors, type ProteinPoint, renderProteinSurface,
} from './protein-geometry';
import { type MembraneOptions, type MembranePoint, membraneGeometry } from './membranes';
import { type ProteinVisualState } from './proteins';
import { type ModificationVisualKind, renderModificationPrimitive } from './modifications';
import { round, esc, clamp, hashString } from './shared';

/** A globular domain carried at one end of a membrane-spanning chain. */
export interface TransmembraneDomain { radius: number }

export interface TransmembraneOptions {
  visualSeed: string;
  /** The membrane the chain crosses; only its geometry is read, the bilayer itself is not drawn. */
  membrane: MembraneOptions;
  /** Arc-length position along the membrane midplane, in px from its start. Defaults to the middle. */
  along?: number;
  /** Number of times the chain crosses the bilayer. Defaults to 1. */
  passes?: number;
  /** Splits the passes into two walls around an open, aqueous pore that spans the bilayer. */
  pore?: boolean;
  /** Centre-to-centre distance between neighbouring passes. Defaults to 16. */
  spacing?: number;
  /** Clear width of the pore. Defaults to 14. */
  poreWidth?: number;
  fill?: string;
  /** Presentation state, applied as the shared `mm-primitive--<state>` class (no halo). */
  state?: ProteinVisualState;
  /** Mirrors the unit along the membrane (same silhouette, facing the other way), e.g. for symmetric pairs. */
  mirror?: boolean;
  /** Globular domain on the outer side, joined to the outer end of the first pass. Ignored with `pore`. */
  outside?: TransmembraneDomain;
  /** Globular domain on the inner side, joined to the inner end of the last pass. Ignored with `pore`. */
  inside?: TransmembraneDomain;
  /**
   * Markers attached to the domain (or the chain end) on one side of the membrane. `angle` (radians in the
   * membrane frame: 0 along the membrane, π/2 inwards) overrides the default fan facing away from it.
   */
  modifications?: readonly { kind: ModificationVisualKind; side: 'outside' | 'inside'; angle?: number; length?: number; branched?: boolean }[];
}

/** A segment crossing the bilayer, from its outer end to its inner end (screen coordinates). */
export interface TransmembraneSpan { outside: MembranePoint; inside: MembranePoint }

export interface TransmembraneGeometry {
  /** Point on the midplane where the unit sits, the tangent along the membrane and the normal pointing inwards. */
  origin: MembranePoint; tangent: MembranePoint; normal: MembranePoint;
  /** Distance from the midplane to each end of a span; always beyond the polar heads of both leaflets. */
  reach: number;
  spans: readonly TransmembraneSpan[];
  /** Axis of the pore, outer mouth to inner mouth, and its clear width (screen coordinates). */
  pore?: { outside: MembranePoint; inside: MembranePoint; width: number };
  /**
   * Contact anchors of the domains in screen coordinates. Sides follow the membrane frame: `top` faces
   * outwards and `bottom` inwards, so a partner on the outer side binds `outsideAnchors.top`.
   */
  outsideAnchors?: ProteinAnchors; insideAnchors?: ProteinAnchors;
  /** Surface particles in the local frame (x along the membrane, y inwards). */
  particles: readonly ProteinSphere[];
  /** Local attachment centre and radius for markers on each side. */
  attach: Record<'outside' | 'inside', { point: MembranePoint; radius: number }>;
}

const TM_SPAN_RADIUS = 5;

const TM_LOOP_RADIUS = 2.6;

const TM_LOOP_DEPTH = 9;

/** A domain hanging off a chain end is a globule: its seed picks among the globular families only. */
const TM_DOMAIN_MORPHOLOGIES: readonly ProteinMorphology[] = ['compact', 'bilobed', 'multidomain'];

/**
 * Geometry of a chain that crosses a membrane `passes` times: straight spans through the bilayer,
 * thin loops alternating on both sides, optional globular domains (shaped by `visualSeed`) at its
 * ends and an optional pore. Built in the membrane's local frame from `membraneGeometry`, so spans
 * always reach past both leaflets. Pure function of the options, with no biological meaning.
 */
export function transmembraneGeometry(options: TransmembraneOptions): TransmembraneGeometry {
  const membrane = membraneGeometry(options.membrane); const line = membrane.centerline;
  const passes = Math.max(1, Math.round(options.passes ?? 1)); const spacing = options.spacing ?? 16;
  const pore = !!options.pore && passes >= 2; const poreWidth = options.poreWidth ?? 14;
  // Locate the unit on the midplane by arc length.
  const lengths = [0];
  for (let i = 1; i < line.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y));
  const total = lengths[lengths.length - 1]!; const along = clamp(options.along ?? total / 2, 0, total);
  let index = 1; while (index < line.length - 1 && lengths[index]! < along) index++;
  const a = line[index - 1]!; const b = line[index]!; const t = (along - lengths[index - 1]!) / ((lengths[index]! - lengths[index - 1]!) || 1);
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const tangent = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  // The outer leaflet lies on the left of travel (see membraneGeometry), so inwards is the right-hand normal.
  const normal = { x: -tangent.y, y: tangent.x };
  const origin = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  // A mirrored unit is built as usual and flipped along the membrane: same silhouette, facing the other way.
  const flip = options.mirror ? -1 : 1;
  const screen = (p: MembranePoint) => ({ x: round(origin.x + tangent.x * p.x * flip + normal.x * p.y), y: round(origin.y + tangent.y * p.x * flip + normal.y * p.y) });
  const reach = membrane.halfThickness + membrane.headRadius + 4;

  const particles: ProteinSphere[] = []; let lobe = 0;
  const tube = (points: readonly MembranePoint[], r: number) => {
    const domain = lobe++;
    for (const p of points) particles.push({ x: round(p.x), y: round(p.y), rx: r, ry: r, r, rotation: 0, depth: .5, domain });
  };
  const bezier = (p0: MembranePoint, p1: MembranePoint, p2: MembranePoint, p3: MembranePoint, steps: number) => Array.from({ length: steps + 1 }, (_, i) => {
    const s = i / steps; const u = 1 - s;
    return { x: u * u * u * p0.x + 3 * u * u * s * p1.x + 3 * u * s * s * p2.x + s * s * s * p3.x, y: u * u * u * p0.y + 3 * u * u * s * p1.y + 3 * u * s * s * p2.y + s * s * s * p3.y };
  });
  /** A short free terminus leaving a span end and curling towards `direction` along the membrane. */
  const tail = (x: number, y: number, direction: number) => {
    const sign = Math.sign(y);
    tube(bezier({ x, y }, { x, y: y + sign * 8 }, { x: x + direction * 6, y: y + sign * 10 }, { x: x + direction * 12, y: y + sign * 14 }, 8), TM_LOOP_RADIUS);
  };
  const spans: number[] = [];
  /** One chain entering from the outer side at xs[0] and crossing at each x in turn; returns its two ends. */
  const chain = (xs: readonly number[], firstTail?: number, lastTail?: number) => {
    xs.forEach((x, i) => {
      const from = i % 2 === 0 ? -reach : reach;
      if (i > 0) {
        const previous = xs[i - 1]!; const bulge = Math.sign(from) * TM_LOOP_DEPTH * 1.33;
        tube(bezier({ x: previous, y: from }, { x: previous, y: from + bulge }, { x, y: from + bulge }, { x, y: from }, 14), TM_LOOP_RADIUS);
      }
      const steps = Math.ceil(2 * (reach - TM_SPAN_RADIUS) / 3);
      tube(Array.from({ length: steps + 1 }, (_, k) => ({ x, y: -Math.sign(from) * (k * 2 * (reach - TM_SPAN_RADIUS) / steps - (reach - TM_SPAN_RADIUS)) })), TM_SPAN_RADIUS);
      spans.push(x);
    });
    const end = { x: xs[xs.length - 1]!, y: xs.length % 2 === 1 ? reach : -reach };
    if (firstTail !== undefined) tail(xs[0]!, -reach, firstTail);
    if (lastTail !== undefined) tail(end.x, end.y, lastTail);
    return { first: { x: xs[0]!, y: -reach }, last: end };
  };

  let outsideAnchors: ProteinAnchors | undefined; let insideAnchors: ProteinAnchors | undefined;
  const attach: TransmembraneGeometry['attach'] = { outside: { point: { x: 0, y: -reach }, radius: 6 }, inside: { point: { x: 0, y: reach }, radius: 6 } };
  if (pore) {
    // Two walls flank the pore; each is its own chain entering at the wall's far side, with free ends
    // curling away from the pore so its mouths stay clear.
    const left = Math.ceil(passes / 2); const right = passes - left; const inner = poreWidth / 2 + TM_SPAN_RADIUS;
    chain(Array.from({ length: left }, (_, i) => -(inner + (left - 1 - i) * spacing)), -1, -1);
    chain(Array.from({ length: right }, (_, i) => inner + (right - 1 - i) * spacing), 1, 1);
  } else {
    const xs = Array.from({ length: passes }, (_, i) => (i - (passes - 1) / 2) * spacing);
    const endsInside = passes % 2 === 1;
    const { first, last } = chain(xs, options.outside ? undefined : -1, options.inside && endsInside ? undefined : 1);
    // Domains join the chain ends anchor-to-anchor, pressed in slightly so the outlines merge.
    const domain = (side: 'outside' | 'inside', spec: TransmembraneDomain, end: MembranePoint): ProteinAnchors => {
      const seed = `${options.visualSeed}::${side}`;
      const shape = proteinGeometry(seed, spec.radius, 28, TM_DOMAIN_MORPHOLOGIES[hashString(`${seed}::morphology`) % TM_DOMAIN_MORPHOLOGIES.length]);
      const local = proteinAnchors(shape, spec.radius);
      const joint = side === 'outside' ? local.bottom : local.top;
      const dx = end.x - joint.x; const dy = end.y - joint.y + (side === 'outside' ? 3 : -3);
      const base = lobe;
      for (const p of shape) particles.push({ ...p, x: p.x + dx, y: p.y + dy, domain: base + (p.domain ?? 0) });
      lobe = base + Math.max(...shape.map(p => p.domain ?? 0)) + 1;
      attach[side] = { point: { x: local.center.x + dx, y: local.center.y + dy }, radius: spec.radius };
      const move = (p: ProteinPoint) => screen({ x: p.x + dx, y: p.y + dy });
      const c0 = move({ x: local.bounds.x, y: local.bounds.y }); const c1 = move({ x: local.bounds.x + local.bounds.width, y: local.bounds.y + local.bounds.height });
      return {
        center: move(local.center), left: move(flip === 1 ? local.left : local.right), right: move(flip === 1 ? local.right : local.left), top: move(local.top), bottom: move(local.bottom),
        bounds: { x: Math.min(c0.x, c1.x), y: Math.min(c0.y, c1.y), width: round(Math.abs(c1.x - c0.x)), height: round(Math.abs(c1.y - c0.y)) },
      };
    };
    if (options.outside) outsideAnchors = domain('outside', options.outside, first);
    else attach.outside.point = first;
    const innerEnd = { x: endsInside ? last.x : xs[xs.length - 1]!, y: reach };
    if (options.inside) insideAnchors = domain('inside', options.inside, innerEnd);
    else attach.inside.point = innerEnd;
  }
  return {
    origin: { x: round(origin.x), y: round(origin.y) }, tangent, normal, reach,
    spans: spans.map(x => ({ outside: screen({ x, y: -reach }), inside: screen({ x, y: reach }) })),
    pore: pore ? { outside: screen({ x: 0, y: -reach }), inside: screen({ x: 0, y: reach }), width: poreWidth } : undefined,
    outsideAnchors, insideAnchors,
    particles: flip === 1 ? particles : particles.map(p => ({ ...p, x: -p.x, rotation: -p.rotation })),
    attach: flip === 1 ? attach : {
      outside: { ...attach.outside, point: { x: -attach.outside.point.x, y: attach.outside.point.y } },
      inside: { ...attach.inside, point: { x: -attach.inside.point.x, y: attach.inside.point.y } },
    },
  };
}

/**
 * A protein chain spanning a membrane (see `transmembraneGeometry`), drawn with the shared protein
 * surface so spans, loops and domains read as one continuous volume. Compose it over
 * `renderMembranePrimitive` with the same membrane options. `data-spans` and `data-pore` expose the
 * crossing geometry in screen coordinates; `data-outside`/`data-inside` the domain anchors
 * (left, right, top, bottom).
 */
export function renderTransmembranePrimitive(options: TransmembraneOptions): string {
  const geometry = transmembraneGeometry(options);
  const fill = options.fill ?? 'var(--mm-protein,#7d78d8)'; const state = options.state ?? 'normal';
  const { origin, tangent, normal, reach } = geometry;
  const unit = (value: number) => Math.round(value * 1000) / 1000;
  const transform = tangent.x === 1 && tangent.y === 0 ? `translate(${origin.x} ${origin.y})` : `matrix(${unit(tangent.x)} ${unit(tangent.y)} ${unit(normal.x)} ${unit(normal.y)} ${origin.x} ${origin.y})`;
  const pore = geometry.pore ? `<rect class="mm-transmembrane__pore" x="${round(-geometry.pore.width / 2 - 1)}" y="${round(-reach)}" width="${round(geometry.pore.width + 2)}" height="${round(reach * 2)}"/>` : '';
  const counts = { outside: 0, inside: 0 };
  const slots = (options.modifications ?? []).map(modification => ({ modification, slot: counts[modification.side]++ }));
  const markers = slots.map(({ modification, slot }) => {
    const { point, radius } = geometry.attach[modification.side]; const count = counts[modification.side];
    const fan = modification.angle ?? ((modification.side === 'inside' ? Math.PI / 2 : -Math.PI / 2) + (slot - (count - 1) / 2) * 1.5);
    const angle = options.mirror ? Math.PI - fan : fan;
    return renderModificationPrimitive(modification, { x: point.x + Math.cos(angle) * radius * .92, y: point.y + Math.sin(angle) * radius * .92 });
  }).join('');
  const pair = (p: MembranePoint) => `${p.x} ${p.y}`;
  const anchors = (name: string, a?: ProteinAnchors) => a ? ` data-${name}="${[a.left, a.right, a.top, a.bottom].map(pair).join(' ')}"` : '';
  return `<g class="mm-primitive mm-primitive--transmembrane mm-primitive--${state}" data-visual-seed="${esc(options.visualSeed)}" data-passes="${geometry.spans.length}"`
    + ` data-spans="${geometry.spans.map(span => `${pair(span.outside)} ${pair(span.inside)}`).join(';')}"`
    + (geometry.pore ? ` data-pore="${pair(geometry.pore.outside)} ${pair(geometry.pore.inside)} ${geometry.pore.width}"` : '')
    + `${anchors('outside', geometry.outsideAnchors)}${anchors('inside', geometry.insideAnchors)} style="--mm-protein:${esc(fill)}">`
    + `<g transform="${transform}">${pore}${renderProteinSurface(geometry.particles, fill, Math.max(options.outside?.radius ?? 0, options.inside?.radius ?? 0, 20))}${markers}</g></g>`;
}

/** Membrane-spanning chains: the aqueous lumen of a pore masks the lipids behind it. */
export const transmembraneCss = `.mm-transmembrane__pore{fill:var(--mm-transmembrane-pore,#d2e5f6);stroke:none}:root[data-theme=dark] .mm-transmembrane__pore,.mm-theme-dark .mm-transmembrane__pore{--mm-transmembrane-pore:#24425f}@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .mm-transmembrane__pore{--mm-transmembrane-pore:#24425f}}`;
