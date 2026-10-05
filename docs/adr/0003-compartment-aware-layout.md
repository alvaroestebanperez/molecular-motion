# ADR 0003 — Compartment-aware actor layout

- **Status:** accepted, ready for implementation. Decisions in §6. Nothing here is implemented yet.
- **Scope:** renderer and layout only. No schema change, no core change, no change to `translocate`.
- **Out of scope:** `parent` and nested compartments; any ordering of compartments richer than the fallback of §4.1; changes to core validation; pairing loops across an excision junction; templated synthesis across a junction (RFC 0007 §10).
- **Context:** [membrane scenes](../membrane-scenes.md) (bilayer, sides, regions, stacking), [ADR 0001](0001-nucleic-geometry-animation.md) (transition geometry), [ADR 0002](0002-drawing-excision.md) (coordinate map)

## 1. Problem

`examples/gene-expression.yaml` ends with `translocate pre-mrna → cytoplasm`. The state changes and the picture does not: the mRNA stays where it was, and the ribosome, declared in the cytoplasm, rests on it inside the area labelled nucleus.

The same document shows a second fault before any translocation: the gene, declared in the nucleus, is drawn **above** the nucleus region, and the pre-mRNA inside it. Neither position was chosen. Both fall out of declaration order.

## 2. Audit: compartment → scene → layout → geometry

`ActorState.compartment` is read in three places in the scene builder, and each actor class goes through a different one.

| Step | What the code does today |
|---|---|
| **Regions** | Derived from the document's declared compartments, never from who is on screen. A `membrane` compartment is one bilayer. A `nucleus` compartment becomes a band at the bottom, only when another compartment that is neither `membrane` nor `extracellular` is declared beside it. Every other compartment has no geometry: it is whatever canvas is left. |
| **Membrane-spanning actors** | A `protein` or `complex` whose resolved compartment has kind `membrane` is drawn on the bilayer. Read from the snapshot, so it follows `translocate`. |
| **Free actors that are not nucleic acids** | `y` comes from the resolved compartment: above the bilayer for `extracellular`, below it otherwise, inside the region when the compartment's kind is the region's. `x` is a slot in the row of that band. Proteins, complexes and small molecules share this path. |
| **Bound and resting actors** | Docked on their partner, or resting on the nucleic acid they occupy. The partner's position decides; their own compartment only picks a side of the membrane. |
| **Nucleic acids** | `y = stack.top + index · stack.gap`: the index is declaration order among the acids on screen. `x` spans the canvas. **The compartment is never read.** `SceneNucleicAcid` does not carry one. |

Transitions add nothing of their own: actors are keyed elements moved by a CSS transform, and a nucleic acid's `y` is already interpolated between frames (ADR 0001). Whatever the layout moves is animated.

### 2.1 The six cases

| Case | Path | Result |
|---|---|---|
| A free protein is translocated | free-actor row of the new compartment | **Visible**, when the two compartments have different bands |
| A small molecule is translocated | the same path as a protein | **Visible** under the same condition. No shipped example does it |
| A DNA or RNA is translocated | nucleic-acid stack | **Nothing moves** |
| IRF3 → nucleus (cGAS–STING) | free row; `includeBound` moves the dimer partner's compartment with it | **Visible**: the dimer drops into the nucleus band |
| STING, ER membrane → Golgi membrane | spanning actor; the one bilayer is relabelled | **Visible as a change of name**, by design: a change of context, not a journey |
| mRNA, nucleus → cytoplasm (gene expression) | nucleic-acid stack | **Nothing moves** |

### 2.2 Why nucleic acids do not move

Three causes, and the third is the one that matters.

1. **Nucleic acids are placed by declaration order.** No rule connects their `y` to a compartment, so a change of compartment has nothing to act on.
2. **Regions are partial and chosen by kind.** Only `nucleus` gets a delimited band, and the sides of a membrane exist only when a membrane is declared. A document with `[nucleus, cytoplasm]` has one band and an unnamed remainder. There is nowhere defined for "the cytoplasm" to be.
3. **The dependency runs backwards.** With a membrane, the top of the nucleus band is computed from where the nucleic acid sits (`regionTop` from `stackedAcidY`). The region is fitted around the molecule. A molecule cannot then be placed by its region.

