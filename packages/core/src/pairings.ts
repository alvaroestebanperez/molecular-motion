import { instanceDefinition } from './instances';
import { overlapsInterval, type Interval } from './intervals';
import { nucleicForm, otherStrand, readNucleicState, strandIntervals } from './nucleic';
import type { AlignmentDefinition, MechanismDefinition, MechanismState, Pairing, StrandSpan } from './types';

/**
 * Nucleic topology (RFC 0006 §3): base pairing between strand spans, stored once in `state.pairings`.
 * A pairing is only two strand spans of equal length. Everything else here is derived: which
 * nucleotide meets which, what a nucleotide is paired with, and whether a new pairing may form.
 */

type TopologyState = Pick<MechanismState, 'actors' | 'pairings'>;
type Definition = Pick<MechanismDefinition, 'actors'>;

const strandKey = (span: Pick<StrandSpan, 'acid' | 'strand'>) => `${span.acid}.${span.strand}`;
const length = (range: Interval) => range.to - range.from;
const rangeLabel = (span: StrandSpan) => `${span.acid} ${span.strand} strand ${span.from}–${span.to}`;

/** Ends in canonical order: by strand key, then by start for a strand paired with itself. */
function canonicalEnds(a: StrandSpan, b: StrandSpan): [StrandSpan, StrandSpan] {
  const [ka, kb] = [strandKey(a), strandKey(b)];
  return ka < kb || (ka === kb && a.from <= b.from) ? [a, b] : [b, a];
}

/** Key of `state.pairings`: the two strands, e.g. `chromosome.bottom~sister.top`. One diff key per strand pair. */
export const pairingKey = (a: Pick<StrandSpan, 'acid' | 'strand'>, b: Pick<StrandSpan, 'acid' | 'strand'>) => [strandKey(a), strandKey(b)].sort().join('~');

/**
 * Pairing is antiparallel and strand polarity is fixed (RFC 0004), so two spans of equal length leave
 * no freedom (RFC 0006 §3.2): `top`~`bottom` run the same way along the coordinate (direct), while two
 * strands of the same name run opposite ways (mirrored). Nothing about it is stored.
 */
const mirrored = (pairing: Pairing) => pairing.ends[0].strand === pairing.ends[1].strand;

/** The part of a pairing at offsets [i0, i1) from the start of `ends[0]`. */
function slice({ ends: [a, b] }: Pairing, i0: number, i1: number): Pairing {
  const partner = a.strand === b.strand ? { from: b.to - i1, to: b.to - i0 } : { from: b.from + i0, to: b.from + i1 };
  return { ends: [{ ...a, from: a.from + i0, to: a.from + i1 }, { ...b, ...partner }] };
}

/** Offsets of a pairing covered by `range` on one of its ends, or `undefined` when they do not overlap. */
function offsets(pairing: Pairing, end: 0 | 1, range: Interval): [number, number] | undefined {
  const span = pairing.ends[end];
  const from = Math.max(span.from, range.from); const to = Math.min(span.to, range.to);
  if (from >= to) return undefined;
  return end === 1 && mirrored(pairing) ? [span.to - to, span.to - from] : [from - span.from, to - span.from];
}

/** Sorted, with touching segments of the same correspondence merged, so equal topology is equal state. */
export function normalizePairings(list: readonly Pairing[]): Pairing[] {
  const sorted = list.filter(item => length(item.ends[0]) > 0).map(item => structuredClone(item)).sort((a, b) => a.ends[0].from - b.ends[0].from);
  const out: Pairing[] = [];
  for (const item of sorted) {
    const last = out.at(-1);
    const continues = last && last.ends[0].to === item.ends[0].from
      && (mirrored(item) ? item.ends[1].to === last.ends[1].from : item.ends[1].from === last.ends[1].to);
    if (!continues) { out.push(item); continue; }
    last.ends[0].to = item.ends[0].to;
    if (mirrored(item)) last.ends[1].from = item.ends[1].from; else last.ends[1].to = item.ends[1].to;
  }
  return out;
}

/** What a stretch of one strand is paired with (RFC 0006 §3.3). */
export type PartnerSegment = Interval & (
  /** The strand does not exist here: missing nucleotides, or the bottom of a single-stranded molecule. */
  | { partner: 'absent' }
  /** The nucleotides were excised from the molecule (RFC 0007 §6.8): not present, not a gap, not paired. */
  | { partner: 'excised' }
  | { partner: 'unpaired' }
  /** Paired with its own molecule's other strand (derived, RFC 0004). */
  | { partner: 'cis' }
  /** Paired with another strand span through a pairing. */
  | { partner: 'trans'; with: StrandSpan }
);

