import { round, esc, hashString } from './shared';

/** Element of a ball-and-stick atom. `h` is only used for small marks. */
export type MoleculeElement = 'c' | 'n' | 'o' | 'p' | 'h';

/** An exocyclic group on a ring atom; `branches` continue from the substituent atom (e.g. a carboxamide). */
export interface MoleculeSubstituent { at: number; atom: 'c' | 'n' | 'o'; bond?: 'single' | 'double'; branches?: readonly Omit<MoleculeSubstituent, 'at'>[] }

/** A small cue on a ring atom: a positive charge or one extra hydrogen. */
export interface MoleculeMark { at: number; kind: 'positive' | 'hydrogen' }

/**
 * One ring, or a 6-ring with a second ring fused on its right edge. Atoms are indexed clockwise from the top
 * of the first ring (0–5), then the new atoms of the fused ring. Purely topological: no chemistry is inferred.
 */
export interface MoleculeRingSystem {
  rings: readonly [5 | 6] | readonly [6, 5 | 6];
  hetero?: readonly { at: number; atom: 'n' | 'o' }[];
  substituents?: readonly MoleculeSubstituent[];
  marks?: readonly MoleculeMark[];
  /** Ring atom bonded to the sugar when the system is the base of a unit. Defaults to the last atom. */
  attach?: number;
}

/** A base ring system on a five-membered sugar carrying a chain of `phosphates` (0–6). */
export interface MoleculeUnit { base: MoleculeRingSystem; phosphates?: number }

/**
 * Generic, conceptual topology of a small molecule. Units are joined through their phosphates: `linear` joins two
 * units head to head (one or two units), `cyclic` closes two or more units into a ring.
 */
export type SmallMoleculeTopology =
  | { kind: 'units'; units: readonly MoleculeUnit[]; closure?: 'linear' | 'cyclic' }
  | { kind: 'ring'; ring: MoleculeRingSystem }
  /** A single charged sphere; `size` is relative (1 ≈ the default radius) and the symbol is drawn inside. */
  | { kind: 'ion'; symbol: string; charge?: number; size?: number };

export interface SmallMoleculeOptions {
  visualSeed: string; label?: string; x?: number; y?: number; scale?: number; ion?: boolean;
  /** Draws this topology instead of the seed-derived chain. Without it the legacy glyph is unchanged. */
  topology?: SmallMoleculeTopology;
  /** Ion fill; colour identifies the entity, identity in grayscale comes from symbol and size. */
  fill?: string;
}

interface MPoint { x: number; y: number }

interface MoleculeDrawing { atoms: { p: MPoint; r: number; el: MoleculeElement }[]; bonds: [MPoint, MPoint][]; doubles: [MPoint, MPoint][]; rings: MPoint[][]; charges: MPoint[]; cycle?: MPoint[]; phosphates: number }

const BOND = 10;

const ATOM_R: Record<MoleculeElement, number> = { c: 2.6, n: 3.1, o: 3.1, p: 5.6, h: 2.6 };

const polar = (center: MPoint, radius: number, degrees: number): MPoint => ({ x: center.x + radius * Math.cos(degrees * Math.PI / 180), y: center.y + radius * Math.sin(degrees * Math.PI / 180) });

const along = (from: MPoint, to: MPoint, distance: number): MPoint => { const d = Math.hypot(to.x - from.x, to.y - from.y) || 1; return { x: from.x + (to.x - from.x) / d * distance, y: from.y + (to.y - from.y) / d * distance }; };

const rotateDir = (dir: MPoint, degrees: number): MPoint => { const a = degrees * Math.PI / 180; return { x: dir.x * Math.cos(a) - dir.y * Math.sin(a), y: dir.x * Math.sin(a) + dir.y * Math.cos(a) }; };

const centroid = (points: readonly MPoint[]): MPoint => ({ x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length });

