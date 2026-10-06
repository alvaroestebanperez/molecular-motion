import type { StrandId } from '@molecular-motion/core';
import { coordinateMap, type ExcisedStretch } from './coordinate-map';
import { helixPhase, markAway, markJoined, type SceneJoin, type SceneNucleicAcid, type SceneRange, type SceneStrandRange, type SceneStrandSpan, type SvgScene } from './scene';

/**
 * Animation of nucleic geometry between steps (ADR 0001). Everything here reads two geometries and a
 * number: no action, no timeline, no step. Whatever produced a change, the same change animates the same way.
 */

/** A stretch paired across molecules: its span, and how far it has travelled from its own line (0) to its partner (1). */
export interface FramePairingSegment { traveller: SceneStrandSpan; host: SceneStrandSpan; travel: number }
export interface FramePairing { key: string; segments: FramePairingSegment[] }

/**
 * Everything the nucleic layers are drawn from at one instant. A settled step is one (`geometryFrame`),
 * and so is any instant of a transition, which makes it a valid origin for the next one. Ephemeral:
 * never stored, never part of the schema, the state or `SvgScene`. Boundaries may be fractional.
 */
export interface GeometryFrame {
  width: number; nucleicAcids: SceneNucleicAcid[]; pairings: FramePairing[];
  /** Joins between molecules, each with how far it has faded in (ADR 0004 §6); absent when there are none. */
  joins?: SceneJoin[];
}

/** A settled step seen as a frame. */
export const geometryFrame = (scene: Pick<SvgScene, 'width' | 'nucleicAcids' | 'pairings' | 'joins'>): GeometryFrame => ({
  width: scene.width,
  nucleicAcids: scene.nucleicAcids,
  pairings: scene.pairings.map(({ key, segments }) => ({ key, segments: segments.map(({ traveller, host }) => ({ traveller, host, travel: 1 })) })),
  ...(scene.joins?.length && { joins: scene.joins }),
});

interface Interval { from: number; to: number }
type StrandState = 'missing' | 'present' | 'nascent';
/** Where the destination state enters a changing stretch from. */
type Anchor = 'from' | 'to' | 'ends' | 'middle';

const NEAR = 1e-6;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const inside = (list: readonly Interval[], at: number) => list.some(item => item.from <= at && at < item.to);
const STRANDS: readonly StrandId[] = ['top', 'bottom'];

/** Sorted, non-empty, with touching intervals merged. */
function merged(list: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const item of list.filter(interval => interval.to - interval.from > NEAR).sort((a, b) => a.from - b.from)) {
    const last = out.at(-1);
    if (last && item.from <= last.to + NEAR) last.to = Math.max(last.to, item.to);
    else out.push({ from: item.from, to: item.to });
  }
  return out;
}

/** The part of a changing stretch `[a, b)` already in its destination state at `t`. */
function arrived(a: number, b: number, anchor: Anchor, t: number): Interval[] {
  const middle = (a + b) / 2;
  switch (anchor) {
    case 'from': return [{ from: a, to: lerp(a, b, t) }];
    case 'to': return [{ from: lerp(b, a, t), to: b }];
    case 'ends': return [{ from: a, to: lerp(a, middle, t) }, { from: lerp(b, middle, t), to: b }];
    case 'middle': return [{ from: lerp(middle, a, t), to: lerp(middle, b, t) }];
  }
}

/**
 * Tween one state along a line: `origin` and `destination` give the state at any coordinate. Stretches
 * where they differ change behind a front (ADR 0001 §4.1); `anchorOf` says where each front starts.
 * Returns, per state, where it holds at `t`.
 */
