import type { ProteinSphere } from '../src';

/**
 * Independent contact oracle for tests: samples the visible outline of particle shapes (outline
 * margin included) and measures how two placed shapes relate. It deliberately does not reuse the
 * fitting code under test.
 */
export interface Placed { particles: readonly ProteinSphere[]; margin: number; x: number; y: number }
interface Pt { x: number; y: number }

const inside = (shape: Placed, x: number, y: number, slack = 0) => shape.particles.some(p => {
  const theta = p.rotation * Math.PI / 180;
  const dx = x - shape.x - p.x; const dy = y - shape.y - p.y;
  const u = dx * Math.cos(theta) + dy * Math.sin(theta);
  const v = -dx * Math.sin(theta) + dy * Math.cos(theta);
  return (u / (p.rx + shape.margin + slack)) ** 2 + (v / (p.ry + shape.margin + slack)) ** 2 <= 1;
});

/** Outline points in absolute coordinates (every ~1px), excluding points buried in the shape. */
export function outline(shape: Placed): Pt[] {
  const points: Pt[] = [];
  for (const p of shape.particles) {
    const rx = p.rx + shape.margin; const ry = p.ry + shape.margin; const theta = p.rotation * Math.PI / 180;
    const count = Math.max(16, Math.ceil(Math.PI * (rx + ry)));
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2; const u = Math.cos(a) * rx; const v = Math.sin(a) * ry;
      const x = shape.x + p.x + u * Math.cos(theta) - v * Math.sin(theta);
      const y = shape.y + p.y + u * Math.sin(theta) + v * Math.cos(theta);
      if (!inside(shape, x, y, -.2)) points.push({ x, y });
    }
  }
  return points;
}

/** Smallest distance between the two outlines (0 when they cross). */
export function outlineDistance(a: Placed, b: Placed): number {
  const pa = outline(a); const pb = outline(b);
  let best = Infinity;
  for (const p of pa) for (const q of pb) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
  return best;
}

export const overlaps = (a: Placed, b: Placed) => outline(b).some(p => inside(a, p.x, p.y)) || outline(a).some(p => inside(b, p.x, p.y));

/** How far `b` must move away from `a` (along the line between their origins) until the outlines separate. */
export function penetration(a: Placed, b: Placed): number {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const d = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  for (let t = 0; t <= 40; t += .25) if (!overlaps(a, { ...b, x: b.x + d.x * t, y: b.y + d.y * t })) return t;
  return Infinity;
}