/** Ring-system atoms in local space: rings as index lists, so atoms shared by fused rings are drawn once. */
function ringSystemLayout(system: MoleculeRingSystem) {
  const [first, second] = system.rings;
  const r1 = BOND / (2 * Math.sin(Math.PI / first));
  const points = Array.from({ length: first }, (_, i) => polar({ x: 0, y: 0 }, r1, -90 + i * 360 / first));
  const rings = [Array.from({ length: first }, (_, i) => i)];
  if (second) {
    // Fuse on the right edge (atoms 1 and 2): the new ring continues outward from that edge.
    const a = points[1]!; const b = points[2]!; const mid = centroid([a, b]);
    const apothem = BOND / (2 * Math.tan(Math.PI / second)); const r2 = BOND / (2 * Math.sin(Math.PI / second));
    const center = { x: mid.x + apothem, y: mid.y };
    const start = Math.atan2(a.y - center.y, a.x - center.x) * 180 / Math.PI;
    const ring = [1];
    for (let i = 1; i < second - 1; i++) { ring.push(points.length); points.push(polar(center, r2, start + i * 360 / second)); }
    ring.push(2); rings.push(ring);
  }
  return { points, rings };
}

/** Draws a ring system; with `bond`, it hangs from `bond.from` along `bond.dir` (its attach atom first). */
function drawRingSystem(drawing: MoleculeDrawing, system: MoleculeRingSystem, bond?: { from: MPoint; dir: MPoint }) {
  const layout = ringSystemLayout(system);
  const attach = system.attach ?? layout.points.length - 1;
  let place = (p: MPoint) => p;
  if (bond) {
    const anchor = layout.points[attach]!; const c = centroid(layout.points);
    const angle = Math.atan2(bond.dir.y, bond.dir.x) - Math.atan2(c.y - anchor.y, c.x - anchor.x);
    const target = { x: bond.from.x + bond.dir.x * BOND * 1.2, y: bond.from.y + bond.dir.y * BOND * 1.2 };
    place = p => { const v = rotateDir({ x: p.x - anchor.x, y: p.y - anchor.y }, angle * 180 / Math.PI); return { x: target.x + v.x, y: target.y + v.y }; };
    drawing.bonds.push([bond.from, target]);
  }
  const points = layout.points.map(place);
  const ringOf = (index: number) => layout.rings.find(ring => ring.includes(index) && !(layout.rings.length > 1 && (index === 1 || index === 2) && ring === layout.rings[1])) ?? layout.rings[0]!;
  const outward = (index: number) => { const p = points[index]!; const c = centroid(ringOf(index).map(i => points[i]!)); return along({ x: 0, y: 0 }, { x: p.x - c.x, y: p.y - c.y }, 1); };
  layout.rings.forEach(ring => drawing.rings.push(ring.map(i => points[i]!)));
  points.forEach((p, i) => { const el = system.hetero?.find(h => h.at === i)?.atom ?? 'c'; drawing.atoms.push({ p, r: ATOM_R[el], el }); });
  const grow = (from: MPoint, dir: MPoint, group: Omit<MoleculeSubstituent, 'at'>) => {
    const p = { x: from.x + dir.x * BOND, y: from.y + dir.y * BOND };
    (group.bond === 'double' ? drawing.doubles : drawing.bonds).push([from, p]);
    drawing.atoms.push({ p, r: ATOM_R[group.atom], el: group.atom });
    const branches = group.branches ?? [];
    branches.forEach((branch, i) => grow(p, rotateDir(dir, branches.length === 1 ? 55 : i === 0 ? 60 : -60), branch));
  };
  for (const substituent of system.substituents ?? []) grow(points[substituent.at]!, outward(substituent.at), substituent);
  for (const mark of system.marks ?? []) {
    const p = points[mark.at]!; const dir = outward(mark.at);
    if (mark.kind === 'hydrogen') { const h = { x: p.x + dir.x * BOND * .8, y: p.y + dir.y * BOND * .8 }; drawing.bonds.push([p, h]); drawing.atoms.push({ p: h, r: ATOM_R.h, el: 'h' }); }
    else drawing.charges.push(polar(p, 7.5, Math.atan2(dir.y, dir.x) * 180 / Math.PI + 75));
  }
}

