import {
  type ProteinSphere, type ProteinPoint, proteinOutlineWidth, insideParticle, type ProteinAnchors,
} from './protein-geometry';
import { round } from './shared';

/**
 * Where a ray from `origin` (default: the shape's local origin) along `angle` (radians) leaves the
 * visible surface (outline included when `radius` is given): the outermost surface point on that
 * ray. If the ray misses every particle (e.g. it crosses the opening of a crescent), the nearest
 * outline point to where the ray meets the bounding radius is used instead. Pure visual geometry.
 */
export function proteinSurfacePoint(particles: readonly ProteinSphere[], angle: number, radius?: number, origin: ProteinPoint = { x: 0, y: 0 }): ProteinPoint {
  const margin = radius === undefined ? 0 : proteinOutlineWidth(radius);
  const dx = Math.cos(angle); const dy = Math.sin(angle);
  const reach = Math.max(...particles.map(particle => Math.hypot(particle.x - origin.x, particle.y - origin.y) + Math.max(particle.rx, particle.ry) + margin));
  for (let t = reach; t >= 0; t -= .25) {
    const x = origin.x + dx * t; const y = origin.y + dy * t;
    if (particles.some(particle => insideParticle(particle, x, y, margin))) return { x: round(x), y: round(y) };
  }
  const target = { x: origin.x + dx * reach, y: origin.y + dy * reach };
  return roundPoint(nearest(contactOutline({ particles, margin }), target));
}

export type ContactSide = 'left' | 'right' | 'top' | 'bottom';

const OPPOSITE_SIDE: Record<ContactSide, ContactSide> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

const SIDE_NORMAL: Record<ContactSide, ProteinPoint> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

/**
 * Where to put a partner so that it touches an anchor shape: returns the translation of the
 * partner's local origin, relative to the anchor shape's local origin, that brings
 * `partner[opposite(side)]` onto `anchor[side]`, pressed `overlap` px further along the contact
 * normal so the two outlines merge instead of leaving a hairline gap. Pure visual geometry built
 * on contact anchors (never on bounding radii), with no biological meaning; it composes, e.g.
 * B relative to A, then C relative to B, for chains and assemblies.
 */
export function contactOffset(anchor: ProteinAnchors, partner: ProteinAnchors, side: ContactSide = 'right', overlap = 1.5): ProteinPoint {
  const from = anchor[side]; const to = partner[OPPOSITE_SIDE[side]]; const normal = SIDE_NORMAL[side];
  return { x: round(from.x - to.x - normal.x * overlap), y: round(from.y - to.y - normal.y * overlap) };
}

/**
 * Any visible shape made of particles, for contact fitting: a protein surface, a ball-and-stick
 * molecule, a bead chain, or a union of them, in local coordinates. `margin` is the outline drawn
 * around every particle (e.g. `proteinOutlineWidth(radius)`); it is part of the visible surface.
 */
export interface ContactShape { particles: readonly ProteinSphere[]; margin?: number }

/** Result of `firstContact`, both in the anchor shape's local coordinates. */
export interface FirstContact {
  /** Translation of the partner's local origin relative to the anchor's local origin. */
  offset: ProteinPoint;
  /** Where the two outlines meet. */
  point: ProteinPoint;
}

interface OutlineCache { points: ProteinPoint[]; box: [number, number, number, number]; centre: ProteinPoint }

const outlineCache = new WeakMap<ContactShape, OutlineCache>();

/**
 * Points sampled every ~`step` px along the visible outline of a shape: the edge of every particle
 * (grown by the margin) that is not covered by another particle. Pure geometry, deterministic.
 */
export function contactOutline(shape: ContactShape, step = 1.5): ProteinPoint[] {
  return outlineOf(shape, step).points;
}

function outlineOf(shape: ContactShape, step = 1.5): OutlineCache {
  const cached = outlineCache.get(shape);
  if (cached && step === 1.5) return cached;
  const margin = shape.margin ?? 0;
  const points: ProteinPoint[] = [];
  shape.particles.forEach((particle, index) => {
    const rx = particle.rx + margin; const ry = particle.ry + margin;
    const theta = particle.rotation * Math.PI / 180;
    const count = Math.max(12, Math.ceil(Math.PI * (rx + ry) / step));
    for (let sample = 0; sample < count; sample++) {
      const angle = sample / count * Math.PI * 2;
      const u = Math.cos(angle) * rx; const v = Math.sin(angle) * ry;
      const x = particle.x + u * Math.cos(theta) - v * Math.sin(theta);
      const y = particle.y + u * Math.sin(theta) + v * Math.cos(theta);
      // Keep only the true silhouette: points buried inside another particle cannot touch anything first.
      if (!shape.particles.some((other, otherIndex) => otherIndex !== index && insideParticle(other, x, y, margin - .05))) points.push({ x, y });
    }
  });
  const weight = shape.particles.reduce((sum, particle) => sum + particle.rx * particle.ry, 0) || 1;
  const centre = {
    x: shape.particles.reduce((sum, particle) => sum + particle.x * particle.rx * particle.ry, 0) / weight,
    y: shape.particles.reduce((sum, particle) => sum + particle.y * particle.rx * particle.ry, 0) / weight,
  };
  const xs = points.map(point => point.x); const ys = points.map(point => point.y);
  const result: OutlineCache = { points, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], centre };
  if (step === 1.5) outlineCache.set(shape, result);
  return result;
}

