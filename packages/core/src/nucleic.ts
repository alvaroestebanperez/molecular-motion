import { normalizeIntervals, type Interval } from './intervals';
import type { ActorDefinition, ActorSite, ActorState, LesionType, NucleicForm, NucleicState, StrandId, StrandRange } from './types';

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
export const readNucleicState = (actor: Pick<ActorState, 'nucleic'>): NucleicState => ({
  missing: [...actor.nucleic?.missing ?? []],
  nascent: [...actor.nucleic?.nascent ?? []],
  open: [...actor.nucleic?.open ?? []],
});

/** Store strand state; an intact molecule drops the field so v2 snapshots stay unchanged. */
export function writeNucleicState(actor: ActorState, state: NucleicState): void {
  if (!state.missing.length && !state.nascent.length && !state.open.length) delete actor.nucleic;
  else actor.nucleic = state;
}
