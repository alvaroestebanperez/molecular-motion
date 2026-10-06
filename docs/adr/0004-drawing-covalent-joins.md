# ADR 0004 — Drawing covalent joins between molecules

- **Status:** accepted, ready for implementation. Decisions in §9. Nothing here is implemented yet.
- **Scope:** renderer and viewer only. No schema change, no core change.
- **Out of scope:** per-material strand colour; any identity, layout or naming of products; anything specific to crossovers, Holliday junctions or recombinases; occupancy across a join; layout polish for circular strands; unrelated renderer or layout fixes; package versions, changelog and tags.
- **Context:** [RFC 0008](../rfcs/0008-covalent-continuity.md) (joins, `covalentSuccessor`, `bondAt`), [RFC 0006](../rfcs/0006-nucleic-acid-pairing.md) §10 (strands drawn beside a partner), [ADR 0001](0001-nucleic-geometry-animation.md) (transition geometry), [ADR 0002](0002-drawing-excision.md) (coordinate map)

## 1. Problem

Since RFC 0008 a valid v7 document can contain joins: covalent bonds between strands of two molecules. The renderer ignores them. A probe on `main` rendered six kinds of state with and without their joins, and the markup was identical every time. Resolving a double Holliday junction as a crossover and as a non-crossover gives the same figure, although they are opposite outcomes.

That is why schema v7 is not published: a document can change its molecular topology and the figure cannot show it.

## 2. What the probe found

Two facts about the renderer as it is decide the design.

1. **Material identity is carried by position alone.** Every nucleic acid is drawn in the same colour. The row says which molecule a nucleotide belongs to, and the horizontal position says which coordinate.
2. **The renderer already draws a strand that leaves its row.** A strand paired with another molecule is drawn beside its partner, and eases back onto its own row through a ramp where it continues there (RFC 0006 §10). A ramp connects two consecutive nucleotides that are drawn in different places.

So position must keep meaning what it means, and the picture already has the kind of mark that says "this strand goes on over there".

## 3. Principle

> **Draw *where* by material identity; draw *what continues into what* by covalent continuity.**

A nucleotide is drawn in the row of the molecule it belongs to, at its coordinate, whatever strand it now lies on. What changes with a join is only which drawn end is connected to which.

Two invariants follow, and every rule of §5 keeps them:

> **A join may change where covalent continuity goes, but never where material identity is drawn.**

> **Every drawn strand stretch has at most one visual covalent continuation at each end.**

The second is what rules out drawing a link beside the continuation it replaces: an end is continued by its own row, or by a ramp, or by a link, or by nothing, and never by two of them. The cross-fade of §6 is the one moment two are on screen, at complementary opacity, and it ends with one.

The alternative is to lay out one row per physical product. It is rejected: it would replace authored identity with product identity in the one channel that carries identity, rows would jump when a join appears, and it needs products to have an identity, which RFC 0008 does not give them.

## 4. Constraints

1. **A document without joins is drawn exactly as today.** Every existing render baseline stays byte-identical.
2. The scene of a step is a pure function of its snapshot (ADR 0001). Everything here is derived from resolved state: `joins`, strand state and pairings. No action, timeline or step is read.
3. Nothing is specific to a mechanism. The renderer does not know what a crossover, a junction or a recombinase is, and does not compute or name products.
4. Material coordinates are stable. The coordinate map of ADR 0002 is not changed.
5. Authored identity is not replaced. No element is regrouped, recoloured or relabelled by product.
6. The settled DOM of a step is a clean render of that step, and a completed transition is structurally equivalent to it.
7. `prefers-reduced-motion` shows the final topology directly.

## 5. Design

### 5.1 Stretches and links

The strands of a scene are drawn as **stretches** and **links**.

A **stretch** is a run of nucleotides of one molecule and one strand, covalently consecutive within that molecule, with one placement: on its molecule's row, or beside a pairing partner. A strand is cut into stretches at:

- every boundary that is the `from` or the `to` of a join;
- the edges of a stretch drawn beside a partner, as today;
- the edges of missing nucleotides, as today.

An excised interval does not cut a stretch: its two boundaries are one point on the row (ADR 0002).

A **link** is drawn for each directed join `{ from: P, to: Q }`, from the drawn end of the stretch that ends at `P` to the drawn start of the stretch that begins at `Q`. Its ends are the source and destination nucleotides of RFC 0008 §4.1, so on `bottom` the stretch that ends at `P` is the one on the higher-coordinate side.