const insideShape = (shape: ContactShape, x: number, y: number) => shape.particles.some(particle => insideParticle(particle, x, y, shape.margin ?? 0));

/** Outline points of each shape that lie inside the other, with `partner` translated by `offset`; in anchor coordinates. */
function overlapPoints(anchor: ContactShape, partner: ContactShape, offset: ProteinPoint, first = false): ProteinPoint[] {
  const a = outlineOf(anchor); const b = outlineOf(partner);
  const [ax0, ay0, ax1, ay1] = a.box;
  const [bx0, by0, bx1, by1] = [b.box[0] + offset.x, b.box[1] + offset.y, b.box[2] + offset.x, b.box[3] + offset.y];
  if (bx0 > ax1 || bx1 < ax0 || by0 > ay1 || by1 < ay0) return [];
  const hits: ProteinPoint[] = [];
  for (const point of b.points) {
    const x = point.x + offset.x; const y = point.y + offset.y;
    if (x < ax0 || x > ax1 || y < ay0 || y > ay1) continue;
    if (insideShape(anchor, x, y)) { hits.push({ x, y }); if (first) return hits; }
  }
  for (const point of a.points) {
    if (point.x < bx0 || point.x > bx1 || point.y < by0 || point.y > by1) continue;
    if (insideShape(partner, point.x - offset.x, point.y - offset.y)) { hits.push(point); if (first) return hits; }
  }
  return hits;
}

/** True when the visible outlines of two shapes overlap, `partner` translated by `offset`. */
export function shapesOverlap(anchor: ContactShape, partner: ContactShape, offset: ProteinPoint): boolean {
  return overlapPoints(anchor, partner, offset, true).length > 0;
}

/**
 * First-contact fit: brings `partner` towards `anchor` along an approach axis and stops where their
 * visible outlines first meet, then presses `overlap` px further so the outlines merge instead of
 * leaving a hairline gap. The axis leaves `origin` (default: the anchor's centre) along
 * `direction`, and the partner's centre stays on it. Unlike `contactOffset`, which aligns the
 * anchors on the centre axis, this uses the whole particle geometry, so an off-axis lobe can never
 * end up buried in the partner. Pure visual geometry with no biological meaning; deterministic.
 */
export function firstContact(anchor: ContactShape, partner: ContactShape, direction: ContactSide | ProteinPoint = 'right', options: { overlap?: number; origin?: ProteinPoint } = {}): FirstContact {
  const raw = typeof direction === 'string' ? SIDE_NORMAL[direction] : direction;
  const length = Math.hypot(raw.x, raw.y) || 1;
  const d = { x: raw.x / length, y: raw.y / length };
  const a = outlineOf(anchor); const b = outlineOf(partner);
  const origin = options.origin ?? a.centre;
  const at = (t: number) => ({ x: origin.x + d.x * t - b.centre.x, y: origin.y + d.y * t - b.centre.y });
  const reach = (box: [number, number, number, number], from: ProteinPoint) => Math.hypot(Math.max(Math.abs(box[0] - from.x), Math.abs(box[2] - from.x)), Math.max(Math.abs(box[1] - from.y), Math.abs(box[3] - from.y)));
  const far = reach(a.box, origin) + reach(b.box, b.centre) + 2;
  // March in from a separated position; the first overlapping step brackets the first contact.
  let outside = far; let inside: number | undefined;
  for (let t = far; t >= -far; t -= 1) {
    if (shapesOverlap(anchor, partner, at(t))) { inside = t; break; }
    outside = t;
  }
  if (inside === undefined) return { offset: roundPoint(at(0)), point: roundPoint(origin) };
  let touching: number = inside;
  for (let iteration = 0; iteration < 10; iteration++) {
    const middle: number = (outside + touching) / 2;
    if (shapesOverlap(anchor, partner, at(middle))) touching = middle; else outside = middle;
  }
  const pressed = Math.max(0, options.overlap ?? 1.5);
  const offset = at(outside - pressed);
  const hits = overlapPoints(anchor, partner, at(outside - Math.max(pressed, .5)));
  const point = hits.length
    ? { x: hits.reduce((sum, hit) => sum + hit.x, 0) / hits.length, y: hits.reduce((sum, hit) => sum + hit.y, 0) / hits.length }
    : nearest(a.points, { x: offset.x + b.centre.x, y: offset.y + b.centre.y });
  return { offset: roundPoint(offset), point: roundPoint(point) };
}

const nearest = (points: readonly ProteinPoint[], to: ProteinPoint) => points.reduce((best, point) => Math.hypot(point.x - to.x, point.y - to.y) < Math.hypot(best.x - to.x, best.y - to.y) ? point : best, points[0] ?? to);

const roundPoint = (point: ProteinPoint): ProteinPoint => ({ x: round(point.x), y: round(point.y) });