/** Five-membered sugar (ring O at frame angle −90°), rotated by `rotation` and optionally mirrored; returns its ports. */
function drawSugar(drawing: MoleculeDrawing, center: MPoint, rotation: number, mirror = false, hydroxyls: readonly number[] = [2, 3]) {
  const r = BOND / (2 * Math.sin(Math.PI / 5));
  const angle = (frame: number) => (mirror ? 180 - frame : frame) + rotation;
  const points = Array.from({ length: 5 }, (_, i) => polar(center, r, angle(-90 + i * 72)));
  drawing.rings.push(points);
  points.forEach((p, i) => drawing.atoms.push({ p, r: i === 0 ? ATOM_R.o : 2.4, el: i === 0 ? 'o' : 'c' }));
  for (const i of hydroxyls) { const p = polar(points[i]!, BOND * .85, angle(-90 + i * 72)); drawing.bonds.push([points[i]!, p]); drawing.atoms.push({ p, r: 2.6, el: 'o' }); }
  const outward = (i: number) => polar({ x: 0, y: 0 }, 1, angle(-90 + i * 72));
  return { c1: points[1]!, c3: points[3]!, c4: points[4]!, out1: outward(1), out4: outward(4) };
}

/** One phosphorus with two oxygens: perpendicular to the backbone, or splayed around `outward` (outside a cycle). */
function drawPhosphate(drawing: MoleculeDrawing, p: MPoint, backbone: MPoint, outward?: MPoint) {
  drawing.atoms.push({ p, r: ATOM_R.p, el: 'p' }); drawing.phosphates++;
  const dirs = outward ? [rotateDir(outward, 40), rotateDir(outward, -40)] : [rotateDir(backbone, 90), rotateDir(backbone, -90)];
  for (const dir of dirs) { const o = { x: p.x + dir.x * 11, y: p.y + dir.y * 11 }; drawing.bonds.push([p, o]); drawing.atoms.push({ p: o, r: 2.6, el: 'o' }); }
}

/** A base + sugar + phosphate chain in the unit frame (base to the upper right, chain to the left; mirrored flips x). */
function drawUnit(drawing: MoleculeDrawing, unit: MoleculeUnit, offset: MPoint, mirror: boolean) {
  const sugar = drawSugar(drawing, offset, 0, mirror);
  drawRingSystem(drawing, unit.base, { from: sugar.c1, dir: sugar.out1 });
  const count = Math.max(0, Math.min(unit.phosphates ?? 0, 6));
  if (!count) return undefined;
  const c5 = { x: sugar.c4.x + sugar.out4.x * BOND, y: sugar.c4.y + sugar.out4.y * BOND };
  drawing.bonds.push([sugar.c4, c5]); drawing.atoms.push({ p: c5, r: 2.4, el: 'c' });
  const step = { x: mirror ? 1 : -1, y: 0 };
  let previous = c5; let last = c5;
  for (let i = 0; i < count; i++) {
    const p = { x: c5.x + step.x * (12 + i * 16), y: c5.y };
    drawing.bonds.push([previous, p]); drawPhosphate(drawing, p, step); previous = last = p;
  }
  return last;
}

/** Two or more units closed into a ring: each sugar's C4′ reaches, through a phosphate, the next sugar's C3′. */
function drawCycle(drawing: MoleculeDrawing, units: readonly MoleculeUnit[]) {
  const n = units.length; const sugarRadius = 26 / Math.sin(Math.PI / n); const center = { x: 0, y: 0 };
  // The sugar's inner edge (C3′–C4′, frame angle 162°) faces the centre; C1′ and the base point outward.
  const sugars = units.map((unit, k) => {
    const a = 180 + k * 360 / n; const sugar = drawSugar(drawing, polar(center, sugarRadius, a), a + 180 - 162, false, [2]);
    drawRingSystem(drawing, unit.base, { from: sugar.c1, dir: sugar.out1 });
    return sugar;
  });
  const loop: MPoint[] = [];
  sugars.forEach((sugar, k) => {
    const next = sugars[(k + 1) % n]!;
    const mid = centroid([sugar.c4, next.c3]); const dir = along(center, mid, 1);
    const pRadius = Math.hypot(mid.x, mid.y) + 16;
    const p = { x: dir.x * pRadius, y: dir.y * pRadius };
    // Bridge atoms sit between their neighbours, nudged outward so the loop stays open in the middle.
    const bridge = (a: MPoint, b: MPoint) => { const m = centroid([a, b]); return along(center, m, Math.hypot(m.x, m.y) + 3); };
    const c5 = bridge(sugar.c4, p); const o = bridge(p, next.c3);
    drawing.bonds.push([sugar.c4, c5], [c5, p], [p, o], [o, next.c3]);
    drawing.atoms.push({ p: c5, r: 2.4, el: 'c' }, { p: o, r: 2.6, el: 'o' });
    drawPhosphate(drawing, p, along(c5, o, 1), dir);
    loop.push(sugar.c3, sugar.c4, c5, p, o);
  });
  drawing.cycle = loop;
}