A reciprocal pair on two rows therefore comes out as two links that cross. That shape is a consequence of the two endpoints, not something the renderer aims for.

### 5.2 Where an end is drawn

The position of the end of a stretch at a boundary is resolved in this order:

1. **Coordinate to x**, through the coordinate map of the stretch's own molecule (ADR 0002). There is no map between molecules: each end uses its own.
2. **Row to y**, the centre line of that strand on its molecule's row, as the helix draws it there.
3. **Pairing displacement.** If the stretch is drawn beside a partner, the end is the point the pairing geometry gives for that coordinate, fully displaced.

Because each end uses its own molecule's map, a link need not be vertical. Next to an excised interval the two rows are shifted against each other, and the link is drawn between the two positions as they are.

### 5.3 Pairing ramps and links: one helper, two inputs

A pairing ramp and a link both connect strand material drawn at different positions, and may share the low-level helper that draws such a connection.

They remain **two distinct inputs of the renderer**:

| | Comes from | Says |
|---|---|---|
| Pairing displacement and its ramp | `pairings` | this stretch is base-paired with another molecule and is drawn beside it |
| Link | `joins` | this strand is covalently continued by that one |

Pairing is not expressed through joins, and joins are not expressed through pairing. A scene can have either without the other, and both carry their own keys.

They meet in one place. A displaced stretch that continues on its own molecule eases back to its own row; that is today's ramp and does not change. A displaced stretch whose covalent neighbour across a boundary is reached through a join is connected by the link to that neighbour's drawn end instead, and **its ramp to its own row is not drawn there**: the ramp would be a second continuation of the same end, towards a nucleotide it is no longer bonded to. The rule is the same in both cases: **a stretch is connected to its covalent neighbour, wherever that neighbour is drawn**. Without joins the neighbour is always on the stretch's own molecule, which is the present geometry exactly.

### 5.4 Suppressing the ordinary continuation

At a boundary that a join claims, on that strand only, the row's backbone is not drawn through. Each of the two stretches that meet there stops a short, fixed inset before the boundary, and the links take over from those points.

- Base pairs are omitted inside that inset and nowhere else. The nucleotides either side are still paired as the state says.
- The other strand of the row is untouched.

### 5.5 Shape and order

A link is a smooth curve between its two ends, drawn with the backbone's own stroke. It accepts any two endpoints: the ends of a link can be far apart along the molecule (§7, fixture F6).

Order, from back to front:

1. each molecule's own drawing, as today: back backbone, base pairs, front backbone, newly made stretches, junction marks, lesion glyphs, end labels;
2. strands drawn beside a partner, as today;
3. **links**;
4. actors, then callouts and labels, as today.

Links are above the displaced strands because they attach to them. They do not take part in the front and back of the helix.

### 5.6 Breaks

A break at a point site is a break of the bond that site names, `bondAt` (RFC 0008 §6.1). If that bond is a join's, the bond is not there to draw: **the link is not drawn, and each exposed covalent end is rendered at the position of the material that owns that end.**

So the two ends of a broken joined bond are in two rows: the 3′ end where the source nucleotide is drawn, the 5′ end where the destination nucleotide is drawn. Neither is moved towards the other, and nothing is drawn between them. The lesion glyph and its callout stay at the site's position, which does not move.

The other bond of a reciprocal pair is a different bond, named by the other molecule's site. It is drawn or not according to its own state.

### 5.7 End labels

A 5′ or 3′ label marks an end of a strand, and **which of the two it is comes from covalent polarity**: a nucleotide with no neighbour on its 3′ side is a 3′ end, one with none on its 5′ side is a 5′ end. It never comes from the row an end is in, from the direction it points on screen, or from the direction of a join.

- **No label at an intact join.** The strand continues.
- A label where a strand has no covalent neighbour: the ends of a molecule, the edges of missing nucleotides. As today.
- At a break on a molecule's own bond, as today: the two sides of a double-strand break are labelled, a nick or a single-strand break is not.
- **At a broken joined bond both exposed ends are labelled**, whatever the kind of break: 3′ on the source, 5′ on the destination, each where it is drawn (§5.6). The two ends are apart, so the label is what says that each is an end.
- A strand with no ends gets no end label.

This holds on both strands, and the two differ only in which nucleotide is the source:

