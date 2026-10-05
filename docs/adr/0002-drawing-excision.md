# ADR 0002 — Drawing an excised interval

- **Status:** accepted and implemented. Decisions in §7; implementation notes in §9.
- **Scope:** renderer and viewer only. No schema change, no core state change.
- **Out of scope:** pairings and partner loops across a junction, and movement between compartments (the export of an mRNA). Neither is designed here.
- **Context:** [RFC 0007](../rfcs/0007-initial-extent-and-excision.md) §13 (step 4), [ADR 0001](0001-nucleic-geometry-animation.md) (animation of nucleic geometry)

## 1. Problem

Since RFC 0007 a molecule can carry `excised` intervals: nucleotides that no longer exist, whose flanks are covalent neighbours. The renderer ignores that state. In `examples/gene-expression.yaml`:

- after `excise-interval` the intron is still drawn, at full length. It only changes colour, because it lost its nascent mark;
- the ribosome that covers `[8, 12)` and `[24, 28)` is drawn centred on its stored span `[8, 28)`, so it sits on the intron, not on the junction;
- a site inside the intron keeps its place on the strand.

The state is right and the picture contradicts it. RFC 0007 left the drawing open on purpose: "a molecule with `excised` state has no agreed drawing".

## 2. What makes this more than a new mark

Every horizontal position on a nucleic acid comes from one rule, `x = width · coordinate / length`. The scene applies it to strand ranges, sites, occupants, footprints and pairings, and `GeometryFrame` applies it again when it interpolates.

The core separated two things the renderer still treats as one: **coordinate order** and **covalent adjacency** (RFC 0007 §4.2). Coordinates 11 and 24 are neighbours on the molecule and 12 nucleotides apart in the rule above. Any drawing that shows the exons joined has to stop mapping coordinates linearly.

## 3. Constraints

1. **A molecule without `excised` is drawn exactly as today.** The v2–v6 render baselines stay byte-identical.
2. **The scene of a step stays a pure function of its snapshot** (ADR 0001 §2.1).
3. **The animation is derived from two geometries only** (ADR 0001 §2.2). The animator never learns that the change came from `excise-interval`; a molecule that begins spliced and one that was spliced one step ago look the same.
4. **Nothing is drawn on a nucleotide that does not exist**: no strand, no site, no lesion, no occupant (RFC 0007 I5, I10).
5. **A base coordinate still names the same nucleotide** (RFC 0007 I11). A site at `b` is drawn on nucleotide `b`, wherever that now is on screen.
6. The excised nucleotides as a product (the lariat, the excised circle of V(D)J) stay out of scope, as in RFC 0007 D12.

## 4. Design: a display map per molecule

Each drawn molecule gets one function from coordinate to position, replacing the linear rule:

```text
coordinate   0 ………… 12 | 12 ………… 24 | 24 ………… 36
display      ██████████ ┆ (no width) ┆ ██████████
                        ▲
                     junction
```

- An extant stretch keeps its width per nucleotide. An excised interval has **no width**: both its ends map to the same point, the junction.
- Everything that places something along a molecule goes through the map: strand ranges, sites, occupants and footprints. No caller computes `width · coordinate / length` itself any more.
- With no `excised` the map is the linear rule, value for value. That is what keeps constraint 1.
- The map is built from the normalised `excised` list as it is: any number of intervals, sorted, disjoint and merged (RFC 0007 I2). Each collapses to its own junction, and nothing in the map is special to one interval.
- Only the forward direction is designed, coordinate to position. No current consumer needs to go from a position back to a coordinate, so no inverse is specified.

Consequences that then need no rule of their own:

- **The exons are drawn joined.** The strand is continuous across the junction.
- **An occupant sits on what it covers.** Its position is the middle of its extant coverage in display space, so the ribosome of the example lands on the junction.
- **Geometry bound only to excised material is not drawn**: a site wholly excised, with its lesion, label and callout, and anything else whose every nucleotide left. A site or span that keeps extant material is projected through the same map: a site at `a` or `b` is drawn at the junction, and a span site that straddles is drawn over its extant nucleotides.
- **A duplex loses both strands over the interval** (V(D)J): the same map serves both.

### 4.1 Renderer invariant

> **The coordinate-to-render map is monotonic over extant material in covalent order. Excision may collapse coordinate distance but must never reverse extant material or introduce a visual gap at a covalent junction.**

So two extant nucleotides are never drawn in the opposite order to their covalent order, and the two nucleotides either side of a junction are drawn as adjacent as any other two neighbours. This holds in every settled step. In a frame of a transition (§5) the interval that is closing is still drawn between its flanks, narrower, so the strand has no gap there either.

### 4.2 Scale and anchoring

Removing 12 of 36 nucleotides leaves less to draw. Two things must be chosen.

**Scale.** Keep the width of a nucleotide as it was (`width / length`). The molecule becomes visibly shorter, which is what happened to it. Stretching the remainder back to the full canvas would make every exon grow and every footprint widen at the moment of splicing, a change with no biological meaning.

Where the shorter molecule sits is layout, a presentation policy. It is not part of what `excised` means, and another layout may place the molecule differently without changing anything in this ADR but this paragraph.

**Anchor.** By default, keep the centre of the molecule where it was: both flanks move inwards by half the excised width. Anchoring one end would make the other flank travel the whole distance, and choosing which end is arbitrary. With several excised intervals the same rule applies to the total.

