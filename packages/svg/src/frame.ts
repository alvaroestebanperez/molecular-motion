import type { StrandId } from '@molecular-motion/core';
import { markAway, type SceneNucleicAcid, type SceneRange, type SceneStrandRange, type SceneStrandSpan, type SvgScene } from './scene';

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
export interface GeometryFrame { width: number; nucleicAcids: SceneNucleicAcid[]; pairings: FramePairing[] }

/** A settled step seen as a frame. */
export const geometryFrame = (scene: Pick<SvgScene, 'width' | 'nucleicAcids' | 'pairings'>): GeometryFrame => ({
  width: scene.width,
  nucleicAcids: scene.nucleicAcids,
  pairings: scene.pairings.map(({ key, segments }) => ({ key, segments: segments.map(({ traveller, host }) => ({ traveller, host, travel: 1 })) })),
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
    .map(site => site.x * (acid.length ?? 100) / width));
}

function tweenAcid(before: SceneNucleicAcid, after: SceneNucleicAcid, width: number, t: number): SceneNucleicAcid {
  const length = after.length ?? 100;
  const scale = width / length;
  const span = ({ from, to }: Interval): SceneRange => ({ from, to, x0: from * scale, x1: to * scale });
  const missing: SceneStrandRange[] = [];
  const nascent: SceneStrandRange[] = [];
  for (const strand of STRANDS) {
    const lists = [before.missing, before.nascent, after.missing, after.nascent].flatMap(list => strandRanges(list, strand));
    const [was, will] = [stateAt(before, strand), stateAt(after, strand)];
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
    const states = tween([0, length, ...lists.flatMap(range => [range.from, range.to])], was, will, anchor, t);
    for (const range of states.get('missing') ?? []) missing.push({ strand, ...span(range) });
    for (const range of states.get('nascent') ?? []) nascent.push({ strand, ...span(range) });
  }
  const [wasOpen, willOpen] = [(at: number) => (inside(before.open ?? [], at) ? 'open' : 'closed'), (at: number) => (inside(after.open ?? [], at) ? 'open' : 'closed')];
  const openAnchor = (a: number, b: number, _from: string, to: string): Anchor => {
    const already = (outside: number) => outside >= 0 && outside < length && wasOpen(outside) === to;
    const [low, high] = [already(a - NEAR * 2), already(b + NEAR * 2)];
    return low && high ? 'ends' : low ? 'from' : high ? 'to' : 'middle';
  };
  const open = tween([0, length, ...[...before.open ?? [], ...after.open ?? []].flatMap(range => [range.from, range.to])], wasOpen, willOpen, openAnchor, t).get('open') ?? [];
  const { missing: _missing, nascent: _nascent, open: _open, away: _away, ...rest } = after;
  return {
    ...rest,
    y: lerp(before.y, after.y, t),
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
  markAway(nucleicAcids, pairings.flatMap(pairing => pairing.segments.map(segment => segment.traveller)), to.width);
  return { width: to.width, nucleicAcids, pairings };
}