/** Pairings that touch `range` of one strand, cut to the overlap, as (own span, partner span). */
function transPartners(state: TopologyState, span: StrandSpan): Array<{ own: Interval; with: StrandSpan }> {
  const found: Array<{ own: Interval; with: StrandSpan }> = [];
  for (const pairing of Object.values(state.pairings).flat()) {
    for (const end of [0, 1] as const) {
      if (strandKey(pairing.ends[end]) !== strandKey(span)) continue;
      const covered = offsets(pairing, end, span);
      if (!covered) continue;
      const part = slice(pairing, ...covered);
      found.push({ own: { from: part.ends[end].from, to: part.ends[end].to }, with: part.ends[1 - end]! });
    }
  }
  return found.sort((a, b) => a.own.from - b.own.from);
}

/**
 * The partner of every nucleotide of a strand span, as consecutive segments. This is the one place
 * that says what "paired" means; forms, guards, templates and renderers read it.
 */
export function partnerOf(state: TopologyState, definition: Definition, span: StrandSpan): PartnerSegment[] {
  const acid = instanceDefinition(definition, span.acid);
  const duplex = acid !== undefined && nucleicForm(acid) === 'duplex';
  if (!duplex && span.strand === 'bottom') return [{ from: span.from, to: span.to, partner: 'absent' }];
  const nucleic = readNucleicState(state.actors[span.acid] ?? {});
  const missing = strandIntervals(nucleic.missing, span.strand);
  const partnerMissing = strandIntervals(nucleic.missing, otherStrand(span.strand));
  const trans = transPartners(state, span);
  const cuts = new Set([span.from, span.to]);
  for (const item of [...missing, ...partnerMissing, ...nucleic.open, ...nucleic.excised, ...trans.map(entry => entry.own)]) {
    for (const edge of [item.from, item.to]) if (edge > span.from && edge < span.to) cuts.add(edge);
  }
  const edges = [...cuts].sort((a, b) => a - b);
  const out: PartnerSegment[] = [];
  for (let index = 0; index + 1 < edges.length; index += 1) {
    const piece = { from: edges[index]!, to: edges[index + 1]! };
    const pairing = trans.find(entry => overlapsInterval([entry.own], piece));
    let segment: PartnerSegment;
    if (overlapsInterval(nucleic.excised, piece)) segment = { ...piece, partner: 'excised' };
    else if (overlapsInterval(missing, piece)) segment = { ...piece, partner: 'absent' };
    else if (pairing) {
      const reversed = pairing.with.strand === span.strand;
      const [i0, i1] = [piece.from - pairing.own.from, piece.to - pairing.own.from];
      segment = { ...piece, partner: 'trans', with: { ...pairing.with, ...(reversed ? { from: pairing.with.to - i1, to: pairing.with.to - i0 } : { from: pairing.with.from + i0, to: pairing.with.from + i1 }) } };
    } else if (duplex && !overlapsInterval(partnerMissing, piece) && !overlapsInterval(nucleic.open, piece)) segment = { ...piece, partner: 'cis' };
    else segment = { ...piece, partner: 'unpaired' };
    const last = out.at(-1);
    // Stretches with the same partner read as one; a trans stretch only while its partner span continues too.
    if (last && last.partner === 'trans' && segment.partner === 'trans') {
      const [before, next] = [last.with, segment.with];
      const mirror = next.strand === span.strand;
      if (before.acid === next.acid && before.strand === next.strand && (mirror ? next.to === before.from : next.from === before.to)) {
        last.to = segment.to;
        last.with = mirror ? { ...before, from: next.from } : { ...before, to: next.to };
      } else out.push(segment);
    } else if (last && last.partner === segment.partner) last.to = segment.to;
    else out.push(segment);
  }
  return out;
}

/**
 * The topology rule (RFC 0006 §3.3): a nucleotide has at most one partner, so a pairing may only cover
 * nucleotides that are present and unpaired. Returns why `span` cannot take a new partner, if it cannot.
 * It is the only place that encodes the rule, as `occupancyConflicts` is for occupancy.
 */
