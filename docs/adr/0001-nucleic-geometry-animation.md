# ADR 0001 — Animating nucleic-acid geometry between steps

- **Status:** proposed. The decisions in §8 are open and must be settled before implementation.
- **Scope:** renderer and viewer only. No schema change, no core state change, no change to `SvgScene` or to the static markup of a step.
- **Context:** [RFC 0004](../rfcs/0004-nucleic-acid-geometry.md) §7, [RFC 0006](../rfcs/0006-nucleic-acid-pairing.md) §10, and the v5 consolidation audit (#44, #45)

## 1. Problem

Between two steps, proteins glide for 0.8 s and strands jump. The molecule is one keyed group whose content is replaced, so:

- a resected gap, a filled gap, a new strand or a bubble appears at full size;
- a strand that pairs with another molecule is already inside the bubble while the proteins on it are still travelling;
- synthesis on a template shows the finished tract, never the growth;
- a pairing appears with no fade and no movement.

The audit found the settled state always correct. What is missing is the process. RFC 0004 deferred this because path `d` transitions are not reliable across browsers.

## 2. Constraints

1. **The scene of a step stays a pure function of its snapshot.** Animation is a function of two scenes, the one shown and the one wanted.
2. **The strategy is derived only from the geometry and state of the origin and the destination.** Neither `patchSvg` nor the transition renderer knows whether a change came from `extend`, `resect`, `pair`, `unpair`, `unwind`, `anneal` or any other action. They receive two scenes and nothing else: no timeline, no action type, no presentation verb, no step id.
3. **The settled DOM of a step is a clean render of that step** (the invariant of #44). Static markup does not change, so every render baseline stays byte-identical.
4. **Identity is stable.** Something that grows is the same element getting longer.
5. **One mechanism** for growth, retraction, appearance, disappearance and movement between a molecule's own axis and a pairing.
6. `prefers-reduced-motion` means no animation: the step is shown settled.

## 3. Strategy: interpolate the geometry's inputs, redraw the same elements

Strand geometry is already a pure function of numbers: per strand, which nucleotides are missing, nascent, unwound or drawn beside another molecule, and for a pairing, where the travelling strand runs (`helixY`, `pairingGeometry`). Two steps differ only in those numbers.

So the animation interpolates **the numbers**, never the paths:

```text
scene A ─┐
         ├─▶ frame(t) = interpolate(A, B, t) ──▶ same geometry functions ──▶ new `d` on the same elements
scene B ─┘                                        t = 0 … 1, eased, one per animation frame
```

- At `t = 0` the frame draws A. At `t = 1` it draws B, and the content is exactly the clean render of B.
- A frame is a transient value inside the animator. It is not an `SvgScene` and is never stored.
- The only inputs are the two `SvgScene` values. `SvgScene` carries no action information today, and that stays so: the snapshot's `timeline` never reaches the scene or the animator.
- Only the nucleic layers (`acids`, `pairings`) are redrawn per frame. Actors, labels and contacts keep their CSS transitions.

## 4. What is interpolated

### 4.1 Membership of nucleotides, with a moving front

Each of `missing`, `nascent`, `open` and "drawn beside another molecule" is, per strand, a **set of nucleotides**. Between A and B some nucleotides enter a set and some leave.

- Each changing nucleotide switches at its own moment, in order of distance from the part of the set that A and B share. That is a front moving through the changing stretch.
- A range that grows, shrinks, splits or merges needs no matching between "range 2 of A" and "range 1 of B". The nucleotides common to both never change, and the front does the rest.
- The front may stop between two nucleotides, so boundaries move continuously.

### 4.2 Where the front starts when nothing is shared

A range that is entirely new, or entirely gone, has no shared part. Its anchor is derived from state, in this order:

1. **An end that already exists in A or B:** a break site, a molecule end, or the edge of another range of the same strand that touches it. A gap opens from the break. A bubble extends from the bubble next to it.
2. **Polarity,** for nascent nucleotides: they are added at a 3′ end, so a new tract grows from its 5′ boundary. This is a property of the strand, not of an action.
3. **Otherwise the middle:** an isolated bubble opens from its centre.

Removal runs the same rule backwards.

Every rule above reads strand state and coordinates of A and B. None of them is a case for an action. "A gap opens from the break" is rule 1 applied to a missing range that touches a break site; the same rule applies whatever produced that range.

### 4.3 A strand between its own axis and a pairing

A travelling stretch has one extra number: how far it has moved from its own molecule's line (0) to its place beside the partner (1).

- **Pairing appears:** 0 → 1. Every point moves on a straight line from home to its place, all with the same easing.
- **Pairing disappears:** 1 → 0, towards where B draws that strand on its own molecule.
- **Pairing grows:** the shared stretch stays at 1 and the front (§4.1) adds nucleotides at its end. Base pairs are drawn where the strand has arrived.
- Because every point moves linearly with the actors' easing and duration, **an occupant riding the strand stays on it** through its ordinary CSS transition. No coupling code is needed.

## 5. Identity

| Level | Identity | Stable because |
|---|---|---|
| Molecule | `acid:<id>` | actor id |
| Pairing between two strands | `pairing:<strand pair>` | it is the key of `state.pairings` |
| Paths inside those groups (backbone front and back, base pairs, nascent front and back) | the existing child elements, matched by class | the static markup already has one element per role |
| A segment (a tract, a gap, a bubble) | its nucleotides | coordinates do not change between steps |

- **Per frame, the animator sets `d` on the existing child elements.** It does not replace them. A nascent tract or a pairing that grows is literally the same `<path>` with a longer `d`.
- **Segments get no DOM key of their own.** A key must be a pure function of one snapshot (constraint 3), and no such key survives every change: a tract's fixed end is stable while it grows, but a gap being filled loses the boundary that would name it. Coordinates are the identity that always holds.
- Children that exist in only one of A and B (a nascent path, a polarity label) are added at `t = 0` or removed at `t = 1`, with the existing enter and exit fades.

## 6. Where it lives

- **`@molecular-motion/svg`:** a pure function from two scenes and `t` to a frame, and the per-layer markup of a frame. Testable without a DOM.
- **`@molecular-motion/react`:** the stage owns the clock. `patchSvg` first applies B to everything except the nucleic layers, then the animator drives those layers to B.
- **Timing** has one source, the stylesheet's actor transition (as #45 reads it), so strands and proteins start and end together and reduced motion needs no extra case.
- **Interruption:** a new step starts from the frame on screen, not from A. Jumping several steps animates straight to the target.
- **Thumbnails and exports** are static and unaffected.

## 7. Testing

- **No knowledge of actions:**
  - the frame function's signature takes two scenes and `t`, nothing else;
  - two mechanisms that reach the same pair of states through different actions (for example a strand present after `extend` and after a different sequence that leaves the same ranges) produce identical frames at every `t`;
  - a static check that the animation modules of `svg` and `react` import no action, registry or timeline type from the core.
- **Pure:** `t = 0` equals A's geometry and `t = 1` equals B's; fronts are monotonic; a growing tract's drawn length never decreases; the shared part of a set never changes.
- **Invariant (#44):** unchanged. After the animation the DOM is a clean render of B, for every pair of steps.
- **Real browser (`npm run check:browser`):** sample mid-flight for the HR steps: the paired strand lies between its two positions, the nascent path is longer than at the start and shorter than at the end, and the `<path>` nodes are the same before and after.

## 8. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | Mechanism | (a) interpolate geometry inputs and redraw per frame; (b) emit compatible paths and transition `d` in CSS; (c) reveal with `stroke-dasharray` | **(a)**. (b) is not supported in Safari and needs every path to keep its point count. (c) only handles growth along a fixed curve, not a bubble opening or a strand changing molecule |
| **D2** | Unit of change | (a) nucleotide membership with a front (§4.1); (b) match ranges of A to ranges of B and tween their ends | **(a)**: no matching rule, and splits and merges need no special case |
| **D3** | Anchor of a new range | (a) derived: existing end, then polarity for nascent, then the middle (§4.2); (b) always the middle; (c) fade in at full size | **(a)**: a gap opens from the break and a tract grows 5′→3′ without knowing the action |
| **D4** | Strand changing molecule | (a) every point moves linearly, whole stretch at once (§4.3); (b) the stretch peels off progressively from its free end | **(a)**: occupants stay on the strand with their CSS transition, and it is one number. (b) looks more like invasion but needs occupants driven per frame |
| **D5** | DOM identity | (a) existing keyed groups, children patched in place, segments identified by coordinates (§5); (b) one keyed element per segment | **(a)**: (b) cannot be a pure function of one snapshot, and it would change static markup and every baseline |
| **D6** | Timing source | (a) the stylesheet's actor transition; (b) constants in the animator | **(a)** |
| **D7** | Interruption | (a) continue from the frame on screen; (b) finish or snap, then start | **(a)** |
| **D8** | Lesion markers and polarity labels during a frame | (a) drawn from the frame, so they follow the moving boundaries; (b) hidden until settled | **(a)**: they are part of the same geometry |
| **D9** | Where the per-frame cost goes | (a) redraw only molecules whose numbers differ between A and B; (b) redraw all | **(a)** |

## 9. Not in this ADR

- Rigid movement of a fragment towards another molecule (RFC 0006 §10).
- Making the engagement step readable, label collisions and canvas use: separate fixes from the audit.
- Covalent connectivity between molecules (a later RFC).
