import { type ProteinPoint } from './protein-geometry';
import { round } from './shared';

/**
 * Identical, neutral repeating units: linked into a chain (a polymer) or left free (monomers). Units
 * are rounded squares, so they never read as the round beads of a modification chain, even in grey.
 * The primitive is generic: the caller decides what a unit stands for.
 */
export interface UnitChainOptions {
  /** Number of units when they are laid out along a row (ignored when `points` is given). */
  count?: number;
  /** Centre of the first unit of a row. */
  x?: number; y?: number;
  /** Distance between consecutive unit centres in a row. */
  spacing?: number;
  /** Amplitude of the row's gentle wave, so a long chain does not read as a ruler. */
  wave?: number;
  /** Explicit unit centres, in chain order; overrides the row layout. */
  points?: readonly ProteinPoint[];
  /** Edge length of one unit. */
  size?: number;
  /** Bond consecutive units into one chain (default) or draw them as free monomers. */
  linked?: boolean;
}

export function renderUnitChainPrimitive(options: UnitChainOptions = {}): string {
  const size = options.size ?? 12; const spacing = options.spacing ?? size * 1.25; const linked = options.linked ?? true;
  const points = options.points ?? Array.from({ length: Math.max(1, options.count ?? 5) }, (_, index) => ({
    x: (options.x ?? 0) + index * spacing,
    y: (options.y ?? 0) + Math.sin(index * .9) * (options.wave ?? 0),
  }));
  // Linked units follow the chain's local direction; free units take a small deterministic tilt each.
  const angle = (index: number) => {
    if (!linked || points.length < 2) return ((index * 37) % 50) - 25;
    const a = points[Math.max(0, index - 1)]!; const b = points[Math.min(points.length - 1, index + 1)]!;
    return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  };
  const half = round(size / 2);
  const bonds = linked && points.length > 1 ? `<path class="mm-unit-chain__bonds" d="${points.map((p, i) => `${i ? 'L' : 'M'}${round(p.x)} ${round(p.y)}`).join('')}"/>` : '';
  const units = points.map((p, i) => `<rect class="mm-unit-chain__unit" x="${-half}" y="${-half}" width="${round(size)}" height="${round(size)}" rx="${round(size * .28)}" transform="translate(${round(p.x)} ${round(p.y)}) rotate(${round(angle(i))})"/>`).join('');
  return `<g class="mm-primitive mm-primitive--unit-chain mm-unit-chain--${linked ? 'linked' : 'free'}" data-units="${points.length}">${bonds}${units}</g>`;
}

/** Neutral repeating units (monomers and polymer chains); slate tones read on light and dark grounds. */
export const unitChainCss = `.mm-unit-chain__bonds{fill:none;stroke:#64748b;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.mm-unit-chain__unit{fill:#b8c3d4;stroke:#4b5a70;stroke-width:1.4}`;
