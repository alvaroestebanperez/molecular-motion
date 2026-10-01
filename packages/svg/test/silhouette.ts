import type { ProteinSphere } from '../src';

const GRID = 56;

/** Rasterise the union of a protein's particles on a grid normalised to its radius. */
export function silhouetteMask(particles: readonly ProteinSphere[], radius: number, angle = 0, mirror = false): Uint8Array {
  const mask = new Uint8Array(GRID * GRID);
  const cos = Math.cos(angle); const sin = Math.sin(angle);
  const placed = particles.map(particle => {
    const x = mirror ? -particle.x : particle.x;
    const theta = (mirror ? -particle.rotation : particle.rotation) * Math.PI / 180 + angle;
    return { x: x * cos - particle.y * sin, y: x * sin + particle.y * cos, rx: particle.rx, ry: particle.ry, cos: Math.cos(theta), sin: Math.sin(theta) };
  });
  for (let row = 0; row < GRID; row++) {
    for (let column = 0; column < GRID; column++) {
      const px = ((column + .5) / GRID * 2 - 1) * radius * 1.05;
      const py = ((row + .5) / GRID * 2 - 1) * radius * 1.05;
      mask[row * GRID + column] = placed.some(p => {
        const dx = px - p.x; const dy = py - p.y;
        const u = dx * p.cos + dy * p.sin; const v = -dx * p.sin + dy * p.cos;
        return (u / p.rx) ** 2 + (v / p.ry) ** 2 <= 1;
      }) ? 1 : 0;
    }
  }
  return mask;
}

const iou = (a: Uint8Array, b: Uint8Array) => {
  let union = 0; let intersection = 0;
  for (let index = 0; index < a.length; index++) { union += a[index]! | b[index]!; intersection += a[index]! & b[index]!; }
  return union ? intersection / union : 1;
};

/** Best overlap over rotations and mirroring: a high value means the two silhouettes look alike. */
export function silhouetteSimilarity(a: readonly ProteinSphere[], b: readonly ProteinSphere[], radius: number): number {
  const reference = silhouetteMask(a, radius);
  let best = 0;
  for (const mirror of [false, true]) {
    for (let step = 0; step < 24; step++) best = Math.max(best, iou(reference, silhouetteMask(b, radius, step * Math.PI / 12, mirror)));
  }
  return best;
}
