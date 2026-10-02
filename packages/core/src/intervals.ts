/** Half-open interbase interval [from, to). Lists are kept normalised: sorted, merged, non-empty. */
export interface Interval { from: number; to: number }

export function normalizeIntervals(list: readonly Interval[]): Interval[] {
  const sorted = list.filter(item => item.to > item.from).map(item => ({ ...item })).sort((a, b) => a.from - b.from);
  const out: Interval[] = [];
  for (const item of sorted) {
    const last = out.at(-1);
    if (last && item.from <= last.to) last.to = Math.max(last.to, item.to);
    else out.push(item);
  }
  return out;
}

export const addInterval = (list: readonly Interval[], add: Interval) => normalizeIntervals([...list, add]);

export function subtractInterval(list: readonly Interval[], cut: Interval): Interval[] {
  return normalizeIntervals(list.flatMap(item => [
    { from: item.from, to: Math.min(item.to, cut.from) },
    { from: Math.max(item.from, cut.to), to: item.to },
  ]));
}

/** True when some interval shares at least one position with `probe`. Touching and empty intervals never overlap. */
export const overlapsInterval = (list: readonly Interval[], probe: Interval) =>
  list.some(item => Math.max(item.from, probe.from) < Math.min(item.to, probe.to));

/** The interval that contains position `[at, at + 1)`, if any. */
export const intervalAt = (list: readonly Interval[], at: number) => list.find(item => item.from <= at && at < item.to);
