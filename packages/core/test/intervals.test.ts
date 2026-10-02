import { describe, expect, it } from 'vitest';
import { addInterval, normalizeIntervals, overlapsInterval, subtractInterval, type Interval } from '../src';

/** Seeded LCG so every failure is reproducible. */
function random(seed: number) {
  let value = seed;
  return (max: number) => { value = (value * 1103515245 + 12345) % 2 ** 31; return value % max; };
}

const SIZE = 40;
const toSet = (list: readonly Interval[]) => new Set(list.flatMap(({ from, to }) => Array.from({ length: Math.max(0, to - from) }, (_, index) => from + index)));
const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);
const isNormal = (list: readonly Interval[]) => list.every((item, index) => item.from < item.to && (index === 0 || list[index - 1]!.to < item.from));

describe('interval lists (property test against a position set)', () => {
  const next = random(2026);
  const anyInterval = (): Interval => { const from = next(SIZE); return { from, to: from + next(SIZE - from + 1) }; };
  const cases = Array.from({ length: 400 }, () => ({ list: Array.from({ length: next(6) }, anyInterval), probe: anyInterval() }));

  it('normalises to sorted, merged, non-empty intervals covering the same positions', () => {
    for (const { list } of cases) {
      const normal = normalizeIntervals(list);
      expect(isNormal(normal)).toBe(true);
      expect(sorted(toSet(normal))).toEqual(sorted(toSet(list)));
    }
  });

  it('adds, subtracts and tests overlap like set union, difference and intersection', () => {
    for (const { list, probe } of cases) {
      const base = toSet(list); const cut = toSet([probe]);
      const added = addInterval(normalizeIntervals(list), probe);
      const subtracted = subtractInterval(normalizeIntervals(list), probe);
      expect(isNormal(added) && isNormal(subtracted)).toBe(true);
      expect(sorted(toSet(added))).toEqual(sorted(new Set([...base, ...cut])));
      expect(sorted(toSet(subtracted))).toEqual(sorted(base).filter(position => !cut.has(position)));
      expect(overlapsInterval(list, probe)).toBe([...cut].some(position => base.has(position)));
    }
  });
});