const pathOf = (points: readonly MPoint[], closed: boolean) => `M${points.map(p => `${round(p.x)} ${round(p.y)}`).join('L')}${closed ? 'Z' : ''}`;

/** Draws a topology in local units; the caller centres and scales it. */
function moleculeDrawing(topology: Exclude<SmallMoleculeTopology, { kind: 'ion' }>): MoleculeDrawing {
  const drawing: MoleculeDrawing = { atoms: [], bonds: [], doubles: [], rings: [], charges: [], phosphates: 0 };
  if (topology.kind === 'ring') drawRingSystem(drawing, topology.ring);
  else if (topology.closure === 'cyclic' && topology.units.length > 1) drawCycle(drawing, topology.units);
  else if (topology.units.length > 1) {
    // Two units joined head to head through their terminal phosphates.
    const [a, b] = topology.units as [MoleculeUnit, MoleculeUnit];
    const reach = (u: MoleculeUnit) => 31 + (Math.max(1, Math.min(u.phosphates ?? 1, 6)) - 1) * 16;
    const left = drawUnit(drawing, { ...a, phosphates: Math.max(1, a.phosphates ?? 1) }, { x: -reach(a) - 8, y: 0 }, true);
    const right = drawUnit(drawing, { ...b, phosphates: Math.max(1, b.phosphates ?? 1) }, { x: reach(b) + 8, y: 0 }, false);
    if (left && right) drawing.bonds.push([left, right]);
  } else if (topology.units[0]) drawUnit(drawing, topology.units[0], { x: 0, y: 0 }, false);
  return drawing;
}