So the free-actor path is compartment-aware because it was written after bands existed and reads them. The nucleic-acid path predates them and was never connected.

## 3. Goal and constraints

> **An actor's resolved compartment constrains the region it is drawn in, whatever its type.**

1. `compartment` is semantic state from the core. Region geometry and placement are the renderer's.
2. No rule names an actor type together with a compartment (`rna` and `cytoplasm`), and nothing is specific to a mechanism.
3. The renderer infers no biological destination. It draws where the state says an actor is.
4. Region geometry never depends on who is on screen in one step, so nothing shifts when an actor is hidden. It comes from the declared compartments and from the resolved states of the mechanism (§4.2).
5. **Layout may reserve space from resolved states across a mechanism, but it must not infer future state from action semantics.** The layout never reads `translocate`, `synthesize` or any other action to predict where an actor will be.
6. A document with one region is drawn exactly as today. EGFR and cGAS–STING are regression cases: any change to their output is reported before it is accepted.
7. Kind-specific behaviour is allowed only where it derives from the existing `kind` vocabulary as a whole, not from one kind.

## 4. Design

### 4.1 Compartments may be drawn as bands

A declared compartment that is not a membrane may be drawn as a **band**: a horizontal drawable stretch across the full width of the canvas. Bands are stacked top to bottom. A membrane is not a band: it is the boundary between the band above it and the band below (§4.6).

- **The order of bands is a layout fallback, not biology.** One table over the existing kinds puts `extracellular` first, the kinds of the cell interior next and `nucleus` last, with declaration order between compartments the table does not separate. It reproduces where today's two special cases already draw things. It says nothing about what encloses what, and another presentation may order bands differently without changing anything else here.
- A document with one band has no delimitation: the whole canvas is that compartment, as today.
- A band is delimited and named as the nucleus region is now. The drawing of a boundary stays the one that exists; no envelope, pore or organelle shape is added.
- An actor whose compartment is undeclared or unset is placed in the default interior band.
- `parent` is not read. Nested compartments are out of scope.

Bands replace the two special cases (membrane sides, nucleus region) with one list. For the documents that have them today, the bands are the same stretches.

### 4.2 Each band has lanes, reserved from resolved states

A band holds **lanes**: one per nucleic acid that is in it, in declaration order, each with the room above it that occupants need, and one row for free actors.

For the picture to be stable, a lane has to exist in every step, not only in the steps where its molecule is there. So lanes are **reserved**, and the reservation is read from state:

> A band has a lane for a nucleic acid if that molecule's resolved compartment is that band's in **any snapshot of the mechanism**.

Nothing reads an action. The compiled mechanism already holds every resolved snapshot; the reservation is a fold over `snapshot.actors[id].compartment`. Whether the compartment got there by `translocate`, by a custom action or by a declaration makes no difference, and a custom action that moves an actor is covered without the layout knowing it exists.

The layout already decides which side of a membrane a site faces by scanning the document's actions. That is existing behaviour and is not changed here, but it is not a precedent: nothing new may be derived that way.

**Where the snapshots are.** `buildSvgScene` receives one snapshot. It has the definition, but not the other snapshots, so it cannot compute a reservation itself. The compiled mechanism is available one layer up, where the viewer already derives which actors are upcoming from all snapshots and passes the result down as an option. The reservation takes the same route:

- a pure function of the compiled mechanism computes the reservation: per band, its lanes;
- the host passes it to `buildSvgScene` as an option, as it passes `ghosts`;
- the scene of a step stays a pure function of its snapshot and its options.

**Without a reservation**, when a caller builds a scene from a single snapshot, the smallest state-based alternative applies: lanes are reserved from that snapshot alone, from the resolved compartment of every actor in it, present or not. The scene is then correct for its step and may differ in band heights from the scene of another step. It is never completed by reading actions.