function tween<State extends string>(
  cuts: readonly number[], origin: (at: number) => State, destination: (at: number) => State,
  anchorOf: (a: number, b: number, before: State, after: State) => Anchor, t: number,
): Map<State, Interval[]> {
  const edges = [...new Set(cuts)].sort((a, b) => a - b);
  // Maximal stretches with one origin state and one destination state.
  const stretches: Array<Interval & { before: State; after: State }> = [];
  for (let index = 0; index + 1 < edges.length; index += 1) {
    const [from, to] = [edges[index]!, edges[index + 1]!];
    if (to - from <= NEAR) continue;
    const [before, after] = [origin((from + to) / 2), destination((from + to) / 2)];
    const last = stretches.at(-1);
    if (last && last.before === before && last.after === after && Math.abs(last.to - from) <= NEAR) last.to = to;
    else stretches.push({ from, to, before, after });
  }
  const out = new Map<State, Interval[]>();
  const add = (state: State, interval: Interval) => out.set(state, [...out.get(state) ?? [], interval]);
  for (const { from, to, before, after } of stretches) {
    if (before === after) { add(before, { from, to }); continue; }
    const done = merged(arrived(from, to, anchorOf(from, to, before, after), t));
    for (const interval of done) add(after, interval);
    let cursor = from;
    for (const interval of done) { add(before, { from: cursor, to: interval.from }); cursor = interval.to; }
    add(before, { from: cursor, to });
  }
  for (const [state, list] of out) out.set(state, merged(list));
  return out;
}

const strandRanges = (list: readonly SceneStrandRange[] | undefined, strand: StrandId): Interval[] => (list ?? []).filter(range => range.strand === strand);
const stateAt = (acid: SceneNucleicAcid, strand: StrandId) => (at: number): StrandState =>
  inside(strandRanges(acid.missing, strand), at) ? 'missing' : inside(strandRanges(acid.nascent, strand), at) ? 'nascent' : 'present';

/** Coordinates where a strand already ends because of a break at a site, in either frame. */
function breaks(acids: readonly SceneNucleicAcid[], strand: StrandId, width: number): number[] {
  return acids.flatMap(acid => acid.sites
    .filter(site => (site.lesion === 'double-strand-break' || site.lesion === 'single-strand-break' || site.lesion === 'nick') && (site.lesionStrands ?? ['top']).includes(strand))
    // On a molecule with an excision a position does not give a coordinate back: the site carries its own.
    .map(site => acid.excised && site.at ? (site.at.from + site.at.to) / 2 : site.x * (acid.length ?? 100) / width));
}

/** The share of its width an excised stretch takes; a settled one takes none. */
const shareIn = (list: readonly ExcisedStretch[] | undefined, at: number) => {
  const stretch = (list ?? []).find(item => item.from <= at && at < item.to);
  return stretch ? stretch.share ?? 0 : 1;
};

/**
 * The excised stretches of a frame between two (ADR 0002 §5): each keeps a share of its width that
 * moves from what it has in `before` to what it has in `after`. An interval excised in one and present
 * in the other therefore closes, or opens, continuously. Presentation geometry only: no state of the
 * core has a partly excised interval.
 */
function tweenExcised(before: SceneNucleicAcid, after: SceneNucleicAcid, t: number): ExcisedStretch[] {
  const edges = [...new Set([...before.excised ?? [], ...after.excised ?? []].flatMap(item => [item.from, item.to]))].sort((a, b) => a - b);
  const out: ExcisedStretch[] = [];
  for (let index = 0; index + 1 < edges.length; index += 1) {
    const [from, to] = [edges[index]!, edges[index + 1]!];
    const middle = (from + to) / 2;
    const [was, will] = [shareIn(before.excised, middle), shareIn(after.excised, middle)];
    if (was === 1 && will === 1) continue;
    const share = lerp(was, will, t);
    const last = out.at(-1);
    if (last && last.to === from && last.share === share) last.to = to;
    else out.push({ from, to, share });
  }
  return out;
}

