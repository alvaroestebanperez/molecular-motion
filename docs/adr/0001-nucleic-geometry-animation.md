# ADR 0001 — Animating nucleic-acid geometry between steps

- **Status:** accepted. Decisions in §8.
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
- The only inputs are two geometries (§3.1), each derived from an `SvgScene`. `SvgScene` carries no action information today, and that stays so: the snapshot's `timeline` never reaches the scene or the animator.
- Only the nucleic layers (`acids`, `pairings`) are redrawn per frame. Actors, labels and contacts keep their CSS transitions.

### 3.1 `GeometryFrame`: what is on screen, and the origin of the next transition

A frame in the middle of a transition is not a step, so it is not an `SvgScene`. It has its own ephemeral type:

```ts
/** Everything the nucleic layers are drawn from, at one instant. Never stored, never part of schema, state or SvgScene. */
interface GeometryFrame {
  width: number;
  /** Per molecule: its line, and per strand which nucleotides are missing, nascent or unwound. Boundaries may be fractional. */
  nucleicAcids: FrameNucleicAcid[];
  /** Per stretch paired across molecules: its span, and how far it has travelled from its own line (0) to its partner (1). */
  pairings: FramePairing[];
}

geometryFrame(scene: SvgScene): GeometryFrame              // a settled step, seen as a frame
interpolateGeometry(from: GeometryFrame, to: GeometryFrame, t: number): GeometryFrame
```

- **Both ends of an interpolation are frames.** A settled step is the frame `geometryFrame(scene)`. A frame produced in mid-transition is as valid an origin as a settled one.
- **Interruption.** The viewer keeps the frame it last drew. A new step starts from that frame: `interpolateGeometry(shown, geometryFrame(next), t)`.
- **Exact continuity:** `interpolateGeometry(F, G, 0)` is `F`, value for value, for every frame `F`. The first frame of a new transition is therefore identical to the last frame that was visible.
- **Closure:** `interpolateGeometry(F, G, 1)` is `G`. When `G` is a settled step, what is drawn is its clean render.
- A frame lives in the animator only. Nothing in the schema, the core state or `SvgScene` refers to it.

## 4. What is interpolated

### 4.1 Per-nucleotide state, with a moving front

Along each strand every nucleotide is in one state: **missing**, **present**, or **present and nascent**. Along each molecule every position is **paired** or **unwound**. Between two frames, some stretches change state and the rest do not.

- A stretch that changes is a maximal interval with one origin state and one destination state. It needs no matching between "range 2 of A" and "range 1 of B": growth, shrinkage, splits and merges are all stretches of this kind.
- Inside a changing stretch a **front** moves from an anchor end to the other end. Behind the front the stretch is already in its destination state; ahead of it, still in its origin state.
- The front is a real number, so boundaries move continuously and may lie between two nucleotides.
- The stretches that do not change are drawn identically in every frame.

### 4.2 Where the front starts

The anchor is derived from the two frames, in this order.

1. **Nascent nucleotides follow strand polarity.** A chain grows 5′→3′ by extension of its 3′ end, so the nucleotide at the 5′ boundary of a new tract appears first and the one at its 3′ boundary last. In coordinates (RFC 0004: `top` runs 5′→3′ with increasing coordinate, `bottom` with decreasing coordinate):

   | Strand | A new nascent stretch `[from, to)` appears | Front starts at | Front moves towards |
   |---|---|---|---|
   | `top` | in increasing coordinate | `from` (its 5′ boundary) | `to` (its 3′ end) |
   | `bottom` | in decreasing coordinate | `to` (its 5′ boundary) | `from` (its 3′ end) |

   A nascent stretch that goes away retracts in the opposite order: its 3′ end first.

2. **Otherwise a state spreads from where it already is.** The front starts at the end of the stretch whose neighbour, in the origin frame, is already in the destination state. For "missing", a break site and a molecule end count as such a neighbour: the strand already ends there.
   - A gap opens from the break. A gap being closed without nascent nucleotides closes from the strand that is there.
   - A bubble grows from the bubble next to it.
3. **Both ends qualify:** two fronts start at the ends and meet in the middle (a bubble closing).
4. **Neither end qualifies:** two fronts start in the middle and move outwards (an isolated bubble opening).

Every rule reads strand state and coordinates of the two frames. None of them is a case for an action: the same rule applies whatever produced the change.

### 4.3 A strand between its own axis and a pairing

