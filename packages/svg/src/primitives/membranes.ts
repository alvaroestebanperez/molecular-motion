import { round } from './shared';

export interface MembranePoint { x: number; y: number }

/**
 * An arbitrary bilayer centreline. `ellipse` and closed `path`s give the bilayer an inside and an
 * outside; path `points` are joined in order and smoothed (Catmull-Rom) unless `smooth` is false.
 */
export type MembraneShape =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'path'; points: readonly MembranePoint[]; closed?: boolean; smooth?: boolean };

export interface MembraneOptions {
  x?: number; y?: number; length?: number; orientation?: 'horizontal' | 'vertical' | 'curved';
  /** Draws the bilayer along this centreline instead of `x`/`y`/`length`/`orientation`. */
  shape?: MembraneShape;
  /** Distance between neighbouring polar heads along a leaflet. Defaults to 9. */
  spacing?: number;
}

/** One lipid: polar head centre, unit normal pointing away from the hydrophobic core, and its two tails. */
export interface MembraneLipid { head: MembranePoint; normal: MembranePoint; tails: readonly (readonly [MembranePoint, MembranePoint])[] }

/**
 * `outer` faces the outside of a closed shape. On open membranes it is the leaflet on the left of the
 * direction of travel: the top of a horizontal or curved membrane, the right of a vertical one.
 */
export interface MembraneLeaflet { name: 'outer' | 'inner'; lipids: readonly MembraneLipid[] }

export interface MembraneGeometry {
  closed: boolean;
  /** Polyline of the bilayer midplane, the centre of the hydrophobic core. Closed shapes run clockwise. */
  centerline: readonly MembranePoint[];
  leaflets: readonly [MembraneLeaflet, MembraneLeaflet];
  headRadius: number;
  /** Distance from the midplane to each head centre. */
  halfThickness: number;
}

const MEMBRANE_HEAD_RADIUS = 4;

const MEMBRANE_HALF_THICKNESS = 11.5;

/** Gap left between the tails of opposite leaflets at the midplane. */
const MEMBRANE_MIDPLANE_GAP = 1.2;

function membraneCenterline(options: MembraneOptions): { points: MembranePoint[]; closed: boolean } {
  const densify = (points: readonly MembranePoint[], closed: boolean) => {
    const out: MembranePoint[] = [];
    const count = closed ? points.length : points.length - 1;
    for (let i = 0; i < count; i++) {
      const a = points[i]!; const b = points[(i + 1) % points.length]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
      for (let s = 0; s < steps; s++) out.push({ x: a.x + (b.x - a.x) * s / steps, y: a.y + (b.y - a.y) * s / steps });
    }
    if (!closed) out.push(points[points.length - 1]!);
    return out;
  };
  const shape = options.shape;
  if (shape?.kind === 'ellipse') {
    const steps = Math.max(48, Math.ceil(Math.PI * (shape.rx + shape.ry) / 2));
    return { closed: true, points: Array.from({ length: steps }, (_, i) => { const a = i / steps * Math.PI * 2; return { x: shape.cx + shape.rx * Math.cos(a), y: shape.cy + shape.ry * Math.sin(a) }; }) };
  }
  if (shape?.kind === 'path') {
    const closed = shape.closed ?? false; const source = shape.points;
    if (source.length < 2) throw new Error('A membrane path needs at least two points');
    if (shape.smooth === false || source.length < 3) return { closed, points: densify(source, closed) };
    const at = (i: number) => closed ? source[(i + source.length) % source.length]! : source[Math.min(source.length - 1, Math.max(0, i))]!;
    const smooth: MembranePoint[] = [];
    for (let i = 0; i < (closed ? source.length : source.length - 1); i++) {
      const p0 = at(i - 1); const p1 = at(i); const p2 = at(i + 1); const p3 = at(i + 2);
      for (let s = 0; s < 8; s++) {
        const t = s / 8; const t2 = t * t; const t3 = t2 * t;
        const f = (a: number, b: number, c: number, d: number) => .5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
        smooth.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
      }
    }
    if (!closed) smooth.push(source[source.length - 1]!);
    return { closed, points: densify(smooth, closed) };
  }
  const x = options.x ?? 0; const y = options.y ?? 0; const length = options.length ?? 240; const orientation = options.orientation ?? 'horizontal';
  const steps = Math.max(2, Math.ceil(length / 2));
  return {
    closed: false,
    points: Array.from({ length: steps + 1 }, (_, i) => {
      const along = length * i / steps;
      if (orientation === 'vertical') return { x, y: y + along };
      return { x: x + along, y: orientation === 'curved' ? y - Math.sin(along / length * Math.PI) * 18 : y };
    }),
  };
}