| Site at 22 on `dna`, joined to `sister` | Broken bond | 3′ label | 5′ label |
|---|---|---|---|
| `top` | `dna.top[21] → sister.top[22]` | on `dna`'s row, at `dna.top[21]` | on `sister`'s row, at `sister.top[22]` |
| `bottom` | `sister.bottom[22] → dna.bottom[21]` | on `sister`'s row, at `sister.bottom[22]` | on `dna`'s row, at `dna.bottom[21]` |

On `top` the site's own molecule shows the 3′ end; on `bottom` it shows the 5′ end. Nothing but the definition of a join decides that.

### 5.8 Accessibility

Links are decorative geometry, hidden from assistive technology like the rest of the nucleic layers. The description of the scene states each join in words, once per directed join, from material identity:

> `Chromatid` top strand continues as `Sister` top strand at 22.

It names molecules and coordinates. It does not say "crossover", and it does not describe products.

### 5.9 No traversal

Every rule above is local to a boundary: is it claimed by a join, where are the two ends drawn, does the bond carry a break, does the nucleotide have a neighbour. The renderer does not walk a covalent strand, so a circular strand needs no special case and cannot fail to terminate.

If an implementation does walk a strand for some reason, it stops when it returns to the nucleotide it started from, as `covalentStrands` does.

### 5.10 Keys and the DOM

Each directed join has one keyed group, `join:` followed by its two boundaries, which is the state's own identity for it. It is stable for as long as the join exists.

Links live in a third nucleic layer, `joins`, above `acids` and `pairings`. It is a **composition layer of the renderer**, a place in the stacking order, and not a new semantic category: nothing in the language or the state corresponds to it, and a link has no meaning beyond the join it draws. The layer is emitted only when the scene has joins, as the pairing, region and membrane layers are only emitted when they have content.

### 5.11 Documents without joins

Everything above is conditional on the snapshot having joins. Without them:

- the scene carries no join data: no field on a molecule, no list on the scene, no `joins` layer;
- no backbone is inset, no base pair is omitted and no label is withheld;
- a displaced stretch is connected to its own row by today's ramp, computed as today;
- a frame of a transition between two such steps is what ADR 0001 and ADR 0002 produce.

The markup is the same byte for byte, so the v2 to v7 render baselines of documents that never reconnect do not change. The one v7 fixture that reconnects has no render baseline yet and gains one.

## 6. Transition

> **A transition communicates a change in covalent connectivity; it does not imply the physical trajectory by which reconnection occurred.**

The renderer does not know how the strands came to be reconnected, and the figure must not invent a path for it. So a join appears and disappears by **cross-fade**, not by moving strands.

- A frame carries, for each directed join, one number from 0 to 1.
- At that number the link is drawn at that opacity, and the ordinary continuation it replaces at the complement.
- Nothing is displaced: both are drawn where the settled steps draw them.

Guarantees:

- **`t = 0` is structurally equivalent to a clean render of A**, and **`t = 1` to a clean render of B**. As in ADR 0001, the interpolation returns the frame itself at both ends.
- **Interruption** starts from the frame on screen. A frame caught in mid-fade is a valid origin, with its numbers as they are.
- **Reduced motion** renders the final topology directly.

Whatever else changes in the same step, a break cleared or a strand refilled, animates by the rules it already has.

A geometric morph, in which the far end of each link slides from its own row to the other, was considered and is not adopted: at its midpoint two strands pass through each other, which is a trajectory nobody claimed.

## 7. Design fixtures

Six kinds of state from the probe. The double junction is split in two, because the ADR requires its two resolutions to look different. Coordinates are those of the RFC 0008 fixtures; "displaced" means drawn beside a pairing partner.

| | State | Covalent strands, 5′→3′ | What must be drawn |
|---|---|---|---|
| **F1** | `top` reconnected at 22, two intact duplexes | `dna.top 0…21 → sister.top 22…79`, and the reverse | two crossing links between the two `top` strands at 22; both `bottom` strands unchanged; no end label at 22 |
| **F2** | `bottom` reconnected at 58, two intact duplexes | `dna.bottom 79…58 → sister.bottom 57…0`, and the reverse | two crossing links between the two `bottom` strands at 58; both `top` strands unchanged |
| **F3** | `top` at 22 and at 58, two intact duplexes | `dna.top 0…21 → sister.top 22…57 → dna.top 58…79`, and the reverse | links at both places, on `top` only; the stretch between them stays in its own row |
| **F4a** | double junction, **same strand** at both: `top` at 22 and at 58 | as F3 | at 22 and at 58 the links are on `top`. Both ramps of the displaced `dna.bottom` are as today |
| **F4b** | double junction, **different strands**: `top` at 22, `bottom` at 58 | `dna.top 0…21 → sister.top 22…79`; `dna.bottom 79…58 → sister.bottom 57…0`; and the two reverses | at 22 the links are on `top`; at 58 they are on `bottom`. The displaced `dna.top` keeps its ramp at 58, and the displaced `dna.bottom` keeps its ramp at 22 |
| **F5** | `top` at 22, with `sister [40, 50)` excised | `dna.top 0…21 → sister.top 22…39 → sister.top 50…79` | the sister closed about its centre, with its junction mark; the links slanted, since 22 is at a different x on each row |
| **F6** | two reconnections that close a strand | two linear strands and one with no ends | links between distant positions; no end label on the circle; nothing else special |