A molecule that is shorter than the canvas ends inside it. For RNA that is already how a free transcript reads. A DNA drawn across the whole canvas today will, after an excision, stop short of both edges, and so looks like a fragment with two ends. That is the weak point of this proposal: keeping the edges would mean drawing nucleotides beyond `[0, length)`, which the molecule does not have, or changing the scale (D2). D3 lists it as an alternative.

### 4.3 The junction mark

A joined strand with no mark is indistinguishable from one that was never spliced, and coordinates either side of it jump. So the junction gets a mark:

- **minimal**: a short tick across the strand in the muted ink used for polarity labels, with no callout and no label;
- **derived**: it is drawn from `excised` alone. It is not state, not a site, and nothing in the scene can be bound to it;
- **unlike anything else**: it must not read as a lesion, a break, a modification or an actor. It uses none of their colours, glyphs or halos;
- **absent in thumbnails**.

A break lesion on a site at the junction (`cleave` at `a` or `b`) is drawn as any break is, at that point, and replaces the tick.

## 5. Animation

Under ADR 0001 a transition interpolates the numbers the geometry is drawn from. The display map is one more of those numbers.

The transition interpolates presentation geometry between two snapshots, A and B, and nothing else. There is no core state in which an interval is partly excised: the share below exists only in a frame, as every other fractional boundary of ADR 0001 does.

- `GeometryFrame` gains, per molecule, its excised intervals with a **share** between 1 (drawn at full width) and 0 (no width).
- A molecule with the interval present is the frame with share 1; with it excised, share 0. Interpolating the share closes the molecule continuously: the flanks slide together while the interval between them shrinks and fades.
- Occupants and sites follow, because their positions come from the same map. Actors keep their CSS transitions and arrive at the position the settled map gives them.
- `interpolateGeometry(F, G, 0) = F` and `(F, G, 1) = G` hold as before, so interruption and closure are unchanged.
- With `prefers-reduced-motion` there is no transition: the viewer goes straight to the settled final state.

The interval that shrinks is the molecule's own stretch disappearing. It is not the lariat leaving, which would be a product (constraint 6).

## 6. What changes, and where

| Piece | Change |
|---|---|
| `SceneNucleicAcid` | carries `excised` ranges, as it carries `missing`, `nascent` and `open` |
| scene | one display map per molecule; sites, occupants and footprints are placed through it; geometry bound only to excised material is dropped |
| `GeometryFrame`, `interpolateGeometry` | excised intervals with a share; the map is rebuilt per frame |
| render | strand paths through the map; the junction mark |
| baselines | v2–v6 unchanged; `gene-expression` gains a render baseline |
| docs | README note "the viewer does not yet draw an excised interval" is removed; the example's description loses the same caveat |

Not touched: the core, the schema, and `SvgScene` for molecules without `excised`.

## 7. Decisions

| # | Decision | Options | Proposal |
|---|---|---|---|
| **D1** | What an excised interval looks like | (a) the molecule closes: flanks drawn contiguous; (b) the gap stays at scale, with a bridge drawn between the flanks; (c) the interval stays, drawn faded or struck through | **(a)**. (b) and (c) draw material that does not exist and leave occupants on it |
| **D2** | Scale after closing | (a) width per nucleotide unchanged, the molecule gets shorter; (b) the remainder is stretched to the previous length | **(a)** |
| **D3** | Anchor (layout policy, not nucleic semantics) | (a) the centre of the molecule stays, and it ends inside the canvas; (b) the 5′ end stays; (c) a DNA that spans the canvas keeps reaching both edges, by drawing continuation beyond its declared length | **(a)** by default. (c) draws nucleotides the molecule does not have |
| **D4** | Junction mark | (a) a minimal, derived tick that reads as no lesion, break, modification or actor; none in thumbnails; (b) nothing; (c) a labelled callout | **(a)** |
| **D5** | Animation of the closure | (a) the interval shrinks and fades while the flanks slide together; (b) the interval fades, then the flanks jump; (c) no animation | **(a)**, through a share in `GeometryFrame`: presentation geometry only, never an intermediate core state |
| **D6** | Geometry bound only to excised material (sites, lesions, labels, callouts) | (a) not drawn; (b) drawn greyed at the junction | **(a)**, as the core already cleared their state. What keeps extant material is projected through the map |

## 8. Open questions

1. **A bubble across a junction** is stored as one interval per flank. With the map they are drawn adjacent, which reads as one bubble; whether the junction mark is shown inside it is undecided.
2. **Should authors be able to keep the gap visible** (D1 b) for teaching figures that show where the intron was? That would be a presentation option, not state, and is not proposed.

## 9. Implementation notes

- **The map** is `packages/svg/src/coordinate-map.ts`. With no excised interval it returns the linear rule written as the renderer always wrote it, and every caller keeps its previous arithmetic on that path: a molecule without an excision is drawn digit for digit as before.
- **A site carries its coordinate interval** in the scene (`SceneSite.at`). Transition geometry needs the coordinate of a break, and on a molecule with an excision a position no longer gives it back. This is what makes an inverse map unnecessary.
- **A closing stretch is drawn as it was in the frame that has it**, narrower and with an opacity equal to its share, in a group of its own. Strand state inside it is not tweened: the other frame says nothing about nucleotides it does not have.
- **The helix phase** follows the first site, as before. In a frame whose sites are moving it is interpolated between the two steps, so the helix does not jump when the first site moves or leaves.
- **The junction mark** is styled inline. No stylesheet changes, so exported SVG of other documents is unchanged. In a frame it fades in as the stretch closes.
- **The molecule ends inside the canvas**: both strands stop at the ends of its drawn extent, base pairs are not drawn beyond them, and polarity labels sit at the new ends.
