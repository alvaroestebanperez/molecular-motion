import { actorInstances, instanceDefinition } from './instances';
import { intervalAt, normalizeIntervals } from './intervals';
import { excisedOf, isNucleicActor, nucleicForm, nucleicLength, strandIntervals } from './nucleic';
import { pairingKey, partnerOf } from './pairings';
import type { MechanismDefinition, MechanismState, StrandId, StrandJoin, StrandPoint, StrandSpan } from './types';

/**
 * Covalent continuity between molecules (RFC 0008 §4): directed joins, stored once in `state.joins`.
 * A join is only two boundaries. Everything else here is derived from three rules and no biology
 * (§4.2): ordinary adjacency, the junction of an excised interval (RFC 0007), and a stored join.
 * Nothing in this module knows a mechanism, a junction or an enzyme, and nothing reads a lesion:
 * whether a bond is intact is a separate fact, held by the site that names it (§6.1).
 */

type JoinState = Pick<MechanismState, 'actors' | 'joins'>;
type Definition = Pick<MechanismDefinition, 'actors'>;

/** One nucleotide by its material identity (RFC 0008 §3): molecule, strand and coordinate `[index, index + 1)`. It never changes. */
export interface Nucleotide { acid: string; strand: StrandId; index: number }

const samePoint = (a: StrandPoint, b: StrandPoint) => a.acid === b.acid && a.strand === b.strand && a.at === b.at;
const storedJoins = (state: Pick<MechanismState, 'joins'>): StrandJoin[] => Object.values(state.joins ?? {}).flat();

// ---- Polarity (§4.1): the one place that says which nucleotide lies on which side of a boundary ----

/** The nucleotide on the 5′ side of a boundary: what a bond that leaves it starts from. */
export const fivePrimeSide = ({ acid, strand, at }: StrandPoint): Nucleotide => ({ acid, strand, index: strand === 'top' ? at - 1 : at });
/** The nucleotide on the 3′ side of a boundary: what a bond that arrives at it ends on. */
export const threePrimeSide = ({ acid, strand, at }: StrandPoint): Nucleotide => ({ acid, strand, index: strand === 'top' ? at : at - 1 });
const boundaryAfter = ({ acid, strand, index }: Nucleotide): StrandPoint => ({ acid, strand, at: strand === 'top' ? index + 1 : index });
const boundaryBefore = ({ acid, strand, index }: Nucleotide): StrandPoint => ({ acid, strand, at: strand === 'top' ? index : index + 1 });

/** True when the nucleotide exists now: its molecule is present, has that strand, and it is neither missing nor excised. */
export function nucleotidePresent(state: Pick<MechanismState, 'actors'>, definition: Definition, { acid, strand, index }: Nucleotide): boolean {
  const molecule = instanceDefinition(definition, acid);
  const actor = state.actors[acid];
  if (!molecule || !isNucleicActor(molecule) || !actor?.present) return false;
  if (strand === 'bottom' && nucleicForm(molecule) !== 'duplex') return false;
  if (index < 0 || index >= nucleicLength(molecule)) return false;
  return !intervalAt(excisedOf(actor), index) && !intervalAt(strandIntervals(actor.nucleic?.missing ?? [], strand), index);
}

// ---- The three rules (§4.2), on boundaries: whether the nucleotides either side exist is asked separately ----

/**
 * Where the bond that leaves boundary `from` arrives. A stored join says so; otherwise it is the
 * boundary itself (ordinary adjacency is the join of a boundary with itself), carried across an
 * excised interval that begins there in the direction of the strand (RFC 0007: `a → b` on top,
 * `b → a` on bottom). Undefined when the 5′ end it would reach is bonded elsewhere by a join: a free
 * 3′ end, which v7 never produces (X5) but the shape of the state admits.
 */
export function bondFrom(state: JoinState, from: StrandPoint): StrandPoint | undefined {
  const joins = storedJoins(state);
  const join = joins.find(item => samePoint(item.from, from));
  if (join) return join.to;
  const excised = excisedOf(state.actors[from.acid]);
  const across = from.strand === 'top' ? excised.find(item => item.from === from.at)?.to : excised.find(item => item.to === from.at)?.from;
  const to = across === undefined ? from : { ...from, at: across };
  return joins.some(item => samePoint(item.to, to)) ? undefined : to;
}

