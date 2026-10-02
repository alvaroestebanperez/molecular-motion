import {
  type MembraneShape, MEMBRANE_GRID, compactPath, polylinePath, membraneGeometry, membraneMarkup, type MembranePoint,
} from './membranes';
import { round, seededRandom } from './shared';

export type CompartmentVisualKind = 'extracellular' | 'cytoplasm' | 'nucleus' | 'organelle' | 'er' | 'golgi' | 'mitochondrion' | 'lysosome' | 'endosome';

export interface CompartmentOptions {
  /** Box the figure is fitted into (uniformly, centred), measured from `at`. Defaults to 190 × 96. */
  width?: number; height?: number;
}

/** Every compartment is laid out in this design box, then fitted into the requested one. */
const COMPARTMENT_BOX = { width: 260, height: 150 } as const;

interface CompartmentMembrane { shape: MembraneShape; className: string }

/**
 * Closed bilayers drawn by the membrane primitive at a reduced `scale`, so nested membranes stay thin but
 * are the same lipid bilayer as everywhere else. Shapes are given in design units; `lumen` lists the
 * shapes whose interior is tinted (even-odd, so a shape inside another one cuts a hole).
 */
function compartmentMembranes(membranes: readonly CompartmentMembrane[], scale: number, lumen: readonly number[]): string {
  const native = (shape: MembraneShape): MembraneShape => shape.kind === 'ellipse'
    ? { kind: 'ellipse', cx: shape.cx / scale, cy: shape.cy / scale, rx: shape.rx / scale, ry: shape.ry / scale }
    : { ...shape, points: shape.points.map(p => ({ x: p.x / scale, y: p.y / scale })) };
  // Keep the on-screen head pitch close to the native membrane's, without packing small membranes densely.
  const spacing = Math.max(9, round(4.2 / scale));
  const shapes = membranes.map(membrane => native(membrane.shape));
  // Drawn at scale ≤ .5, one native unit is at most half a viewBox unit: whole units are already sub-pixel.
  const grid = scale <= .5 ? 1 : MEMBRANE_GRID;
  const lumenPath = compactPath(grid);
  for (const index of lumen) polylinePath(membraneGeometry({ shape: shapes[index]! }).centerline, true, lumenPath);
  return `<g class="mm-compartment__membranes" transform="scale(${scale})">${lumen.length ? `<path class="mm-compartment__lumen" fill-rule="evenodd" d="${lumenPath}"/>` : ''}${membranes.map((membrane, i) => membraneMarkup({ shape: shapes[i]!, spacing }, grid, membrane.className)).join('')}</g>`;
}

const closedPath = (points: readonly MembranePoint[]): MembraneShape => ({ kind: 'path', closed: true, points: points.map(p => ({ x: round(p.x), y: round(p.y) })) });

const dots = (items: readonly { x: number; y: number; r: number }[]) => items.map(({ x, y, r }) => `M${round(x - r)} ${round(y)}a${round(r)} ${round(r)} 0 1 0 ${round(r * 2)} 0a${round(r)} ${round(r)} 0 1 0 ${round(-r * 2)} 0`).join('');

/** Moves every edge of a polygon `d` towards its interior (negative `d` grows it). */
function insetPolygon(points: readonly MembranePoint[], d: number): MembranePoint[] {
  const n = points.length;
  const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % n]!; return sum + p.x * q.y - q.x * p.y; }, 0);
  const sign = area > 0 ? 1 : -1;
  const lines = points.map((a, i) => {
    const b = points[(i + 1) % n]!; const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    return { p: { x: a.x - t.y * sign * d, y: a.y + t.x * sign * d }, t };
  });
  return lines.map((line, i) => {
    const prev = lines[(i - 1 + n) % n]!; const cross = prev.t.x * line.t.y - prev.t.y * line.t.x;
    if (Math.abs(cross) < 1e-6) return line.p;
    const u = ((line.p.x - prev.p.x) * line.t.y - (line.p.y - prev.p.y) * line.t.x) / cross;
    return { x: prev.p.x + prev.t.x * u, y: prev.p.y + prev.t.y * u };
  });
}