In F4a and F4b the links attach to displaced stretches. At 22 on `top`, for both: the end of `dna.top` on its own row links to `sister.top` on the sister's row, and the end of `sister.top` links to the start of the displaced `dna.top`.

**F4a and F4b must render differently.** They differ at 58: in F4a the links are on the `top` strands and the displaced `dna.bottom` returns to its own row; in F4b the links are on the `bottom` strands and the displaced `dna.top` returns to its own row. The renderer reaches this from the joins alone, without knowing that one is a non-crossover and the other a crossover.

## 8. Acceptance for 0.3.0

Schema v7 can be published when all of these hold:

1. joins visibly alter the covalent topology drawn (F1–F6);
2. joined backbones and end labels are correct (§5.4, §5.7);
3. link endpoints respect strands drawn beside a partner (§5.2, §5.3; F4a, F4b);
4. a break at a joined bond is drawn on that bond: no link, and both exposed ends where their material is, labelled by covalent polarity, on `top` and on `bottom` (§5.6, §5.7);
5. joins are represented accessibly (§5.8);
6. connectivity transitions use the cross-fade (§6);
7. a clean final render equals a completed transition;
8. the same-strand and different-strand resolutions of the double junction render differently (F4a, F4b);
9. documents without joins keep their existing render baselines.

## 9. Decisions

| # | Decision | Options | Proposal |
|---|---|---|---|
| **D1** | Layout | (a) rows stay authored molecules; (b) one row per product | **(a)** |
| **D2** | What is drawn | (a) stretches and links, with a link replacing the ordinary continuation; pairing ramps and links may share a geometry helper and remain distinct inputs; (b) joins expressed as pairings, or pairings as joins; (c) a mark at the boundary with the strands left as they are | **(a)**. (b) confuses two facts of state. (c) leaves the wrong strand drawn through |
| **D3** | Link endpoints | (a) each from its own molecule's coordinate map, then pairing displacement; (b) a map between molecules | **(a)** |
| **D4** | Link shape | (a) a smooth curve between any two ends, with a fixed inset on each row; (b) straight segments; (c) a shape chosen per case | **(a)** |
| **D5** | Recoverable identity | (a) row and coordinate, unchanged; (b) recolour or regroup by product | **(a)**. Per-material colour is out of scope |
| **D6** | Base pairs and end labels | (a) base pairs omitted only inside a link's inset; no label at a join; (b) labels at joins | **(a)** |
| **D7** | A break at a joined bond | (a) found through `bondAt`: the link is not drawn, and each exposed end is drawn and labelled where its own material is; (b) the link drawn with a gap in it; (c) the row drawn cut | **(a)**. (b) puts an end where no material is |
| **D8** | Transition | (a) cross-fade between the continuation and the link; (b) a geometric morph; (c) none | **(a)**. A transition shows a change of connectivity and implies no trajectory |
| **D9** | Inputs | (a) resolved state only; (b) the timeline | **(a)** |
| **D10** | DOM | (a) one keyed group per directed join, in a `joins` layer emitted only when needed; (b) inside each molecule's group | **(a)**. A link belongs to two molecules |
| **D11** | Circular strands | (a) no special case: every rule is local; (b) detected and drawn differently | **(a)** |

## 10. Open questions

1. **Per-material colour.** With every strand one colour, a reader follows a reconnection through the links but cannot see at a glance which stretch came from which molecule. It is not needed for the figure to be true, and is left for later.
2. **Crowding.** A link between `bottom` strands of two rows crosses the lower row's `top` strand, and several joins close together overlap. No layout is proposed for it.
3. **A join without its reciprocal** is admitted by the state and never written in v7. The rules here are per directed join, so they may happen to draw one. **This ADR does not guarantee presentation quality for it**: it is not designed, not a fixture and not tested.