/** The mirror image of `bondFrom`: where the bond that arrives at boundary `to` left from. */
export function bondInto(state: JoinState, to: StrandPoint): StrandPoint | undefined {
  const joins = storedJoins(state);
  const join = joins.find(item => samePoint(item.to, to));
  if (join) return join.from;
  const excised = excisedOf(state.actors[to.acid]);
  const across = to.strand === 'top' ? excised.find(item => item.to === to.at)?.from : excised.find(item => item.from === to.at)?.to;
  const from = across === undefined ? to : { ...to, at: across };
  return joins.some(item => samePoint(item.from, from)) ? undefined : from;
}

/**
 * The nucleotide a nucleotide is bonded to through its 3′ end (RFC 0008 §4.2), or `undefined` at a 3′
 * end. It reads `joins`, `excised`, `missing` and strand polarity, and nothing else: a break lesion
 * does not end a covalent strand here, because break state belongs to sites (§6.1).
 */
export function covalentSuccessor(state: JoinState, definition: Definition, nucleotide: Nucleotide): Nucleotide | undefined {
  if (!nucleotidePresent(state, definition, nucleotide)) return undefined;
  const to = bondFrom(state, boundaryAfter(nucleotide));
  const next = to && threePrimeSide(to);
  return next && nucleotidePresent(state, definition, next) ? next : undefined;
}

/** The nucleotide bonded to a nucleotide's 5′ end, or `undefined` at a 5′ end: the inverse of `covalentSuccessor`. */
export function covalentPredecessor(state: JoinState, definition: Definition, nucleotide: Nucleotide): Nucleotide | undefined {
  if (!nucleotidePresent(state, definition, nucleotide)) return undefined;
  const from = bondInto(state, boundaryBefore(nucleotide));
  const previous = from && fivePrimeSide(from);
  return previous && nucleotidePresent(state, definition, previous) ? previous : undefined;
}

/**
 * The bond a point site names (RFC 0008 §6.1): the one in which the nucleotide before its coordinate,
 * on its own molecule and strand, takes part. That nucleotide is the source of a bond on `top` and
 * the destination of one on `bottom`. At the junction of an excised interval both ends name the
 * junction's bond (RFC 0007 §6.1). Undefined when either nucleotide is not there.
 */
export function bondAt(state: JoinState, definition: Definition, point: StrandPoint): { from: Nucleotide; to: Nucleotide } | undefined {
  const lower = excisedOf(state.actors[point.acid]).find(item => item.to === point.at)?.from ?? point.at;
  const own: Nucleotide = { acid: point.acid, strand: point.strand, index: lower - 1 };
  const other = point.strand === 'top' ? covalentSuccessor(state, definition, own) : covalentPredecessor(state, definition, own);
  if (!other) return undefined;
  return point.strand === 'top' ? { from: own, to: other } : { from: other, to: own };
}

// ---- Derived from the successor (§4.2): covalent strands and products. Never stored, with no identity ----

/**
 * One covalent strand, written 5′→3′ as stretches. A stretch is a run of nucleotides of one strand of
 * one molecule that are also neighbours by coordinate, as an interbase interval; a `bottom` stretch is
 * read from its `to` down to its `from`. A new stretch begins at every join and at every junction of
 * an excised interval. `circular` marks a strand with no ends, which several joins between two
 * molecules can close; its first stretch is then an arbitrary but stable starting point.
 */
export interface CovalentStrand { stretches: StrandSpan[]; circular?: true }

/** Every present nucleotide, molecule by molecule in declaration order, each strand read 5′→3′. */
function presentNucleotides(state: JoinState, definition: Definition): Nucleotide[] {
  const out: Nucleotide[] = [];
  for (const { id, actor } of actorInstances(definition)) {
    if (!isNucleicActor(actor)) continue;
    const length = nucleicLength(actor);
    for (const strand of ['top', 'bottom'] as const) {
      for (let step = 0; step < length; step += 1) {
        const nucleotide = { acid: id, strand, index: strand === 'top' ? step : length - 1 - step };
        if (nucleotidePresent(state, definition, nucleotide)) out.push(nucleotide);
      }
    }
  }
  return out;
}

