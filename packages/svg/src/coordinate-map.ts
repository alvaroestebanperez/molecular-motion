/**
 * Coordinate-to-render mapping of one nucleic acid (ADR 0002 §4). Coordinates are never renumbered
 * (RFC 0007 I1), so after an excision coordinate order and covalent adjacency differ: this map is the
 * one place that turns a coordinate into a horizontal position, and it follows covalent order.
 *
 * - Extant material keeps a constant width per nucleotide, `width / length`.
 * - An excised interval has no width: both its ends are drawn at one point, the junction.
 * - The centre of the molecule stays where it was. That is layout policy, not part of what `excised` means.
 * - Without excised intervals it is the linear rule `width · coordinate / length`, value for value.
 *
 * Invariant: the map is monotonic over extant material in covalent order. Excision may collapse
 * coordinate distance but never reverses extant material nor leaves a visual gap at a covalent junction.
 *
 * Only this direction exists. Nothing maps a position back to a coordinate.
 */

interface Interval { from: number; to: number }

/**
 * An excised interval as it is drawn. `share` is the part of its former width it still takes: absent
 * or 0 in a settled step, between 0 and 1 only in a frame of a transition (ADR 0002 §5), where the
 * interval is still drawn, narrower. It is presentation geometry: the core has no partly excised state.
 */
export interface ExcisedStretch extends Interval { share?: number }

export interface CoordinateMap {
  /** Where the molecule is drawn, from its first nucleotide to its last. */
  readonly extent: { x0: number; x1: number };
  /** Position of every junction: an excised interval with no width left. */
  readonly junctions: readonly number[];
  /**
   * Position of an interbase coordinate. A coordinate strictly inside excised material has no
   * drawable position: `undefined`. Either end of an excised interval is its junction.
   */
  x(coordinate: number): number | undefined;
  /**
   * Drawn extent of a coordinate range, projected from its extant portions: a range that crosses a
   * junction is drawn as one stretch, without the excised nucleotides. `undefined` when nothing of it is drawn.
   */
  range(range: Interval): { x0: number; x1: number } | undefined;
  /** Middle of a range's drawn extent, where something that covers it is centred. */
  centre(range: Interval): number | undefined;
  /** Position of a coordinate for geometry that must be total: one inside excised material collapses onto its junction. */
  place(coordinate: number): number;
}

const shareOf = (stretch: ExcisedStretch) => Math.max(0, Math.min(1, stretch.share ?? 0));

/**
 * Build the map of a molecule `length` nucleotides long on a canvas `width` wide. `excised` is the
 * normalised list of the state (sorted, disjoint, merged), with any number of intervals.
 */
export function coordinateMap(width: number, length: number, excised: readonly ExcisedStretch[] = []): CoordinateMap {
  if (!excised.length) {
    // The linear rule, written as the renderer always wrote it, so molecules without an excision keep every digit.
    const place = (coordinate: number) => width * coordinate / length;
    return {
      extent: { x0: 0, x1: width },
      junctions: [],
      x: place,
      place,
      range: ({ from, to }) => to > from ? { x0: place(from), x1: place(to) } : undefined,
      centre: ({ from, to }) => width * ((from + to) / 2) / length,
    };
  }
  const scale = width / length;
  const stretches = [...excised].sort((a, b) => a.from - b.from);
  /** Nucleotides before `coordinate` that take no width. */
  const hidden = (coordinate: number) => stretches.reduce((sum, stretch) =>
    sum + (1 - shareOf(stretch)) * Math.max(0, Math.min(coordinate, stretch.to) - stretch.from), 0);
  // Both flanks move inwards by half of what was removed: the centre of the molecule stays.
  const offset = scale * hidden(length) / 2;
  const place = (coordinate: number) => offset + scale * (coordinate - hidden(coordinate));
  const collapsed = (coordinate: number) => stretches.some(stretch => shareOf(stretch) === 0 && stretch.from < coordinate && coordinate < stretch.to);
  const range = ({ from, to }: Interval) => {
    const [x0, x1] = [place(from), place(to)];
    return x1 > x0 ? { x0, x1 } : undefined;
  };
  return {
    extent: { x0: place(0), x1: place(length) },
    junctions: stretches.filter(stretch => shareOf(stretch) === 0).map(stretch => place(stretch.from)),
    x: coordinate => collapsed(coordinate) ? undefined : place(coordinate),
    place,
    range,
    centre: interval => { const drawn = range(interval); return drawn && (drawn.x0 + drawn.x1) / 2; },
  };
}

/** The map of a molecule as the scene describes it. */
export const coordinateMapOf = (acid: { length?: number; excised?: readonly ExcisedStretch[] }, width: number): CoordinateMap =>
  coordinateMap(width, acid.length ?? 100, acid.excised);