function tweenAcid(before: SceneNucleicAcid, after: SceneNucleicAcid, width: number, t: number): SceneNucleicAcid {
  const length = after.length ?? 100;
  const scale = width / length;
  // With an excision in either frame, positions come from the map of this instant (ADR 0002 §5).
  const excised = before.excised || after.excised ? tweenExcised(before, after, t) : [];
  const map = excised.length ? coordinateMap(width, length, excised) : undefined;
  const span = ({ from, to }: Interval): SceneRange => map ? { from, to, x0: map.place(from), x1: map.place(to) } : { from, to, x0: from * scale, x1: to * scale };
  // A strand absent along the whole molecule is drawn absent past both ends, as the scene does, so a
  // molecule that ends inside the canvas stays relaxed up to its ends.
  const whole = (range: Interval): SceneRange => map && range.from <= NEAR && range.to >= length - NEAR ? { ...span(range), x0: -width, x1: 2 * width } : span(range);
  // A stretch that is closing or opening is still drawn, narrower, as it is in the frame that has it:
  // the other frame says nothing about nucleotides it does not have.
  const held = <State,>(was: (at: number) => State, will: (at: number) => State): [(at: number) => State, (at: number) => State] => map
    ? [at => shareIn(before.excised, at) === 0 ? will(at) : was(at), at => shareIn(after.excised, at) === 0 ? was(at) : will(at)]
    : [was, will];
  const missing: SceneStrandRange[] = [];
  const nascent: SceneStrandRange[] = [];
  for (const strand of STRANDS) {
    const lists = [before.missing, before.nascent, after.missing, after.nascent].flatMap(list => strandRanges(list, strand));
    const [was, will] = held(stateAt(before, strand), stateAt(after, strand));
    const ends = breaks([before, after], strand, width);
    const anchor = (a: number, b: number, from: StrandState, to: StrandState): Anchor => {
      // A chain grows 5′→3′ by extension of its 3′ end (ADR 0001 §4.2): a new tract appears from its 5′
      // boundary, which is its lower coordinate on `top` and its higher one on `bottom`. One that goes
      // away retracts the other way round, 3′ end first.
      if (to === 'nascent') return strand === 'top' ? 'from' : 'to';
      if (from === 'nascent') return strand === 'top' ? 'to' : 'from';
      // Otherwise a state spreads from where it already is. A strand already ends at a break and at the
      // molecule's ends: absence spreads from there, and presence does not spread across it.
      const broken = (edge: number) => edge <= NEAR || edge >= length - NEAR || ends.some(at => Math.abs(at - edge) <= NEAR);
      const already = (edge: number, outside: number) => to === 'missing'
        ? broken(edge) || (outside >= 0 && outside < length && was(outside) === to)
        : !broken(edge) && was(outside) === to;
      const [low, high] = [already(a, a - NEAR * 2), already(b, b + NEAR * 2)];
      return low && high ? 'ends' : low ? 'from' : high ? 'to' : 'middle';
    };
    const states = tween([0, length, ...excised.flatMap(range => [range.from, range.to]), ...lists.flatMap(range => [range.from, range.to])], was, will, anchor, t);
    for (const range of states.get('missing') ?? []) missing.push({ strand, ...whole(range) });
    for (const range of states.get('nascent') ?? []) nascent.push({ strand, ...span(range) });
  }
  const [wasOpen, willOpen] = held<string>((at: number) => (inside(before.open ?? [], at) ? 'open' : 'closed'), (at: number) => (inside(after.open ?? [], at) ? 'open' : 'closed'));
  const openAnchor = (a: number, b: number, _from: string, to: string): Anchor => {
    const already = (outside: number) => outside >= 0 && outside < length && wasOpen(outside) === to;
    const [low, high] = [already(a - NEAR * 2), already(b + NEAR * 2)];
    return low && high ? 'ends' : low ? 'from' : high ? 'to' : 'middle';
  };
  const open = tween([0, length, ...excised.flatMap(range => [range.from, range.to]), ...[...before.open ?? [], ...after.open ?? []].flatMap(range => [range.from, range.to])], wasOpen, willOpen, openAnchor, t).get('open') ?? [];
  const { missing: _missing, nascent: _nascent, open: _open, away: _away, excised: _excised, joined: _joined, ...rest } = after;
  // Sites follow the map of this instant. One that only the origin had lies on material that is going, and is not drawn.
  const sites = map ? after.sites.map(site => site.at ? { ...site, x: site.at.from === site.at.to ? map.place(site.at.from) : (map.place(site.at.from) + map.place(site.at.to)) / 2 } : site) : after.sites;
  return {
    ...rest,
    sites,
    ...(map && { phaseX: lerp(helixPhase(before, width), helixPhase(after, width), t) }),
    y: lerp(before.y, after.y, t),
    ...(excised.length && { excised: excised.map(stretch => ({ ...span(stretch), share: stretch.share })) }),
    ...(missing.length && { missing }),
    ...(nascent.length && { nascent }),
    ...(open.length && { open: open.map(span) }),
  };
}

