import { overlapsInterval, subtractInterval, type Interval } from './intervals';
import { instanceDefinition } from './instances';
import { otherStrand, readNucleicState, strandIntervals } from './nucleic';
import type { ApplyContext } from './registry';
import type { FootprintForm, MechanismState, NucleicState, Occupancy, SiteStrand, StrandId } from './types';

/**
 * Span occupancy on nucleic acids (RFC 0005 §5). Records stay flat and independent; everything that
 * relates them (who may overlap whom, whether an occupant still fits the strands) is a rule here.
 */

export const strandsOf = (strand: SiteStrand): StrandId[] => strand === 'both' ? ['top', 'bottom'] : [strand];
const range = ({ from, to }: Interval) => `${from}–${to}`;
/** Parts of `span` not covered by any of `cuts`. */
const uncovered = (span: Interval, cuts: readonly Interval[]) => cuts.reduce<Interval[]>((rest, cut) => subtractInterval(rest, cut), [span]);

/**
 * The occupancy rule (D10): two span occupancies may not cover the same nucleotide on the same
 * strand. It is the only place that encodes exclusivity, so relaxing it later (stacking, declared
 * compatibility) changes this function, not the state.
 */
export function occupancyConflicts(existing: readonly Occupancy[], candidate: Occupancy): Occupancy[] {
  if (!candidate.span || !candidate.strand) return [];
  const strands = strandsOf(candidate.strand);
  return existing.filter(other => other.id !== candidate.id && other.acid === candidate.acid && other.span && other.strand
    && overlapsInterval([other.span], candidate.span!) && strandsOf(other.strand).some(strand => strands.includes(strand)));
}

/** Form an occupant needs: its footprint's, or `any` for an explicit span without a footprint. */
export const occupantForm = (state: { definition: ApplyContext['definition'] }, instance: string): FootprintForm =>
  instanceDefinition(state.definition, instance)?.footprint?.form ?? 'any';

/**
 * Why a span occupancy does not fit the molecule's strands as they are now, or `undefined`.
 * `single` needs its strand present and the partner missing across the whole span; `duplex` needs both
 * strands present and paired; `any` needs the occupied strand(s) present.
 */
export function occupancyMisfit(nucleic: NucleicState, length: number, occupancy: Occupancy, form: FootprintForm): string | undefined {
  const span = occupancy.span!; const strand = occupancy.strand!;
  if (span.from < 0 || span.to > length) return `${range(span)} runs past the molecule (0–${length})`;
  for (const item of strandsOf(strand)) {
    if (overlapsInterval(strandIntervals(nucleic.missing, item), span)) return `the ${item} strand is missing within ${range(span)}`;
  }
  if (form === 'single') {
    if (strand === 'both') return 'a single-stranded footprint covers one strand, not both';
    const partner = otherStrand(strand);
    if (uncovered(span, strandIntervals(nucleic.missing, partner)).length) return `it needs single-stranded DNA, but the ${partner} strand is present within ${range(span)}`;
  }
  if (form === 'duplex') {
    if (strandsOf('both').some(item => overlapsInterval(strandIntervals(nucleic.missing, item), span))) return `it needs duplex DNA across ${range(span)}`;
    if (overlapsInterval(nucleic.open, span)) return `it needs paired DNA, but ${range(span)} is unwound`;
  }
  return undefined;
}

/** Strand an occupant takes when the action names none: the one its form allows, or fail when ambiguous. */
export function defaultStrand(nucleic: NucleicState, span: Interval, form: FootprintForm, fail: (message: string) => never): SiteStrand {
  const present = (strand: StrandId) => !overlapsInterval(strandIntervals(nucleic.missing, strand), span);
  if (form === 'duplex') return 'both';
  if (form === 'any') return present('top') && present('bottom') ? 'both' : present('top') ? 'top' : 'bottom';
  const single = (['top', 'bottom'] as const).filter(strand => present(strand) && !uncovered(span, strandIntervals(nucleic.missing, otherStrand(strand))).length);
  if (single.length !== 1) fail(`no single strand to occupy across ${range(span)}; name the strand`);
  return single[0]!;
}

/** Add a span occupancy after checking it against the strands and the occupancy rule. */
export function placeOccupancy(state: MechanismState, ctx: ApplyContext, occupancy: Occupancy, length: number): void {
  const misfit = occupancyMisfit(readNucleicState(ctx.actor(occupancy.acid)), length, occupancy, occupantForm(ctx, occupancy.instance));
  if (misfit) ctx.fail(`"${occupancy.instance}" cannot occupy ${occupancy.acid} ${range(occupancy.span!)}: ${misfit}`);
  const conflict = occupancyConflicts(Object.values(state.occupancy), occupancy)[0];
  if (conflict) ctx.fail(`"${occupancy.instance}" would overlap "${conflict.instance}" on ${conflict.acid} ${range(conflict.span!)} (${conflict.strand})`);
  state.occupancy[occupancy.id] = occupancy;
}

/**
 * Strand-changing actions (resect, extend, unwind, anneal) never displace occupants silently: after the
 * change every span occupant on the molecule must still fit, or the action fails naming it.
 */
export function requireOccupantsFit(state: MechanismState, ctx: ApplyContext, acid: string, length: number): void {
  const nucleic = readNucleicState(ctx.actor(acid));
  for (const occupancy of Object.values(state.occupancy)) {
    if (occupancy.acid !== acid || !occupancy.span) continue;
    const misfit = occupancyMisfit(nucleic, length, occupancy, occupantForm(ctx, occupancy.instance));
    if (misfit) ctx.fail(`"${occupancy.instance}" occupies ${acid} ${range(occupancy.span)} and would no longer fit (${misfit}); vacate it first`);
  }
}