/**
 * Deterministic lipid-bilayer geometry: two leaflets whose polar heads face away from a shared
 * hydrophobic core. Each leaflet is spaced along its own offset curve, so the concave side of a curved
 * or closed membrane packs fewer lipids, and a closed shape wraps with uniform spacing (no seam).
 */
export function membraneGeometry(options: MembraneOptions = {}): MembraneGeometry {
  const spacing = Math.max(4, options.spacing ?? 9);
  const centerline = membraneCenterline(options); const closed = centerline.closed; let points = centerline.points;
  if (closed) {
    // Clockwise on screen (positive shoelace with y down) makes the left-hand normal point outwards.
    const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]!; return sum + p.x * q.y - q.x * p.y; }, 0);
    if (area < 0) points = [...points].reverse();
  }
  const n = points.length;
  const normals = points.map((_, i) => {
    const prev = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!; const next = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
    const tx = next.x - prev.x; const ty = next.y - prev.y; const len = Math.hypot(tx, ty) || 1;
    return { x: ty / len, y: -tx / len };
  });
  const h = MEMBRANE_HALF_THICKNESS; const r = MEMBRANE_HEAD_RADIUS;
  const leaflet = (name: 'outer' | 'inner'): MembraneLeaflet => {
    const side = name === 'outer' ? 1 : -1;
    const curve = points.map((p, i) => ({ x: p.x + normals[i]!.x * h * side, y: p.y + normals[i]!.y * h * side }));
    const segments = closed ? n : n - 1;
    const cumulative = [0];
    for (let i = 0; i < segments; i++) { const a = curve[i]!; const b = curve[(i + 1) % n]!; cumulative.push(cumulative[i]! + Math.hypot(b.x - a.x, b.y - a.y)); }
    const length = cumulative[segments]!;
    const count = closed ? Math.max(3, Math.round(length / spacing)) : Math.max(1, Math.floor(length / spacing));
    // Closed: spread evenly over the whole loop. Open: keep the nominal spacing and centre the row.
    const pitch = closed ? length / count : spacing; const start = closed ? pitch / 2 : (length - (count - 1) * spacing) / 2;
    const lipids: MembraneLipid[] = []; let segment = 0;
    for (let k = 0; k < count; k++) {
      const target = start + k * pitch;
      while (segment < segments - 1 && cumulative[segment + 1]! < target) segment++;
      const t = (target - cumulative[segment]!) / ((cumulative[segment + 1]! - cumulative[segment]!) || 1);
      const a = curve[segment]!; const b = curve[(segment + 1) % n]!; const na = normals[segment]!; const nb = normals[(segment + 1) % n]!;
      const nx = na.x + (nb.x - na.x) * t; const ny = na.y + (nb.y - na.y) * t; const nl = Math.hypot(nx, ny) || 1;
      const normal = { x: Math.round(nx / nl * side * 1000) / 1000, y: Math.round(ny / nl * side * 1000) / 1000 };
      const head = { x: round(a.x + (b.x - a.x) * t), y: round(a.y + (b.y - a.y) * t) };
      // Two acyl chains per lipid, from under the head towards (never across) the midplane.
      const tails = [-1.5, 1.5].map(offset => [
        { x: round(head.x - normal.x * (r - .5) - normal.y * offset), y: round(head.y - normal.y * (r - .5) + normal.x * offset) },
        { x: round(head.x - normal.x * (h - MEMBRANE_MIDPLANE_GAP) - normal.y * offset * .7), y: round(head.y - normal.y * (h - MEMBRANE_MIDPLANE_GAP) + normal.x * offset * .7) },
      ] as const);
      lipids.push({ head, normal, tails });
    }
    return { name, lipids };
  };
  return { closed, centerline: points.map(p => ({ x: round(p.x), y: round(p.y) })), leaflets: [leaflet('outer'), leaflet('inner')], headRadius: r, halfThickness: h };
}

