import { normalizeIntervals, subtractInterval, type Interval } from './intervals';
import type { ActorDefinition, ActorSite, ActorState, LesionType, NucleicForm, NucleicState, Orientation, StrandId, StrandRange } from './types';

/** Length of a nucleic acid that declares none. Chosen so v2 `start`/`center`/`end` map to 28/50/72. */
export const DEFAULT_NUCLEIC_LENGTH = 100;

export const isNucleicActor = (actor: Pick<ActorDefinition, 'type'>) => actor.type === 'dna' || actor.type === 'rna';

export const nucleicLength = (actor: Pick<ActorDefinition, 'nucleic'>) => actor.nucleic?.length ?? DEFAULT_NUCLEIC_LENGTH;

export const nucleicForm = (actor: Pick<ActorDefinition, 'type' | 'nucleic'>): NucleicForm =>
  actor.nucleic?.form ?? (actor.type === 'rna' ? 'single' : 'duplex');

/** Interbase interval of a site; a point site is the empty interval at its boundary. Undefined without a coordinate. */
export function siteInterval(site: Pick<ActorSite, 'at' | 'span'>): { from: number; to: number } | undefined {
  if (site.at !== undefined) return { from: site.at, to: site.at };
  if (site.span) return { from: site.span[0], to: site.span[1] };
  return undefined;
}

/**
 * Strands a lesion at a site affects. A double-strand break always cuts both; other lesions use the
 * site's `strand`, defaulting to `top` (RFC 0004 §3). Single-stranded molecules only have `top`.
 */
export function lesionStrands(acid: Pick<ActorDefinition, 'type' | 'nucleic'>, site: Pick<ActorSite, 'strand'>, lesion: LesionType | undefined): StrandId[] {
  if (nucleicForm(acid) === 'single') return ['top'];
  const strand = lesion === 'double-strand-break' ? 'both' : site.strand ?? 'top';
  return strand === 'both' ? ['top', 'bottom'] : [strand];
}

export const otherStrand = (strand: StrandId): StrandId => strand === 'top' ? 'bottom' : 'top';

/** Intervals of one strand from a normalised `StrandRange` list. */
export const strandIntervals = (ranges: readonly StrandRange[], strand: StrandId): Interval[] =>
  ranges.filter(range => range.strand === strand).map(({ from, to }) => ({ from, to }));

/** Replace one strand's intervals, keeping the list normalised (top before bottom). */
export function withStrandIntervals(ranges: readonly StrandRange[], strand: StrandId, intervals: readonly Interval[]): StrandRange[] {
  const next = [...ranges.filter(range => range.strand !== strand), ...normalizeIntervals(intervals).map(item => ({ strand, ...item }))];
  return next.sort((a, b) => (a.strand === b.strand ? a.from - b.from : a.strand === 'top' ? -1 : 1));
}

/** A mutable copy of an actor's strand state; an intact molecule reads as empty lists. */
export const readNucleicState = (actor: Pick<ActorState, 'nucleic'>): Required<NucleicState> => ({
  missing: [...actor.nucleic?.missing ?? []],
  nascent: [...actor.nucleic?.nascent ?? []],
  open: [...actor.nucleic?.open ?? []],
  excised: [...actor.nucleic?.excised ?? []],
});

/** Store strand state; an intact molecule drops the field, and `excised` while empty, so earlier snapshots stay unchanged. */
export function writeNucleicState(actor: ActorState, { missing, nascent, open, excised }: Required<NucleicState>): void {
  if (!missing.length && !nascent.length && !open.length && !excised.length) delete actor.nucleic;
  else actor.nucleic = { missing, nascent, open, ...(excised.length && { excised }) };
}

/** Strand state in its normal form, as action results are stored: per strand sorted and merged, top before bottom. */
export function normalizeNucleicState(state: Partial<NucleicState>): Required<NucleicState> {
  const perStrand = (ranges: readonly StrandRange[] = []) =>
    (['top', 'bottom'] as const).reduce<StrandRange[]>((list, strand) => withStrandIntervals(list, strand, strandIntervals(ranges, strand)), []);
  const merged = (list: readonly Interval[] = []) => normalizeIntervals(list.map(({ from, to }) => ({ from, to })));
  return { missing: perStrand(state.missing), nascent: perStrand(state.nascent), open: merged(state.open), excised: merged(state.excised) };
}

// ---- Excision (RFC 0007 §4): coordinates stay, covalent adjacency is derived from `excised` ----

/** Intervals excised from a molecule; none while it is whole. */
export const excisedOf = (actor: Pick<ActorState, 'nucleic'> | undefined): Interval[] => actor?.nucleic?.excised ?? [];

/** The parts of `range` that still exist: its extant nucleotides, as intervals in covalent order. */
export const extantIntervals = (excised: readonly Interval[], range: Interval): Interval[] =>
  excised.reduce<Interval[]>((rest, cut) => subtractInterval(rest, cut), [range]);

/** How many nucleotides of `range` still exist. `nucleicLength` is the coordinate extent, not this. */
export const extantLength = (excised: readonly Interval[], range: Interval) =>
  extantIntervals(excised, range).reduce((sum, item) => sum + item.to - item.from, 0);

/** True when the interbase position `at` lies strictly inside an excised interval: nothing is there to act on. */
export const insideExcised = (excised: readonly Interval[], at: number) => excised.some(item => item.from < at && at < item.to);

/**
 * A boundary coordinate read through the new adjacency (RFC 0007 §6.1): both ends of an excised
 * interval are its junction. `lower` is the coordinate just after the nucleotide on its 5′ side,
 * `upper` the coordinate of the nucleotide on its 3′ side; away from a junction both are `at`.
 */
export function junctionAt(excised: readonly Interval[], at: number): { lower: number; upper: number } {
  const across = excised.find(item => item.from === at || item.to === at);
  return across ? { lower: across.from, upper: across.to } : { lower: at, upper: at };
}

/**
 * The coordinate interval that holds `count` extant nucleotides from the boundary `at`, forward
 * (towards increasing coordinates) or reverse. It follows covalent order, so it may contain excised
 * intervals; it may also run past the molecule, which the caller reports.
 */
export function extantRun(excised: readonly Interval[], at: number, count: number, orientation: Orientation = 'forward'): Interval {
  const { lower, upper } = junctionAt(excised, at);
  let remaining = count;
  if (orientation === 'forward') {
    let to = upper;
    for (const item of excised) {
      if (item.to <= to) continue;
      if (remaining <= item.from - to) break;
      remaining -= item.from - to;
      to = item.to;
    }
    return { from: upper, to: to + remaining };
  }
  let from = lower;
  for (const item of [...excised].reverse()) {
    if (item.from >= from) continue;
    if (remaining <= from - item.to) break;
    remaining -= from - item.to;
    from = item.from;
  }
  return { from: from - remaining, to: lower };
}
