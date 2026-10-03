import { overlapsInterval, type Interval } from './intervals';
import { instanceDefinition } from './instances';
import { nucleicLength, otherStrand, readNucleicState } from './nucleic';
import { partnerOf } from './pairings';
import type { ApplyContext } from './registry';
import type { FootprintForm, MechanismState, Occupancy, SiteStrand, StrandId } from './types';

/**
 * Span occupancy on nucleic acids (RFC 0005 §5). Records stay flat and independent; everything that
 * relates them (who may overlap whom, whether an occupant still fits the strands) is a rule here.
 */

export const strandsOf = (strand: SiteStrand): StrandId[] => strand === 'both' ? ['top', 'bottom'] : [strand];
const range = ({ from, to }: Interval) => `${from}–${to}`;

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

type StrandState = Pick<MechanismState, 'actors' | 'pairings'>;
type Definition = ApplyContext['definition'];

/**
 * Why a span occupancy does not fit the molecule's strands as they are now, or `undefined`. Forms read
 * what each covered nucleotide is paired with, by any means (RFC 0006 §7): `single` needs its strand
 * unpaired; `duplex` needs it paired, in cis or in trans, and with each other when it covers both
 * strands; `any` is the absence of a form restriction and needs only the occupied strand(s) present.
 */
export function occupancyMisfit(state: StrandState, definition: Definition, occupancy: Occupancy, form: FootprintForm): string | undefined {
  const span = occupancy.span!; const strand = occupancy.strand!;
  const length = nucleicLength(instanceDefinition(definition, occupancy.acid)!);
  if (span.from < 0 || span.to > length) return `${range(span)} runs past the molecule (0–${length})`;
  const partners = strandsOf(strand).map(item => ({ strand: item, segments: partnerOf(state, definition, { acid: occupancy.acid, strand: item, ...span }) }));
  for (const { strand: item, segments } of partners) {
    if (segments.some(segment => segment.partner === 'absent')) return `the ${item} strand is missing within ${range(span)}`;
  }
  if (form === 'single') {
    if (strand === 'both') return 'a single-stranded footprint covers one strand, not both';
    for (const segment of partners[0]!.segments) {
      if (segment.partner === 'cis') return `it needs single-stranded DNA, but the ${otherStrand(strand)} strand is present within ${range(span)}`;
      if (segment.partner === 'trans') return `it needs single-stranded DNA, but ${range(segment)} is paired with ${segment.with.acid} ${segment.with.strand} strand ${range(segment.with)}`;
    }
  }
  if (form === 'duplex') {
    const open = readNucleicState(state.actors[occupancy.acid] ?? {}).open;
    for (const { strand: item, segments } of partners) {
      for (const segment of segments) {
        if (segment.partner === 'unpaired') return overlapsInterval(open, segment) ? `it needs paired DNA, but ${range(span)} is unwound` : `it needs duplex DNA across ${range(span)}`;
        if (segment.partner === 'trans' && strand === 'both') return `it needs both strands paired with each other, but the ${item} strand ${range(segment)} is paired with ${segment.with.acid}`;
      }
    }
  }
  return undefined;
}

/** Strand an occupant takes when the action names none: the one its form allows, or fail when ambiguous. */
export function defaultStrand(state: StrandState, definition: Definition, acid: string, span: Interval, form: FootprintForm, fail: (message: string) => never): SiteStrand {
  const partners = (strand: StrandId) => partnerOf(state, definition, { acid, strand, ...span });
  const present = (strand: StrandId) => partners(strand).every(segment => segment.partner !== 'absent');
  if (form === 'duplex') return 'both';
  if (form === 'any') return present('top') && present('bottom') ? 'both' : present('top') ? 'top' : 'bottom';
  const single = (['top', 'bottom'] as const).filter(strand => partners(strand).every(segment => segment.partner === 'unpaired'));
  if (single.length !== 1) fail(`no single strand to occupy across ${range(span)}; name the strand`);
  return single[0]!;
}

/** Add a span occupancy after checking it against the strands and the occupancy rule. */
export function placeOccupancy(state: MechanismState, ctx: ApplyContext, occupancy: Occupancy): void {
  const misfit = occupancyMisfit(state, ctx.definition, occupancy, occupantForm(ctx, occupancy.instance));
  if (misfit) ctx.fail(`"${occupancy.instance}" cannot occupy ${occupancy.acid} ${range(occupancy.span!)}: ${misfit}`);
  const conflict = occupancyConflicts(Object.values(state.occupancy), occupancy)[0];
  if (conflict) ctx.fail(`"${occupancy.instance}" would overlap "${conflict.instance}" on ${conflict.acid} ${range(conflict.span!)} (${conflict.strand})`);
  state.occupancy[occupancy.id] = occupancy;
}

/**
 * Strand-changing actions (resect, extend, unwind, anneal, pair, unpair) never displace occupants
 * silently: after the change every span occupant must still fit, or the action fails naming it.
 * Without `acid`, every molecule is checked, since a pairing changes two of them.
 */
export function requireOccupantsFit(state: MechanismState, ctx: ApplyContext, acid?: string): void {
  for (const occupancy of Object.values(state.occupancy)) {
    if ((acid && occupancy.acid !== acid) || !occupancy.span) continue;
    const misfit = occupancyMisfit(state, ctx.definition, occupancy, occupantForm(ctx, occupancy.instance));
    if (misfit) ctx.fail(`"${occupancy.instance}" occupies ${occupancy.acid} ${range(occupancy.span)} and would no longer fit (${misfit}); vacate it first`);
  }
}