const nucleotideKey = ({ acid, strand, index }: Nucleotide) => `${acid}.${strand}.${index}`;

/**
 * The covalent strands of a state (RFC 0008 §4.2): maximal chains of successors. Linear strands come
 * first, ordered by their 5′ end (molecules in declaration order, `top` before `bottom`, each read
 * 5′→3′), then circular ones. A break lesion does not split a strand: see `covalentSuccessor`.
 */
export function covalentStrands(state: JoinState, definition: Definition): CovalentStrand[] {
  const nucleotides = presentNucleotides(state, definition);
  const seen = new Set<string>();
  const out: CovalentStrand[] = [];
  const walk = (start: Nucleotide, circular: boolean) => {
    const stretches: StrandSpan[] = [];
    for (let at: Nucleotide | undefined = start; at && !seen.has(nucleotideKey(at)); at = covalentSuccessor(state, definition, at)) {
      seen.add(nucleotideKey(at));
      const last = stretches.at(-1);
      const continues = last && last.acid === at.acid && last.strand === at.strand && (at.strand === 'top' ? last.to === at.index : last.from === at.index + 1);
      if (!continues) stretches.push({ acid: at.acid, strand: at.strand, from: at.index, to: at.index + 1 });
      else if (at.strand === 'top') last.to = at.index + 1;
      else last.from = at.index;
    }
    out.push({ stretches, ...(circular && { circular: true as const }) });
  };
  for (const nucleotide of nucleotides) if (!covalentPredecessor(state, definition, nucleotide)) walk(nucleotide, false);
  // What no 5′ end reaches has none: a circle.
  for (const nucleotide of nucleotides) if (!seen.has(nucleotideKey(nucleotide))) walk(nucleotide, true);
  return out;
}

/**
 * The products of a state (RFC 0008 §4.2, D9): the sets of nucleotides held together by covalent
 * bonds and base pairing, in cis or in trans. Each is a normalised list of strand spans; a product has
 * no identity, no name and no state, and after a crossover it is half of each of two authored
 * molecules (§3). Proteins are not part of it. Like the covalent strands it is derived from, it does
 * not read lesions: a nicked or broken molecule whose bond was not replaced still counts as joined
 * there. Ordered by each product's first span.
 */
export function productsOf(state: JoinState & Pick<MechanismState, 'pairings'>, definition: Definition): StrandSpan[][] {
  const nucleotides = presentNucleotides(state, definition);
  const parent = new Map(nucleotides.map(nucleotide => [nucleotideKey(nucleotide), nucleotideKey(nucleotide)]));
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    for (let at = key; at !== root;) { const next = parent.get(at)!; parent.set(at, root); at = next; }
    return root;
  };
  const union = (a: Nucleotide, b: Nucleotide) => {
    const [ka, kb] = [nucleotideKey(a), nucleotideKey(b)];
    if (parent.has(ka) && parent.has(kb)) parent.set(find(ka), find(kb));
  };
  for (const nucleotide of nucleotides) {
    const next = covalentSuccessor(state, definition, nucleotide);
    if (next) union(nucleotide, next);
  }
  for (const { id, actor } of actorInstances(definition)) {
    if (!isNucleicActor(actor) || !state.actors[id]?.present) continue;
    for (const strand of ['top', 'bottom'] as const) {
      for (const segment of partnerOf(state, definition, { acid: id, strand, from: 0, to: nucleicLength(actor) })) {
        if (segment.partner !== 'cis' && segment.partner !== 'trans') continue;
        for (let index = segment.from; index < segment.to; index += 1) {
          const own = { acid: id, strand, index };
          if (segment.partner === 'cis') union(own, { acid: id, strand: strand === 'top' ? 'bottom' : 'top', index });
          // Strands of different names run the same way along the coordinate; strands of the same name mirrored (RFC 0006 §3.2).
          else union(own, { acid: segment.with.acid, strand: segment.with.strand, index: segment.with.strand === strand ? segment.with.to - 1 - (index - segment.from) : segment.with.from + (index - segment.from) });
        }
      }
    }
  }
  const groups = new Map<string, Nucleotide[]>();
  for (const nucleotide of nucleotides) {
    const root = find(nucleotideKey(nucleotide));
    groups.set(root, [...groups.get(root) ?? [], nucleotide]);
  }
  // `nucleotides` is in declaration order, so the first member of each group orders the products.
  return [...groups.values()].map(members => {
    const spans: StrandSpan[] = [];
    const strands = new Map<string, Nucleotide[]>();
    for (const member of members) strands.set(`${member.acid}.${member.strand}`, [...strands.get(`${member.acid}.${member.strand}`) ?? [], member]);
    for (const list of strands.values()) {
      const { acid, strand } = list[0]!;
      for (const interval of normalizeIntervals(list.map(({ index }) => ({ from: index, to: index + 1 })))) spans.push({ acid, strand, ...interval });
    }
    return spans;
  });
}