function renderMoleculeTopology(options: SmallMoleculeOptions & { topology: SmallMoleculeTopology }): string {
  const x = options.x ?? 0; const y = options.y ?? 0; const scale = options.scale ?? 1; const { topology } = options;
  const open = (attrs: string) => `<g class="mm-primitive mm-primitive--molecule mm-molecule--topology" data-visual-seed="${esc(options.visualSeed)}" ${attrs}>`;
  const label = (top: number) => options.label ? `<text class="mm-molecule__label" x="${round(x)}" y="${round(top - 6)}">${esc(options.label)}</text>` : '';
  if (topology.kind === 'ion') {
    const r = 12 * (topology.size ?? 1) * scale; const charge = topology.charge ?? 0;
    const sign = charge ? `${Math.abs(charge) > 1 ? Math.abs(charge) : ''}${charge > 0 ? '+' : '−'}` : '';
    return `${open(`data-topology="ion" data-charge="${charge}"`)}<circle class="mm-molecule__ion" cx="${round(x)}" cy="${round(y)}" r="${round(r)}" fill="${esc(options.fill ?? '#a3afc4')}"/><text class="mm-molecule__symbol" x="${round(x)}" y="${round(y + 3.6 * scale)}" style="font-size:${round(10 * scale)}px">${esc(topology.symbol)}</text>${sign ? `<text class="mm-molecule__charge" x="${round(x + r * .78)}" y="${round(y - r * .62)}" style="font-size:${round(7 * scale)}px">${sign}</text>` : ''}${label(y - r - 4 * scale)}</g>`;
  }
  const drawing = moleculeDrawing(topology);
  const extents = [...drawing.atoms.map(a => [a.p, a.r] as const), ...drawing.charges.map(p => [p, 3.4] as const)];
  const minX = Math.min(...extents.map(([p, r]) => p.x - r)); const maxX = Math.max(...extents.map(([p, r]) => p.x + r));
  const minY = Math.min(...extents.map(([p, r]) => p.y - r)); const maxY = Math.max(...extents.map(([p, r]) => p.y + r));
  const tx = x - scale * (minX + maxX) / 2; const ty = y - scale * (minY + maxY) / 2;
  const units = topology.kind === 'units' ? topology.units.length : 0;
  const closure = topology.kind === 'units' && topology.closure === 'cyclic' && units > 1 ? 'cyclic' : 'open';
  const doubles = drawing.doubles.map(([a, b]) => { const d = along({ x: 0, y: 0 }, { x: b.x - a.x, y: b.y - a.y }, 1); const n = rotateDir(d, 90); const o = 1.3; return `M${round(a.x + n.x * o)} ${round(a.y + n.y * o)}L${round(b.x + n.x * o)} ${round(b.y + n.y * o)}M${round(a.x - n.x * o)} ${round(a.y - n.y * o)}L${round(b.x - n.x * o)} ${round(b.y - n.y * o)}`; }).join('');
  const charges = drawing.charges.map(p => `<g class="mm-molecule__charge-mark"><circle cx="${round(p.x)}" cy="${round(p.y)}" r="3.4"/><path d="M${round(p.x - 1.9)} ${round(p.y)}h3.8M${round(p.x)} ${round(p.y - 1.9)}v3.8"/></g>`).join('');
  return `${open(`data-topology="${topology.kind}" data-units="${units}" data-phosphates="${drawing.phosphates}" data-closure="${closure}"`)}<g transform="translate(${round(tx)} ${round(ty)}) scale(${round(scale * 100) / 100})">`
    + `${drawing.cycle ? `<path class="mm-molecule__cycle" d="${pathOf(drawing.cycle, true)}"/>` : ''}`
    + `<path class="mm-molecule__bonds" d="${drawing.bonds.map(bond => pathOf(bond, false)).join('')}${doubles}"/>`
    + `<path class="mm-molecule__bonds mm-molecule__rings" d="${drawing.rings.map(ring => pathOf(ring, true)).join('')}"/>`
    + drawing.atoms.map(a => `<circle class="mm-atom mm-atom--${a.el}" cx="${round(a.p.x)}" cy="${round(a.p.y)}" r="${a.r}"/>`).join('')
    + `${charges}</g>${label(ty + scale * minY)}</g>`;
}

export function renderSmallMoleculePrimitive(options: SmallMoleculeOptions): string {
  if (options.topology) return renderMoleculeTopology({ ...options, topology: options.topology });
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

/** Small molecules. */
export const moleculeCss = `.mm-molecule__bonds{fill:none;stroke:#718096;stroke-width:3;stroke-linecap:round}.mm-atom{stroke:#fff;stroke-width:1}.mm-atom--c{fill:#9aa7bb}.mm-atom--n{fill:#4f84d4}.mm-atom--o{fill:#e75d67}.mm-atom--p{fill:#eaaa38}.mm-molecule__label{text-anchor:middle;fill:currentColor;font:600 10px Inter,system-ui}
.mm-molecule--topology .mm-molecule__bonds{stroke-width:1.8;stroke-linejoin:round}.mm-molecule--topology .mm-atom{stroke-width:.8}.mm-atom--h{fill:#b8c2d3}.mm-molecule__cycle{fill:currentColor;fill-opacity:.05;stroke:none}.mm-molecule__charge-mark circle{fill:none;stroke:currentColor;stroke-width:.8}.mm-molecule__charge-mark path{fill:none;stroke:currentColor;stroke-width:1;stroke-linecap:round}.mm-molecule__ion{stroke:#fff;stroke-width:1.2}.mm-molecule__symbol{text-anchor:middle;fill:#17213b;font-family:Inter,system-ui;font-weight:700}.mm-molecule__charge{fill:currentColor;font-family:Inter,system-ui;font-weight:700}`;