/** Cuts every corner so a smoothed outline rounds it instead of overshooting. */
function chamfer(points: readonly MembranePoint[], cut: number): MembranePoint[] {
  return points.flatMap((v, i) => {
    const p = points[(i - 1 + points.length) % points.length]!; const q = points[(i + 1) % points.length]!;
    const toward = (w: MembranePoint) => { const len = Math.hypot(w.x - v.x, w.y - v.y) || 1; const c = Math.min(cut, len / 3); return { x: v.x + (w.x - v.x) / len * c, y: v.y + (w.y - v.y) / len * c }; };
    return [toward(p), toward(q)];
  });
}

/** Two concentric closed bilayers crossed by pore plugs, with a dense inner body. */
function nucleusArt(): string {
  const cx = 130; const cy = 75; const outer = { rx: 114, ry: 66 }; const gap = 17;
  const membranes = [
    { shape: { kind: 'ellipse', cx, cy, ...outer } as const, className: 'mm-compartment__envelope mm-compartment__envelope--outer' },
    { shape: { kind: 'ellipse', cx, cy, rx: outer.rx - gap, ry: outer.ry - gap } as const, className: 'mm-compartment__envelope mm-compartment__envelope--inner' },
  ];
  const mid = { rx: outer.rx - gap / 2, ry: outer.ry - gap / 2 };
  const pores = [-150, -95, -35, 25, 85, 145].map(degrees => {
    const t = degrees * Math.PI / 180; const x = cx + mid.rx * Math.cos(t); const y = cy + mid.ry * Math.sin(t);
    const angle = Math.atan2(Math.sin(t) / mid.ry, Math.cos(t) / mid.rx) * 180 / Math.PI;
    return `<rect class="mm-compartment__pore" x="-15.5" y="-2.6" width="31" height="5.2" rx="2.6" transform="translate(${round(x)} ${round(y)}) rotate(${round(angle)})"/>`;
  }).join('');
  const nucleolus = `<ellipse class="mm-compartment__nucleolus" cx="148" cy="82" rx="23" ry="17" transform="rotate(-14 148 82)"/>`;
  return `${compartmentMembranes(membranes, .42, [1])}<g class="mm-compartment__pores" data-pores="6">${pores}</g>${nucleolus}`;
}

/** Closed outer bilayer around a closed inner bilayer folded into alternating finger-like invaginations. */
function mitochondrionArt(): string {
  const cx = 130; const cy = 75; const rx = 100; const ry = 43; const width = 17; const reach = 7;
  const folds = [-66, -22, 22, 66].map((x, i) => ({ x, side: i % 2 ? 1 : -1 }));
  const edge = (x: number, side: number) => side * ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
  const points: MembranePoint[] = []; const steps = 96; const inside = new Set<number>();
  for (let s = 0; s < steps; s++) {
    const t = s / steps * Math.PI * 2; const x = rx * Math.cos(t); const side = Math.sin(t) >= 0 ? 1 : -1;
    const fold = folds.findIndex(f => f.side === side && Math.abs(x - f.x) < width / 2 + 9);
    if (fold < 0) { points.push({ x: cx + x, y: cy + ry * Math.sin(t) }); continue; }
    if (inside.has(fold)) continue;
    inside.add(fold);
    // Bottom edge runs right→left, top edge left→right; either way walk in, round the tip, walk out.
    const f = folds[fold]!; const dir = side > 0 ? -1 : 1; const tip = -side * reach;
    for (const offset of [-1, 1]) {
      const fx = f.x + offset * dir * width / 2; const base = edge(fx, side);
      // A flared shoulder rounds the fold's mouth so the leaflets do not crowd into a sharp corner.
      const shoulder = { x: cx + fx + offset * dir * 6, y: cy + edge(fx + offset * dir * 6, side) * .97 };
      const run = [.16, .42, .7, 1].map(k => ({ x: cx + fx, y: cy + base + (tip - base) * k }));
      points.push(...(offset < 0 ? [shoulder, ...run] : [...run.reverse(), shoulder]));
      if (offset < 0) points.push({ x: cx + f.x, y: cy + tip - side * width / 2 });
    }
  }
  const membranes = [
    { shape: { kind: 'ellipse', cx, cy, rx: 120, ry: 63 } as const, className: 'mm-compartment__outer-membrane' },
    { shape: closedPath(points), className: 'mm-compartment__inner-membrane mm-compartment__cristae' },
  ];
  return `<g data-cristae="${folds.length}">${compartmentMembranes(membranes, .4, [1])}</g>`;
}