The dependency of §2.2 is reversed either way: bands and lanes are fixed first, and every actor is then placed in the lane or row of its resolved compartment.

### 4.3 Placement

- **A nucleic acid** is drawn in its lane of the band of its resolved compartment. Horizontally nothing changes: it spans the canvas through its coordinate map (ADR 0002).
- **A free actor** is drawn in the free row of its band, by the slot rule that exists.
- **A spanning actor** is drawn on its membrane, as now.

One rule serves all three: resolved compartment → band → the place that band has for that kind of geometry. The actor's type selects the kind of place (a lane, a slot, the bilayer), never the band.

### 4.4 When the compartment changes

The actor is placed again by the same rules in the new band. It does not carry a position over.

- A nucleic acid therefore keeps its horizontal geometry exactly and changes lane: it moves vertically.
- A free actor takes the slot its new row gives it, as a translocated protein does today.

Keeping a relative position inside the new band was considered and rejected (D4): bands differ in height and in what occupies them, so a carried position would need collision repair, and the result would depend on where the actor happened to be.

### 4.5 Bound and resting actors

An actor that rests on a nucleic acid, or is docked on a partner, is placed by that relation. **The partner's position wins, and the compartment constrains the anchor of the assembly**: the nucleic acid for what rests on it, the docked-on partner otherwise.

When an actor's own compartment disagrees with where its anchor is drawn (a ribosome declared in the cytoplasm on an mRNA still in the nucleus), the renderer draws it on its anchor and changes nothing. The disagreement is in the document: `translocate` without `includeBound` leaves partners behind, and that is core semantics this ADR does not touch. The scene reports it as a layout diagnostic, as it already reports callout conflicts; nothing is drawn for it, and core validation is not changed.

A soluble partner of a spanning actor keeps the existing rule: it docks on the side its own compartment lies on.

### 4.6 Membranes

A membrane stays a special geometric constraint, and fits the abstraction as a **boundary with thickness** between two bands. What is specific to it is kept: spanning actors, the two sides, the anchors that face away from the bilayer.

The rule of one bilayer is kept. Several membrane compartments are still one bilayer that stands for the one the scene is at, and STING moving from the ER membrane to the Golgi membrane is still a relabelling. Drawing two membranes at once is a different problem and is not proposed.

### 4.7 Fitting nucleic acids into a band

Bands run the full width of the canvas, and that is why they are bands and not boxes: a nucleic acid is as wide as the canvas by convention, so it fits any band horizontally and no scaling rule is needed.

The fit is vertical. A lane has a minimum height (the helix, plus occupant room). Heights are allocated in this order:

1. every lane and row at its minimum;
2. the remaining height shared among bands in proportion to what they hold;
3. if the minimums exceed the canvas, the room between lanes is compressed down to a floor.

Below that floor the scene reports a layout conflict. It never drops, scales or hides a molecule to make it fit. The canvas height is already an option of the scene, and a taller canvas is the remedy.

A pairing between molecules in different bands is drawn between wherever the two are. It crosses the boundary; nothing prevents or adjusts it.

### 4.8 Transition and reduced motion

No new mechanism.

- A nucleic acid that changes lane has a different `y` in the two frames, and `interpolateGeometry` already interpolates it.
- Actors move by their CSS transform. Occupants travel with the molecule they rest on, each by its own means, as they already do when a strand travels to a pairing.
- Bands do not move: with a reservation they are the same in every step (§4.2).
- With `prefers-reduced-motion` the step is shown settled.

As in ADR 0001 and 0002, the transition is derived from two geometries. The animator does not learn that a `translocate` happened.

### 4.9 Reservation and actors that are not present

A reservation is capacity, not a drawing.

- An actor with `present: false` may reserve layout capacity when the resolved snapshots of the mechanism require it: a lane for a transcript that does not exist yet, in the band where it will be.
- It stays visually absent. Nothing is drawn for it, it is not interactive, and it is not an obstacle that visible actors or callouts are kept clear of. An empty lane is empty canvas.
- The reservation comes from the resolved states of the mechanism. It never comes from `synthesize`, `translocate` or any other action.