A travelling stretch has one extra number: how far it has moved from its own molecule's line (0) to its place beside the partner (1).

- **Pairing appears:** 0 → 1. Every point moves on a straight line from home to its place, all with the same easing.
- **Pairing disappears:** 1 → 0, towards where the destination draws that strand on its own molecule.
- **Pairing grows or shrinks:** the shared stretch keeps its value and a front (§4.1) moves its end, starting from the shared stretch. Base pairs are drawn where the strand has arrived.
- **From an interrupted frame** the number simply continues from its current value: a strand caught at 0.4 goes on to 1, or back to 0.
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
- **Interruption:** a new step starts from the `GeometryFrame` on screen (§3.1), not from A. Jumping several steps animates straight to the target.
- **Thumbnails and exports** are static and unaffected.

## 7. Testing

- **No knowledge of actions:**
  - the frame function's signature takes two scenes and `t`, nothing else;
  - two mechanisms that reach the same pair of states through different actions (for example a strand present after `extend` and after a different sequence that leaves the same ranges) produce identical frames at every `t`;
  - a static check that the animation modules of `svg` and `react` import no action, registry or timeline type from the core.
- **Pure:** `t = 0` equals A's geometry and `t = 1` equals B's; fronts are monotonic; a growing tract's drawn length never decreases; stretches that do not change are identical in every frame.
- **Polarity:** a new nascent tract on `top` grows from its lower coordinate, and on `bottom` from its higher coordinate.
- **Interruption at an intermediate `t`:** with `F = interpolateGeometry(A, B, 0.37)`, the frame `interpolateGeometry(F, C, 0)` equals `F` value for value and draws identical markup, so the last visible frame and the first frame of the new transition are the same. The transition then reaches `C` at `t = 1`.
- **Invariant (#44):** unchanged. After the animation the DOM is a clean render of B, for every pair of steps.
- **Real browser (`npm run check:browser`):** sample mid-flight for the HR steps: the paired strand lies between its two positions, the nascent path is longer than at the start and shorter than at the end, and the `<path>` nodes are the same before and after.

## 8. Decisions

All accepted as recommended.

| # | Decision | Options | Outcome |
|---|---|---|---|
| **D1** | Mechanism | (a) interpolate geometry inputs and redraw per frame; (b) emit compatible paths and transition `d` in CSS; (c) reveal with `stroke-dasharray` | **(a)**. (b) is not supported in Safari and needs every path to keep its point count. (c) only handles growth along a fixed curve, not a bubble opening or a strand changing molecule |
| **D2** | Unit of change | (a) per-nucleotide state with a front (§4.1); (b) match ranges of A to ranges of B and tween their ends | **(a)**: no matching rule, and splits and merges need no special case |
| **D3** | Where a front starts | (a) derived (§4.2): polarity for nascent (5′→3′, by extension of the 3′ end), otherwise from where the destination state already is, otherwise the middle; (b) always the middle; (c) fade in at full size | **(a)**. Polarity is part of nucleic geometry (RFC 0004), not knowledge of an action |
| **D4** | Strand changing molecule | (a) every point moves linearly, whole stretch at once (§4.3); (b) the stretch peels off progressively from its free end | **(a)**: occupants stay on the strand with their CSS transition, and it is one number. (b) looks more like invasion but needs occupants driven per frame |
| **D5** | DOM identity | (a) existing keyed groups, children patched in place, segments identified by coordinates (§5); (b) one keyed element per segment | **(a)**: (b) cannot be a pure function of one snapshot, and it would change static markup and every baseline |
| **D6** | Timing source | (a) the stylesheet's actor transition; (b) constants in the animator | **(a)** |
| **D7** | Interruption | (a) continue from the `GeometryFrame` on screen, with exact continuity (§3.1); (b) finish or snap, then start | **(a)** |
| **D8** | Lesion markers and polarity labels during a frame | (a) drawn from the frame, so they follow the moving boundaries; (b) hidden until settled | **(a)**: they are part of the same geometry |
| **D9** | Where the per-frame cost goes | (a) redraw only molecules whose numbers differ between A and B; (b) redraw all | **(a)** |

## 9. Not in this ADR

- Rigid movement of a fragment towards another molecule (RFC 0006 §10).
- Making the engagement step readable, label collisions and canvas use: separate fixes from the audit.
- Covalent connectivity between molecules (a later RFC).