/** Stacked, curved, closed cisternae with dilated rims; transport vesicles only on the concave face. */
function golgiArt(): string {
  const cx = 130; const cy = 236; const pitch = 28; const half = 6; const count = 4;
  const cisternae = Array.from({ length: count }, (_, i) => {
    const r = 220 - i * pitch; const span = (100 - i * 8) / r; const points: MembranePoint[] = [];
    const at = (a: number, offset: number) => ({ x: cx + (r + offset) * Math.sin(a), y: cy - (r + offset) * Math.cos(a) });
    const thickness = (u: number) => half * (1 + .35 * u ** 8);
    // Rounded rim: half a circle from one face of the cisterna to the other, bulging past its end.
    const cap = (end: 1 | -1) => {
      const a = end * span; const c = at(a, 0); const w = thickness(1);
      const radial = { x: Math.sin(a), y: -Math.cos(a) }; const tangent = { x: Math.cos(a) * end, y: Math.sin(a) * end };
      return Array.from({ length: 5 }, (_, k) => { const phi = (k + 1) * Math.PI / 6; return { x: c.x + w * (end * Math.cos(phi) * radial.x + Math.sin(phi) * tangent.x), y: c.y + w * (end * Math.cos(phi) * radial.y + Math.sin(phi) * tangent.y) }; });
    };
    for (let k = 0; k <= 16; k++) { const u = -1 + k / 8; points.push(at(u * span, thickness(u))); }
    points.push(...cap(1));
    for (let k = 16; k >= 0; k--) { const u = -1 + k / 8; points.push(at(u * span, -thickness(u))); }
    points.push(...cap(-1));
    const face = i === 0 ? ' mm-compartment__cisterna--cis' : i === count - 1 ? ' mm-compartment__cisterna--trans' : '';
    return { shape: closedPath(points), className: `mm-compartment__cisterna${face}` };
  });
  const vesicles = [{ x: 130, y: 127 }, { x: 100, y: 135 }, { x: 160, y: 135 }].map(({ x, y }) => ({ shape: { kind: 'ellipse', cx: x, cy: y, rx: 7.5, ry: 7.5 } as const, className: 'mm-compartment__vesicle' }));
  return `<g class="mm-compartment__stack" data-cisternae="${count}" data-vesicle-face="trans">${compartmentMembranes([...cisternae, ...vesicles], .32, cisternae.map((_, i) => i))}</g>`;
}

/**
 * One continuous lumen: a closed outer bilayer pierced by closed fenestrae, so the membrane between
 * neighbouring holes reads as tubules meeting at three-way junctions.
 */
function erArt(): string {
  const outline = [{ x: 16, y: 46 }, { x: 88, y: 10 }, { x: 178, y: 10 }, { x: 246, y: 46 }, { x: 244, y: 112 }, { x: 172, y: 142 }, { x: 82, y: 142 }, { x: 14, y: 108 }];
  const [A, B, C, D, E, F, G, H] = outline as [MembranePoint, MembranePoint, MembranePoint, MembranePoint, MembranePoint, MembranePoint, MembranePoint, MembranePoint];
  const P = { x: 86, y: 72 }; const Q = { x: 140, y: 50 }; const R = { x: 188, y: 86 }; const S = { x: 132, y: 110 };
  const faces = [[P, Q, R, S], [A, B, Q, P], [B, C, D, R, Q], [D, E, F, S, R], [F, G, H, A, P, S]];
  const half = 12;
  const membranes = [
    { shape: closedPath(chamfer(insetPolygon(outline, -half), 16)), className: 'mm-compartment__er-boundary' },
    ...faces.map(face => ({ shape: closedPath(chamfer(insetPolygon(face, half), 9)), className: 'mm-compartment__fenestra' })),
  ];
  return `<g class="mm-compartment__network" data-fenestrae="${faces.length}" data-junctions="4">${compartmentMembranes(membranes, .36, membranes.map((_, i) => i))}</g>`;
}