// ---- Stored joins: queries and the one edit ----

/** The molecules a molecule is covalently joined to, directly: those that share a join with it. Sorted, and empty for an unjoined molecule. */
export function joinedTo(state: Pick<MechanismState, 'joins'>, acid: string): string[] {
  const out = new Set<string>();
  for (const { from, to } of storedJoins(state)) {
    if (from.acid === acid) out.add(to.acid);
    if (to.acid === acid) out.add(from.acid);
  }
  out.delete(acid);
  return [...out].sort();
}

/** Stored joins that leave from or arrive at a boundary (X3: at most one of each). */
export const joinsAt = (state: Pick<MechanismState, 'joins'>, point: StrandPoint): StrandJoin[] =>
  storedJoins(state).filter(item => samePoint(item.from, point) || samePoint(item.to, point));

/** Every boundary of a molecule that takes part in a join, with the molecule on the other side of it. */
export function joinedBoundaries(state: Pick<MechanismState, 'joins'>, acid: string): Array<StrandPoint & { with: string }> {
  const out: Array<StrandPoint & { with: string }> = [];
  for (const { from, to } of storedJoins(state)) {
    for (const [own, other] of [[from, to], [to, from]] as const) {
      if (own.acid === acid && !out.some(item => samePoint(item, own) && item.with === other.acid)) out.push({ ...own, with: other.acid });
    }
  }
  return out;
}

/**
 * The boundary on the other molecule that the bond named by a point site reaches (§6.1), when that
 * bond is a stored join: on `top` the site's nucleotide is the source, so it is where the join that
 * leaves the site arrives; on `bottom` it is the destination, so it is where the join that arrives left from.
 */
export function joinedAcross(state: Pick<MechanismState, 'joins'>, point: StrandPoint): StrandPoint | undefined {
  const joins = storedJoins(state);
  return point.strand === 'top' ? joins.find(item => samePoint(item.from, point))?.to : joins.find(item => samePoint(item.to, point))?.from;
}

/** Joins in their normal form (X4): sorted by the coordinate they leave from, then by molecule. */
export function normalizeJoins(list: readonly StrandJoin[]): StrandJoin[] {
  return list.map(item => structuredClone(item)).sort((a, b) =>
    a.from.at - b.from.at || (a.from.acid < b.from.acid ? -1 : a.from.acid > b.from.acid ? 1 : 0) || a.to.at - b.to.at);
}

/**
 * Reconnect two strands at two boundaries (§4.3): write the reciprocal pair `a → b`, `b → a`, or
 * remove it when it is already there, so the same call undoes itself (D5). The caller has checked
 * that nothing else is joined at either boundary. The record is dropped while empty (X9).
 */
export function toggleJoins(state: Pick<MechanismState, 'joins'>, a: StrandPoint, b: StrandPoint): 'joined' | 'undone' {
  const key = pairingKey(a, b);
  const list = state.joins?.[key] ?? [];
  const pair = (item: StrandJoin) => (samePoint(item.from, a) && samePoint(item.to, b)) || (samePoint(item.from, b) && samePoint(item.to, a));
  const undo = list.some(pair);
  const next = normalizeJoins(undo ? list.filter(item => !pair(item)) : [...list, { from: { ...a }, to: { ...b } }, { from: { ...b }, to: { ...a } }]);
  const joins = { ...state.joins };
  if (next.length) joins[key] = next; else delete joins[key];
  if (Object.keys(joins).length) state.joins = joins; else delete state.joins;
  return undo ? 'undone' : 'joined';
}