export function pairingConflicts(state: TopologyState, definition: Definition, span: StrandSpan): string | undefined {
  for (const segment of partnerOf(state, definition, span)) {
    const where = rangeLabel({ ...span, from: segment.from, to: segment.to });
    if (segment.partner === 'excised') return `${where} was excised`;
    if (segment.partner === 'absent') return `${where} is not present`;
    if (segment.partner === 'cis') return `${where} is paired with its own ${otherStrand(span.strand)} strand; unwind it first`;
    if (segment.partner === 'trans') return `${where} is already paired with ${rangeLabel(segment.with)}`;
  }
  return undefined;
}

/**
 * Every stored pairing that no longer satisfies the rule on `acid`: one end lost nucleotides, or is
 * now also paired in cis. Strand-changing actions run this afterwards and fail instead of breaking a pairing.
 */
export function brokenPairings(state: TopologyState, definition: Definition, acid: string): string | undefined {
  for (const pairing of Object.values(state.pairings).flat()) {
    for (const end of pairing.ends) {
      if (end.acid !== acid) continue;
      // Read the strand as if it had no pairing: it must be present and free of its own partner.
      for (const segment of partnerOf({ actors: state.actors, pairings: {} }, definition, end)) {
        if (segment.partner === 'unpaired') continue;
        const [own, other] = end === pairing.ends[0] ? pairing.ends : [pairing.ends[1], pairing.ends[0]];
        return `${rangeLabel(own)} is paired with ${rangeLabel(other)}; unpair it first`;
      }
    }
  }
  return undefined;
}

/** Add a pairing between two strand spans of equal length. The caller has checked the rule. */
export function addPairing(state: Pick<MechanismState, 'pairings'>, a: StrandSpan, b: StrandSpan): void {
  const key = pairingKey(a, b);
  state.pairings[key] = normalizePairings([...state.pairings[key] ?? [], { ends: canonicalEnds(a, b) }]);
}

/** Remove whatever is paired with `span`; returns how many nucleotides were unpaired. */
export function removePairings(state: Pick<MechanismState, 'pairings'>, span: StrandSpan): number {
  let removed = 0;
  for (const [key, list] of Object.entries(state.pairings)) {
    const rest: Pairing[] = [];
    for (const pairing of list) {
      // A strand paired with itself can meet the span through either end; cut one overlap at a time.
      let pieces = [pairing];
      for (const end of [0, 1] as const) {
        pieces = pieces.flatMap(piece => {
          if (strandKey(piece.ends[end]) !== strandKey(span)) return [piece];
          const covered = offsets(piece, end, span);
          if (!covered) return [piece];
          removed += covered[1] - covered[0];
          return [slice(piece, 0, covered[0]), slice(piece, covered[1], length(piece.ends[0]))];
        });
      }
      rest.push(...pieces);
    }
    const next = normalizePairings(rest);
    if (next.length) state.pairings[key] = next; else delete state.pairings[key];
  }
  return removed;
}

/** Remove every pairing that involves a molecule (it was degraded). */
export function releasePairings(state: Pick<MechanismState, 'pairings'>, acid: string): void {
  for (const [key, list] of Object.entries(state.pairings)) {
    const next = list.filter(pairing => pairing.ends.every(end => end.acid !== acid));
    if (next.length) state.pairings[key] = next; else delete state.pairings[key];
  }
}

// ---- Alignments (RFC 0006 §4): declared correspondence between ranges. Never state, never a biological claim. ----

/**
 * The strand span that an alignment puts opposite `span`, or `undefined` when the alignment does not
 * cover it. `same` orientation pairs a strand with the other molecule's opposite strand, position for
 * position; `opposite` pairs strands of the same name, mirrored.
 */
export function alignedSpan(alignment: AlignmentDefinition, span: StrandSpan, partnerAcid: string): StrandSpan | undefined {
  const sides = [[alignment.a, alignment.b], [alignment.b, alignment.a]] as const;
  for (const [own, other] of sides) {
    if (own.acid !== span.acid || other.acid !== partnerAcid) continue;
    if (span.from < own.span[0] || span.to > own.span[1]) continue;
    const [from, to] = [span.from - own.span[0], span.to - own.span[0]];
    return alignment.orientation === 'opposite'
      ? { acid: other.acid, strand: span.strand, from: other.span[1] - to, to: other.span[1] - from }
      : { acid: other.acid, strand: otherStrand(span.strand), from: other.span[0] + from, to: other.span[0] + to };
  }
  return undefined;
}

/** True when the alignment relates these two molecules, in either order. */
export const alignmentRelates = (alignment: AlignmentDefinition, a: string, b: string) =>
  (alignment.a.acid === a && alignment.b.acid === b) || (alignment.a.acid === b && alignment.b.acid === a);