/** A single round vesicle whose lumen is packed with dense particles. */
function lysosomeArt(random: () => number): string {
  const cx = 130; const cy = 75; const inner = 43; const granules: { x: number; y: number; r: number }[] = [];
  for (let attempt = 0; attempt < 400 && granules.length < 14; attempt++) {
    const r = 2.6 + random() * 3.6; const a = random() * Math.PI * 2; const d = Math.sqrt(random()) * (inner - r - 3);
    const g = { x: cx + d * Math.cos(a), y: cy + d * Math.sin(a) * .93, r };
    if (granules.every(o => Math.hypot(o.x - g.x, o.y - g.y) > o.r + g.r + 2.4)) granules.push(g);
  }
  return `${compartmentMembranes([{ shape: { kind: 'ellipse', cx, cy, rx: 56, ry: 52 }, className: 'mm-compartment__boundary' }], .45, [0])}<path class="mm-compartment__content" data-particles="${granules.length}" d="${dots(granules)}"/>`;
}

/** A vesicle with a bud pinching off through a narrow neck; membrane-bound cargo is sorted into the bud. */
function endosomeArt(): string {
  const body = { x: 112, y: 88, r: 48 }; const budRadius = 24; const theta = -40 * Math.PI / 180;
  const distance = body.r + budRadius + 2; const fillet = 9;
  const budCentre = { x: body.x + distance * Math.cos(theta), y: body.y + distance * Math.sin(theta), r: budRadius };
  // Work along the body→bud axis; a fillet circle tangent to both spheres rounds each side of the neck.
  const along = ((body.r + fillet) ** 2 - (budRadius + fillet) ** 2 + distance ** 2) / (2 * distance);
  const across = Math.sqrt((body.r + fillet) ** 2 - along ** 2);
  const toCard = (u: number, v: number) => ({ x: body.x + u * Math.cos(theta) - v * Math.sin(theta), y: body.y + u * Math.sin(theta) + v * Math.cos(theta) });
  const arc = (cu: number, cv: number, r: number, from: number, to: number, steps: number) => Array.from({ length: steps + 1 }, (_, k) => { const a = from + (to - from) * k / steps; return toCard(cu + r * Math.cos(a), cv + r * Math.sin(a)); });
  const bodyTangent = Math.atan2(across, along); const budTangent = Math.atan2(across, along - distance);
  const filletArc = (side: 1 | -1, fromBody: boolean) => {
    const toBody = Math.atan2(-side * across, -along); const toBud = Math.atan2(-side * across, distance - along);
    let delta = toBud - toBody; if (delta > Math.PI) delta -= Math.PI * 2; if (delta < -Math.PI) delta += Math.PI * 2;
    const points = arc(along, side * across, fillet, toBody, toBody + delta, 4).slice(1, -1);
    return fromBody ? points : points.reverse();
  };
  const points: MembranePoint[] = [
    ...arc(0, 0, body.r, bodyTangent, Math.PI * 2 - bodyTangent, 40), ...filletArc(-1, true),
    ...arc(distance, 0, budRadius, -budTangent, budTangent, 16), ...filletArc(1, false),
  ];
  const cargo = [[200, body], [245, body], [150, body], [-5, budCentre], [-75, budCentre]] as const;
  const marks = cargo.map(([degrees, centre]) => {
    const a = degrees * Math.PI / 180; const d = centre.r - 11;
    return `<rect class="mm-compartment__cargo" x="-3.2" y="-3.2" width="6.4" height="6.4" rx="1.4" transform="translate(${round(centre.x + d * Math.cos(a))} ${round(centre.y + d * Math.sin(a))}) rotate(${round(degrees + 45)})"/>`;
  }).join('');
  return `${compartmentMembranes([{ shape: closedPath(points), className: 'mm-compartment__boundary mm-compartment__bud' }], .45, [0])}<g class="mm-compartment__cargo-set" data-cargo="${cargo.length}" data-bud="1">${marks}</g>`;
}

/** Unbounded surroundings: banded matrix fibres crossing the field and a few scattered particles. */
function extracellularArt(random: () => number): string {
  const fibres = ['M-6 34C60 18 130 56 266 36', 'M-6 108C80 128 170 80 266 100', 'M18 156C64 104 118 46 168 -6', 'M126 156C160 116 214 84 266 64', 'M-6 72C70 76 150 132 214 156'];
  const particles = Array.from({ length: 10 }, (_, i) => ({ x: 12 + (i % 5) * 52 + random() * 30, y: 14 + Math.floor(i / 5) * 72 + random() * 50, r: 1.8 + random() * 1.8 }));
  return `<path class="mm-compartment__fibres" data-fibres="${fibres.length}" d="${fibres.join('')}"/><path class="mm-compartment__particles" data-particles="${particles.length}" d="${dots(particles)}"/>`;
}