/** Shortens an open midplane so the hydrophobic core ends flush with the outermost heads. */
function trimMembraneCore(geometry: MembraneGeometry): MembranePoint[] {
  const ends = geometry.leaflets.flatMap(leaflet => [leaflet.lipids[0], leaflet.lipids[leaflet.lipids.length - 1]]).filter((lipid): lipid is MembraneLipid => !!lipid);
  const line = geometry.centerline; const reach = Math.hypot(geometry.halfThickness, geometry.headRadius) + .5;
  // Keep midplane points that lie within the lipid span: close enough to some head along the line.
  const nearest = (point: MembranePoint) => Math.min(...ends.map(({ head }) => Math.hypot(head.x - point.x, head.y - point.y)));
  const first = line.findIndex(point => nearest(point) <= reach);
  let last = line.length - 1; while (last > first && nearest(line[last]!) > reach) last--;
  return line.slice(Math.max(0, first), last + 1);
}

/**
 * Writer of compact path data for long runs of repetitive geometry. Points are snapped to a grid of
 * 1/`grid` units and every command is relative to the snapped previous point, so rounding never
 * accumulates and a row of evenly spaced lipids repeats the same short deltas. Command letters are
 * omitted when they repeat (a moveto continues as lineto) and separators wherever the grammar allows.
 */
export function compactPath(grid: number) {
  let d = ''; let command = ''; let dotted = false; let x = 0; let y = 0; let startX = 0; let startY = 0;
  const number = (units: number) => {
    const text = String(units / grid).replace(/^(-?)0\./, '$1.');
    if (/[\d.]$/.test(d) && text[0] !== '-' && !(text[0] === '.' && dotted)) d += ' ';
    d += text; dotted = text.includes('.');
  };
  const emit = (letter: string, ...units: number[]) => {
    if (letter !== command) d += letter;
    command = letter === 'm' ? 'l' : letter;
    units.forEach(number);
  };
  const snap = (p: MembranePoint) => [Math.round(p.x * grid), Math.round(p.y * grid)] as const;
  const writer = {
    move(p: MembranePoint) { const [sx, sy] = snap(p); command = ''; emit('m', sx - x, sy - y); x = startX = sx; y = startY = sy; return writer; },
    line(p: MembranePoint) {
      const [sx, sy] = snap(p); const dx = sx - x; const dy = sy - y;
      if (dy === 0 && dx !== 0) emit('h', dx); else if (dx === 0 && dy !== 0) emit('v', dy); else if (dx !== 0) emit('l', dx, dy);
      x = sx; y = sy; return writer;
    },
    /** A zero-length subpath: with round caps it paints a dot whose diameter is the stroke width. */
    dot(p: MembranePoint) { writer.move(p); emit('h', 0); return writer; },
    close() { emit('z'); x = startX; y = startY; return writer; },
    grid,
    toString: () => d,
  };
  return writer;
}

/** Douglas-Peucker: drops midplane samples that lie within `tolerance` of the simplified polyline. */
function simplifyPolyline(points: readonly MembranePoint[], tolerance: number, closed: boolean): MembranePoint[] {
  if (points.length < 3) return [...points];
  const keep = new Uint8Array(points.length);
  const deviation = (p: MembranePoint, a: MembranePoint, b: MembranePoint) => {
    const dx = b.x - a.x; const dy = b.y - a.y; const length = Math.hypot(dx, dy);
    return length ? Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length : Math.hypot(p.x - a.x, p.y - a.y);
  };
  const split = (from: number, to: number) => {
    const stack: [number, number][] = [[from, to]];
    while (stack.length) {
      const [i, j] = stack.pop()!; let worst = -1; let index = -1;
      for (let k = i + 1; k < j; k++) { const e = deviation(points[k]!, points[i]!, points[j % points.length]!); if (e > worst) { worst = e; index = k; } }
      if (worst > tolerance) { keep[index] = 1; stack.push([i, index], [index, j]); }
    }
  };
  keep[0] = 1;
  if (closed) {
    // Anchor the loop at its first sample and the sample farthest from it, then simplify both halves.
    const from = (k: number) => Math.hypot(points[k]!.x - points[0]!.x, points[k]!.y - points[0]!.y);
    let far = 1; for (let k = 2; k < points.length; k++) if (from(k) > from(far)) far = k;
    keep[far] = 1; split(0, far); split(far, points.length);
  } else { keep[points.length - 1] = 1; split(0, points.length - 1); }
  return points.filter((_, k) => keep[k]);
}