This is separate from the viewer's upcoming actors, which are drawn blurred and out of focus on request. That feature is unchanged. An upcoming actor waits in the band of its resolved compartment, as it does today when a membrane is declared; with bands it does so in every document that has more than one.

## 5. Expected effect on existing documents

| Document | Compartments | Expected |
|---|---|---|
| PARP1, homologous recombination, p53–MDM2 | `nucleus` only | one band: unchanged |
| EGFR | `extracellular`, `membrane`, `cytoplasm`; no nucleic acid | the same bands as today: unchanged. **Regression case** |
| cGAS–STING | `cytoplasm`, two membranes, `nucleus`; a DNA in the cytoplasm | the DNA's lane is where it is drawn now, between the membrane and the nucleus band. Intended unchanged. **Regression and stress case** |
| Gene expression | `nucleus`, `cytoplasm`; two nucleic acids, one translocated | **changes**: gene and pre-mRNA are drawn inside the nucleus band, and the mRNA moves to a lane in the cytoplasm band, with the ribosome on it. **Main failing fixture** |
| v2–v6 render baselines | none declares two bands with a nucleic acid | unchanged. The v6 `gene-expression` fixture declares only `nucleus` |

"Intended unchanged" is a prediction from reading the code, not a measurement. Implementation reports every baseline that moves and why, before any is updated.

## 6. Decisions

D3 to D8 are accepted as proposed. D1 and D2 were revised in review, and D9 was added.

| # | Decision | Options | Proposal |
|---|---|---|---|
| **D1** | How compartments define drawable regions | (a) a non-membrane compartment may be drawn as a full-width horizontal band; their order is a presentation fallback over `kind`, then declaration order, and carries no biological meaning; (b) keep the two special cases and add a cytoplasm region; (c) nested shapes from `parent` | **(a)** *(revised)*. `parent` and nesting are out of scope |
| **D2** | How an actor is positioned in its compartment | (a) bands hold lanes for nucleic acids and a row for free actors, reserved from the resolved snapshots of the mechanism and passed to the scene as an option; from the one snapshot when no reservation is given; (b) predicted by reading `translocate` actions; (c) from who is on screen in each step | **(a)** *(revised)*. (b) interprets action semantics. (c) makes everything shift when an actor is hidden |
| **D3** | What a change of compartment does | (a) the actor is laid out again in the new band by the same rules; (b) a dedicated move | **(a)** |
| **D4** | Position in the new band | (a) a new layout position; nucleic acids keep their horizontal geometry because the rules give it; (b) the relative position is carried over | **(a)** |
| **D5** | Bound and resting actors | (a) the partner's position wins and the compartment constrains the anchor; a disagreement is a renderer diagnostic only, not a drawing and not a validation; (b) the actor's own compartment wins and the binding is drawn stretched across bands; (c) the renderer moves the partners too | **(a)**. (c) would make the renderer infer a destination |
| **D6** | Nucleic acids and the size of a band | (a) full-width bands, so only height is fitted: minimums, then shared room, then compression to a floor, then a reported conflict; (b) scale the molecule to its region | **(a)** |
| **D7** | Transition and reduced motion | (a) nothing new: `y` is already interpolated, actors move by CSS, bands are static; (b) a dedicated crossing animation | **(a)** |
| **D8** | Membranes | (a) a boundary with thickness between two bands, keeping its own rules and the one-bilayer rule; (b) a band like the others; (c) several bilayers at once | **(a)** |
| **D9** | Actors that are not present | (a) may reserve capacity from resolved states; drawn as nothing, not interactive, not an obstacle; (b) reserve nothing, so bands change when they appear | **(a)** |

## 7. Open questions

1. **A second band of the same kind.** Two interior compartments drawn as bands are ordered by declaration (§4.1). Whether that is enough is left to the first document that needs it; a richer ordering is out of scope.
2. **The diagnostic of §4.5** is a renderer diagnostic only. Whether the validator should one day warn when an actor is left in another compartment than what it rests on is a core question, and is not proposed.