/** Unbounded crowded solution: an even stipple of small solutes and at most two faint filaments. */
function cytoplasmArt(random: () => number): string {
  const columns = 14; const rows = 8;
  const solutes = Array.from({ length: columns * rows }, (_, i) => ({ x: 6 + (i % columns + random() * .8) * 18.4, y: 6 + (Math.floor(i / columns) + random() * .8) * 18, r: .8 + random() * 1 }));
  const filaments = ['M8 44C80 30 150 62 252 40', 'M24 128C100 110 176 130 250 112'];
  return `<path class="mm-compartment__solutes" data-solutes="${solutes.length}" d="${dots(solutes)}"/><path class="mm-compartment__filaments" data-filaments="${filaments.length}" d="${filaments.join('')}"/>`;
}

/**
 * Compartments are identified by geometry, not colour: envelope count, inner folds, stacking, tubular
 * networks, lumen content, budding and environmental texture all survive greyscale. Membrane-bounded
 * compartments reuse the closed lipid bilayer of `renderMembranePrimitive`; the output is deterministic.
 */
export function renderCompartmentPrimitive(kind: CompartmentVisualKind, at = { x: 0, y: 0 }, options: CompartmentOptions = {}): string {
  const width = options.width ?? 190; const height = options.height ?? 96;
  const k = Math.min(width / COMPARTMENT_BOX.width, height / COMPARTMENT_BOX.height);
  const x = round(at.x + (width - COMPARTMENT_BOX.width * k) / 2); const y = round(at.y + (height - COMPARTMENT_BOX.height * k) / 2);
  const random = seededRandom(`compartment-${kind}`);
  const art = kind === 'extracellular' ? extracellularArt(random)
    : kind === 'cytoplasm' ? cytoplasmArt(random)
      : kind === 'nucleus' ? nucleusArt()
        : kind === 'er' ? erArt()
          : kind === 'golgi' ? golgiArt()
            : kind === 'mitochondrion' ? mitochondrionArt()
              : kind === 'lysosome' ? lysosomeArt(random)
                : kind === 'endosome' ? endosomeArt()
                  : compartmentMembranes([{ shape: { kind: 'ellipse', cx: 130, cy: 75, rx: 96, ry: 54 }, className: 'mm-compartment__boundary' }], .5, [0]);
  return `<g class="mm-primitive mm-compartment mm-compartment--${kind}"><g transform="translate(${x} ${y}) scale(${Math.round(k * 1000) / 1000})">${art}</g></g>`;
}

/** Compartments and organelles. */
export const compartmentCss = `.mm-compartment{--mm-compartment-lumen:#8fa9de}.mm-compartment--organelle{--mm-compartment-lumen:#a3afc4}.mm-compartment--er{--mm-compartment-lumen:#86b0e2}.mm-compartment--golgi{--mm-compartment-lumen:#b29ad8}.mm-compartment--mitochondrion{--mm-compartment-lumen:#ec9a72}.mm-compartment--lysosome{--mm-compartment-lumen:#8a72c4}.mm-compartment--endosome{--mm-compartment-lumen:#79a4dc}.mm-compartment__lumen{fill:var(--mm-compartment-lumen);fill-opacity:.3}.mm-compartment--lysosome .mm-compartment__lumen{fill-opacity:.5}.mm-compartment__nucleolus{fill:currentColor;fill-opacity:.36}.mm-compartment__pore{fill:currentColor;fill-opacity:.55}.mm-compartment__content{fill:currentColor;fill-opacity:.45}.mm-compartment__cargo{fill:currentColor;fill-opacity:.62}.mm-compartment__fibres{fill:none;stroke:currentColor;stroke-opacity:.3;stroke-width:3.2;stroke-dasharray:9 1.8}.mm-compartment__particles{fill:currentColor;fill-opacity:.32}.mm-compartment__solutes{fill:currentColor;fill-opacity:.26}.mm-compartment__filaments{fill:none;stroke:currentColor;stroke-opacity:.16;stroke-width:.9}`;