/** Membrane path data is written on a 0.1 px grid, the precision the bilayer geometry is computed at. */
export const MEMBRANE_GRID = 10;

/**
 * Lipid bilayer: a hydrophobic core band, the two rows of tails and the two rows of polar heads facing
 * outwards. Each layer is one path for both leaflets (outer subpaths first), written as compact relative
 * path data, so the markup stays small however long the membrane is: the core is the simplified midplane,
 * each lipid's two tails are a single stroke and each head is a zero-length round-capped stroke, painted
 * twice (rim, then fill) to draw the outlined disc. `data-heads` lists the outer and inner head counts.
 */
export function renderMembranePrimitive(options: MembraneOptions = {}): string {
  return membraneMarkup(options, MEMBRANE_GRID);
}

/** Appends a densely sampled polyline to `path`, simplified to well under one grid step. */
export function polylinePath(points: readonly MembranePoint[], closed: boolean, path: ReturnType<typeof compactPath>) {
  const [first, ...rest] = simplifyPolyline(points, .3 / path.grid + .05, closed);
  path.move(first!); rest.forEach(path.line); if (closed) path.close();
  return path;
}

/**
 * `renderMembranePrimitive` on a given grid (coarser for bilayers drawn scaled down, see
 * `compartmentMembranes`), with an optional extra class on its root group.
 */
export function membraneMarkup(options: MembraneOptions, grid: number, className?: string): string {
  const geometry = membraneGeometry(options); const r = geometry.headRadius;
  const variant = options.shape ? (geometry.closed ? 'closed' : 'path') : options.orientation ?? 'horizontal';
  const core = polylinePath(geometry.closed ? geometry.centerline : trimMembraneCore(geometry), geometry.closed, compactPath(grid));
  const tails = compactPath(grid); const heads = compactPath(grid);
  for (const { lipids } of geometry.leaflets) for (const lipid of lipids) {
    // Tail end → under the head → other tail end: the bend runs beneath the polar head, which is painted
    // over it (head discs cover radius r + .45 > |a - head|), so only the two acyl chains show.
    const [a1, b1] = lipid.tails[0]!; const [a2, b2] = lipid.tails[1]!;
    tails.move(b1).line(a1).line(a2).line(b2);
    heads.dot(lipid.head);
  }
  return `<g class="mm-primitive mm-primitive--membrane mm-membrane--${variant}${className ? ` ${className}` : ''}" data-heads="${geometry.leaflets.map(({ lipids }) => lipids.length).join(' ')}">`
    + `<path class="mm-membrane__core" d="${core}" stroke-width="${round((geometry.halfThickness - r) * 2 + 2)}"/><path class="mm-membrane__tails" d="${tails}"/>`
    // Head discs: outer rim = 2r plus the old .9 outline, fill = 2r minus it, both derived from the radius.
    + `<path class="mm-membrane__head-rims" d="${heads}" stroke-width="${round(r * 2 + .9)}"/><path class="mm-membrane__heads" d="${heads}" stroke-width="${round(r * 2 - .9)}"/></g>`;
}

/** Lipid membranes. */
export const membraneCss = `.mm-primitive--membrane{--mm-membrane-head:#e58f78;--mm-membrane-head-edge:#b4614f;--mm-membrane-tail:#c58c63;--mm-membrane-core:#f6d9a8}.mm-primitive--membrane path{stroke-linecap:round;stroke-linejoin:round}.mm-primitive--membrane .mm-membrane__core{fill:none;stroke-linecap:butt;stroke:var(--mm-membrane-core);stroke-opacity:.6}.mm-membrane__tails{fill:none;stroke:var(--mm-membrane-tail);stroke-width:1.2}.mm-membrane__head-rims{fill:none;stroke:var(--mm-membrane-head-edge)}.mm-membrane__heads{fill:none;stroke:var(--mm-membrane-head)}
:root[data-theme=dark] .mm-primitive--membrane,.mm-theme-dark .mm-primitive--membrane{--mm-membrane-head:#e4927c;--mm-membrane-head-edge:#8a4a3d;--mm-membrane-tail:#cfa07a;--mm-membrane-core:#6a5038}@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .mm-primitive--membrane{--mm-membrane-head:#e4927c;--mm-membrane-head-edge:#8a4a3d;--mm-membrane-tail:#cfa07a;--mm-membrane-core:#6a5038}}`;