/** The partner's span opposite `traveller`, following the correspondence of `reference` (direct or mirrored). */
function hostOf(reference: FramePairingSegment, traveller: SceneStrandSpan): SceneStrandSpan {
  const [from, to] = [traveller.from - reference.traveller.from, traveller.to - reference.traveller.from];
  return reference.traveller.strand === reference.host.strand
    ? { ...reference.host, from: reference.host.to - to, to: reference.host.to - from }
    : { ...reference.host, from: reference.host.from + from, to: reference.host.from + to };
}

function tweenPairings(before: readonly FramePairing[], after: readonly FramePairing[], t: number): FramePairing[] {
  const keys = [...new Set([...after.map(item => item.key), ...before.map(item => item.key)])];
  return keys.flatMap(key => {
    const [was, will] = [before.find(item => item.key === key)?.segments ?? [], after.find(item => item.key === key)?.segments ?? []];
    const used = new Set<FramePairingSegment>();
    const same = (a: SceneStrandSpan, b: SceneStrandSpan) => a.acid === b.acid && a.strand === b.strand && Math.min(a.to, b.to) - Math.max(a.from, b.from) > NEAR;
    const segments: FramePairingSegment[] = [];
    for (const target of will) {
      const origin = was.find(item => !used.has(item) && same(item.traveller, target.traveller));
      if (origin) {
        // The same stretch in both: its ends move from the shared part, and it keeps travelling from where it is.
        used.add(origin);
        const traveller = { ...target.traveller, from: lerp(origin.traveller.from, target.traveller.from, t), to: lerp(origin.traveller.to, target.traveller.to, t) };
        segments.push({ traveller, host: hostOf(target, traveller), travel: lerp(origin.travel, target.travel, t) });
      } else segments.push({ traveller: target.traveller, host: target.host, travel: lerp(0, target.travel, t) });
    }
    // A stretch that is going away returns to its own molecule's line.
    for (const origin of was) if (!used.has(origin)) segments.push({ traveller: origin.traveller, host: origin.host, travel: lerp(origin.travel, 0, t) });
    // A stretch that has not left its own line yet, or is back on it, is not a pairing on screen.
    const visible = segments.filter(segment => segment.travel > NEAR && segment.traveller.to - segment.traveller.from > NEAR);
    return visible.length ? [{ key, segments: visible }] : [];
  });
}

/**
 * The geometry at `t` between two frames (ADR 0001 §3.1). `t = 0` is `from` and `t = 1` is `to`, value
 * for value, so a transition can start from any frame, including one caught in mid-transition, without
 * a jump. In between, changing stretches move a front (§4.1–4.2) and pairings travel (§4.3).
 */
export function interpolateGeometry(from: GeometryFrame, to: GeometryFrame, t: number): GeometryFrame {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const nucleicAcids = to.nucleicAcids.map(after => {
    const before = from.nucleicAcids.find(acid => acid.id === after.id);
    return before ? tweenAcid(before, after, to.width, t) : { ...after };
  });
  const pairings = tweenPairings(from.pairings, to.pairings, t);
  // A join appears and disappears by cross-fade (ADR 0004 §6): one number per directed join, and nothing moves.
  // A transition shows a change of covalent connectivity; it does not imply a path by which it happened.
  const shareOf = (join: SceneJoin | undefined) => join ? join.share ?? 1 : 0;
  const keys = [...new Set([...to.joins ?? [], ...from.joins ?? []].map(join => join.key))];
  const joins = keys.flatMap((key): SceneJoin[] => {
    const [was, will] = [from.joins?.find(join => join.key === key), to.joins?.find(join => join.key === key)];
    const share = lerp(shareOf(was), shareOf(will), t);
    const { share: _share, ...join } = (will ?? was)!;
    return share > NEAR ? [{ ...join, ...(share < 1 - NEAR && { share }) }] : [];
  });
  if (joins.length) markJoined(nucleicAcids, joins, to.width);
  markAway(nucleicAcids, pairings.flatMap(pairing => pairing.segments.map(segment => segment.traveller)), to.width);
  return { width: to.width, nucleicAcids, pairings, ...(joins.length && { joins }) };
}
