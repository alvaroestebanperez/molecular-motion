# RFC 0007 — Nucleic acids that begin partial, and internal excision with resealing

- **Status:** Implemented in the core as proposed (§9). The renderer is not part of it (§13).
- **Builds on:** [RFC 0004](0004-nucleic-acid-geometry.md) (coordinates, strand state), [RFC 0005](0005-assemblies-and-occupancy.md) (occupancy), [RFC 0006](0006-nucleic-acid-pairing.md) (pairing, templated `extend`)
- **Schema:** `schemaVersion: 6`

## 1. Problem

A twelve-step gene-expression story (gene → Pol II → transcription → splicing → export → translation) was written in schema v5 and compiled with the current core. All twelve steps compile. Two of them compile only by changing the meaning of existing actions.

**1. A transcript cannot begin short.** `extend` already is transcription: it synthesises 5′→3′ from a 3′ end, copying the strand that end is paired with, on another molecule if need be. With a 4-nt RNA paired to an unwound template it grows along the DNA, and the core refuses to run past the bubble. But v5 has no way to declare an RNA that exists as its first four nucleotides. The only route is to declare the whole molecule, then `cleave` and `resect` it:

```yaml
- { type: cleave, target: pre-mrna.five }             # a break that never happened
- { type: resect, target: pre-mrna.five, length: 32 } # a resection that never happened
```

The state says a full-length RNA was broken and chewed back. The renderer, correctly, draws "Single-strand break" on the nascent transcript.

**2. Exons cannot be joined.** `cleave` at the donor and acceptor is legitimate. Removing the intron as `missing` nucleotides leaves a gap, and `ligate` refuses, correctly: *"the top strand is missing nucleotides; fill the gap with extend before ligating"*. A ligase seals adjacent ends. Joining two ends that are not adjacent changes which nucleotides are neighbours, and v5 has no state for that. The probe fell back to `degrade pre-mrna` + `synthesize mrna`, which is two unrelated molecules.

Both gaps are in core state, not in drawing. Everything else the story needed is renderer work and is outside this RFC (§2).

## 2. Scope

Two capabilities, and only these:

- **A. Initial strand state.** A nucleic acid may begin with part of its extent present.
- **B. Excision.** An internal interval is removed and its flanks become covalent neighbours (`excise-interval`).

Explicitly **outside**:

- the excised interval as an independent actor (the intron as a product);
- actor lineage or `derivedFrom`; pre-mRNA → mRNA as a change of identity; nascent peptide → protein;
- exon/intron as a presentation annotation;
- visible movement between nucleus and cytoplasm, and any other renderer or layout work;
- actions named `transcribe`, `splice`, `translate`, `prime` or `initiate`.

`extend`, `cleave` and `ligate` keep exactly their current semantics. Where that leaves something inexpressible, the RFC says so (§6.5) instead of bending them.

## 3. A — Initial strand state

### 3.1 Finding: the existing `NucleicState` is enough

Strand state already has the shape needed (RFC 0004 §4):

```ts
interface NucleicState { missing: StrandRange[]; nascent: StrandRange[]; open: Array<{ from: number; to: number }> }
```

Read from the code, not yet run: `extend` asks for no break at its target. It looks for a `missing` interval on the strand that starts where the 3′ end is, and takes the template from whatever the 3′-terminal nucleotide is paired with. So a molecule whose state starts as `missing: top [4, 32)` offers a 3′ end at coordinate 4 facing a gap, and `extend` continues from it unchanged. `pair` on the present `[0, 4)` already works with the rest missing (run in the probe).

Today `initialState` never sets `actor.nucleic`, and validation rejects `initial.nucleic` ("is not supported"). The proposal is to accept it.

### 3.2 Proposal

`initial.nucleic` on a `dna` or `rna` actor takes the fields of `NucleicState`, with the same meaning as in a snapshot: `missing`, `nascent`, `open`, and `excised` once §4 adds it. Each is optional.

```yaml
- id: pre-mrna
  type: rna
  nucleic: { length: 32 }
  initial:
    nucleic:
      missing: [{ strand: top, from: 4, to: 32 }]
      nascent: [{ strand: top, from: 0, to: 4 }]   # optional: marks the present part as newly made
```

- It is **state, not an event**. No action is recorded, no lesion is set, nothing is narrated. The first snapshot simply has that strand state.
- It is normalised exactly as action results are (sorted, merged, top before bottom).
- `nucleic.length` stays the coordinate extent of the whole molecule. The declared molecule is the finished one; the initial state says how much of it exists yet.
- An intact molecule still has no `nucleic` field in its state, so every v5 snapshot is unchanged.

### 3.3 Principle: state is not history

> **A valid nucleic state does not require replaying the actions that produced it.**

Strand state is topology: which nucleotides exist, which are newly made, which are unpaired, which are covalent neighbours. Whether a state is valid is decided by the invariants of §7 alone, never by whether some sequence of actions could have reached it. So a document may begin with a molecule that is partly synthesised, already gapped, or that **already contains a junction left by an excision** (`initial.nucleic.excised`), with no action recorded for any of it. A mature mRNA can be declared on its pre-mRNA coordinates and start spliced.

The converse also holds: an action is checked against the state it finds, not against how that state came about.

### 3.4 Why not something smaller or larger

- *A dedicated field* (`initial.extent: [0, 4]`) would be a second way to say `missing`, and could not express a primer in the middle of a template or a pre-resected end.
- *An initial lesion on a site* is not needed for the goal and is left out.
- *Initial pairings and occupancy* stay events (`pair`, `occupy`): they relate two things and belong in a step.

### 3.5 Generality

- **Transcription initiation.** The RNA begins as `[0, 4)`; `pair` it to the unwound template; `extend`.
- **Replication primer.** A lagging-strand fragment is a DNA declared at its final length that begins as its RNA-primer-sized stretch, paired to the template; `extend` fills it; `ligate` later seals it to its neighbour. No `prime` action.
- **A substrate that starts resected or gapped**, without narrating steps that are not part of the story (a mechanism that opens on a 3′ overhang).

## 4. B — Excision

### 4.1 Three operations, three meanings

| Operation | What it does | Coordinates | Adjacency |
|---|---|---|---|
| `cleave` | creates a discontinuity at a position | unchanged | the two sides are no longer bonded |
| `ligate` | seals ends that are **already adjacent** | unchanged | restores the bond `n−1 — n` |
| `excise-interval` *(new)* | removes an internal interval | unchanged | bonds the flanks: `from−1 — to` |

`missing` nucleotides are a **gap**: the strand is absent there, a 3′ end faces it, `extend` may fill it, and `ligate` refuses while it is open. An excised interval is **not a gap**: nothing is absent *between* the flanks, because the flanks are neighbours.

### 4.2 The principle: coordinate order ≠ covalent adjacency

Today the two are the same thing: nucleotide `n` is bonded to `n+1` unless a break or a gap says otherwise. Excision separates them. After excising `[12, 24)` from a 36-nt RNA:

```text
coordinates   0 ………… 11 | 12 ………… 23 | 24 ………… 35
extant        ██████████   (excised)   ██████████
covalent      0 … 11 — 24 … 35                       (11 is bonded to 24)
```

**Coordinates are not renumbered.** Nucleotide 24 is still nucleotide 24. Sites, alignments and authored spans keep meaning what they meant, and a later step can still say "exon 2 is `[24, 36)`" and "it corresponds to `gene [46, 58)`". Renumbering would silently invalidate every one of those.

### 4.3 New state

One field on `NucleicState`, at molecule level like `open`:

```ts
interface NucleicState {
  missing: StrandRange[]; nascent: StrandRange[]; open: Interval[];
  /** Intervals removed from the molecule. The nucleotides either side of each are covalent neighbours. */
  excised?: Interval[];
}
```

`excised` is optional, and an absent list means exactly the same as an empty one. The core stores it only while it is non-empty, as `nucleic` itself is stored only on a molecule that is not intact: a v5 document that resects or unwinds must not gain `excised: []` (I9).

Everything else is derived:

- **extant** nucleotide: inside `[0, length)` and in no `excised` interval;
- **covalent successor** of `n`: the next extant coordinate after `n`;
- **junction**: the bond across an excised interval `[a, b)`, between `a−1` and `b`;
- **extant length**: `length` minus the excised nucleotides.

Excision is molecule-level: on a duplex it removes both strands across the interval. Removing nucleotides from one strand only leaves the other strand's nucleotides unpartnered, which is a gap and already has a model (`cleave` twice, then `missing`). See D5.

### 4.4 The action

```yaml
- { type: excise-interval, target: pre-mrna.intron }          # a site with a span
- { type: excise-interval, target: pre-mrna, span: [12, 24] } # or an explicit interval
```

A primitive. It is atomic: after it, the interval is `excised` and the junction is sealed. Break lesions on point sites at its two boundaries are cleared, because the bond they interrupted no longer exists; the bond that replaces it is the junction. An author who wants to narrate the chemistry writes `cleave` at each boundary in an earlier step, then `excise-interval`. Without them it still stands alone.

**What goes with the interval.** `excise-interval` removes state that belongs only to excised material, and nothing else:

- every lesion on a site wholly inside the interval (a span with no extant nucleotide left, or a point strictly inside), and every lesion on a point site at `a`, whose nucleotide `a` was excised;
- the break lesions on point sites at `b`, with those at `a`: the boundary rule above;
- `nascent` and `open` ranges, clipped to what remains (I3).

State on surviving material stays. A base lesion on a point site at `b` is on nucleotide `b`, which is extant, and is kept (D14). A lesion on a span site that keeps at least one extant nucleotide is kept. Nothing is moved to a neighbour (I11). State that relates the interval to something else is never removed silently: an occupant, a legacy point occupancy on a site that would be wholly excised, or a trans pairing makes the action fail (§8).

Name: **`excise-interval`**. Not `splice`, which names one biological use. Not `excise`: v5 already has an alias `excise` — *"excises the base at"* a site, setting an abasic-site lesion (base-excision repair; used by the PARP1 example). That alias removes a base, not backbone, and changes no adjacency. It is kept exactly as it is.

## 5. Generality of B

- **RNA splicing.** `excise-interval pre-mrna.intron`. Exons stay at their coordinates; the gene alignment still holds for both.
- **V(D)J recombination** (duplex DNA). `excise-interval locus, span: [V end, J start]` removes the intervening DNA and makes the V and J segments neighbours on both strands: the coding joint. The same shape covers **Cre–lox deletion** and **transposon excision**.
- **tRNA intron removal** and **exon skipping** (one interval that contains an exon, or that contains an earlier excision, §7 I4).

Not excision: nucleotide-excision repair and base-excision repair. Both remove nucleotides from one strand and leave a **gap** that is filled by `extend` and sealed by `ligate`. They are `missing`, and stay so.

## 6. Effects on the rest of the model

### 6.1 Sites

Coordinates stay stable **for reference**: a site keeps its definition, and tools can still say where it was. But excised material is not physically there, and nothing can act on it.

- A **span site** wholly inside an excised interval is excised and cannot be a target.
- A span site that straddles an excised interval stands for the extant nucleotides in it. `[8, 28)` across an excised `[12, 24)` is 8 nucleotides, covalently contiguous.
- A **point site** strictly inside (`a < at < b`) is excised and cannot be a target.
- A point site at a boundary (`at: a` or `at: b`) keeps the two readings RFC 0004 gave it (a coordinate is an interbase position, and a nucleotide-level site at `n` is the nucleotide `[n, n+1)`), and excision affects only one of them (D14):
  - read as a **boundary** (breaks, 3′ ends, footprint anchors), `a` and `b` are resolved through the new adjacency: both are the junction;
  - read as a **base** (base lesions), the coordinate still denotes the original nucleotide. `at: a` is nucleotide `a`, which was excised, so the action fails. `at: b` is nucleotide `b`, which is extant. An excised base is never remapped to the surviving neighbour.

> **Excision may change the topological meaning of a boundary coordinate, but it never changes the nucleotide denoted by a base coordinate.**

- **Break state stays per site and independent**, as in v5 (D15). There, two sites at one coordinate already hold separate state: `cleave` through one and `ligate` through the other fails with *no strand break* (checked). Two sites that name the same physical junction after an excision are in the same position, and do not come to share state. `excise-interval` clears the break lesions of every point site at `a` or `b`; from then on each action reads and writes the state of the one site it names.

> **RFC 0007 introduces new covalent adjacency, but not bond identity or site aliasing.**

### 6.2 Occupancy

- `excise-interval` fails while any occupant covers a nucleotide of the interval: *vacate it first*. Same rule and wording as the existing fit check.
- A footprint counts **extant** nucleotides. The stored occupancy span is the smallest coordinate interval that contains the nucleotides actually covered: it begins at the first extant nucleotide covered and ends after the last, and may contain excised intervals in between. A span that an author gives over excised nucleotides is cut back to that: `span: [10, 20]` over an excised `[12, 24)` is stored as `[10, 12)`. Two stored spans therefore overlap by coordinate exactly when they share an extant nucleotide, and the occupancy rule of RFC 0005 is unchanged. An 8-nt footprint placed forward from coordinate 8 covers `[8, 12)` and `[24, 28)`: a ribosome sitting on an exon–exon junction. The stored span is the coordinate interval `[8, 28)`; what it covers is derived.
- `coat` places copies side by side along the covalent order.

### 6.3 Alignments and pairings

- An **alignment** is authored correspondence, position for position, and is not rewritten. It holds for the extant nucleotides of both sides. This is the main payoff of stable coordinates.
- `excise-interval` fails while any nucleotide of the interval is paired in trans: *unpair it first*.
- A **pairing span may not contain an excised nucleotide** on either side. Pairing across a junction is two pairings, one per flank. The partner's stretch between them stays unpaired (the loop of a pre-mRNA–genomic hybrid).
- On a duplex, cis pairing stays derived: both strands lose the same interval, so what remains is paired as before.

### 6.4 Modifications

Covalent modifications live on actors and name a site by a free string; core does not resolve it against coordinates. Nothing changes. A lesion, which is site state, follows §6.1.

### 6.5 `extend`

Unchanged. Two consequences:

- A gap never contains an excised nucleotide (I3), so filling a gap never meets a junction on the extending molecule.
- **A template is followed by coordinate, as today.** When the template has a junction, the next template nucleotide by coordinate is excised and `extend` stops with *no template*. **Copying across a junction — reverse transcription of a spliced mRNA into cDNA — is therefore not expressible under this RFC.** Making it so means changing how `extend` walks its template, which this RFC is told not to do. It is recorded as an open question (§10).

### 6.6 `cleave` and `ligate`

- `cleave` at a junction (a point site at `a` or `b`) breaks the junction bond, like any other bond.
- `ligate` there reseals it, under its existing rule: both ends present, no missing nucleotides at the break. `ligate` never creates a junction and never removes nucleotides.
- `resect` counts **extant** nucleotides when it removes `length` of them, so the `missing` it writes may be split around an excised interval.

### 6.7 Validation of spans

- **Static** (definition): site spans, alignment ranges and authored spans are checked against `[0, length]`, as today. Excision is state and cannot be known statically.
- **Dynamic** (during the fold): a span must contain at least one extant nucleotide; an operation that needs a contiguous stretch (`occupy`, `pair`, `unwind`) reads contiguity covalently.
- `nucleicLength` keeps meaning the coordinate extent. Code that means "how many nucleotides" must use the extant length.

### 6.8 Validation of actions on excised coordinates

One rule, applied to every action that names a nucleic target:

> **An action acts on extant nucleotides only.** Its target is resolved to the nucleotides or the interbase position it needs. If none of them is extant, the action fails; it never falls back to a neighbour, and it never treats an excised nucleotide as present, absent-but-fillable, or paired.

"Excised" is its own answer, distinct from `missing`. Where the core today asks what a nucleotide is paired with (`cis`, `trans`, `unpaired`, `absent`), an excised nucleotide answers `excised`, and every check that reads that answer rejects it.

| Action | Needs | Wholly excised target | Target straddling an excised interval |
|---|---|---|---|
| `occupy`, legacy `bind` to a site | a footprint of extant nucleotides | fails: *nothing is there* | covers the extant nucleotides; the footprint length counts them (D9) |
| `occupy` anchored at a point site | an interbase anchor | strictly inside: fails. At `a` or `b`: anchored at the junction; `forward` starts at `b`, `reverse` ends at `a−1` | — |
| `coat` | a run of extant nucleotides | fails | copies are placed along covalent order |
| `vacate`, `unbind` | an existing occupancy | unaffected: no occupancy can be on excised nucleotides (I5) | unaffected |
| `cleave`, `ligate` | an interbase position | strictly inside: fails. At `a` or `b`: the junction bond | — |
| `resect` | a break, then `length` extant nucleotides | break strictly inside: fails | counts extant nucleotides; `missing` is written around the excised interval |
| `extend` | a 3′ end facing a gap; a template | site strictly inside: fails | own strand: never arises (I3). Template: stops, *no template* (§6.5) |
| `unwind` | a duplex stretch, both strands present | fails | opens the extant nucleotides; stored as one `open` interval per flank |
| `anneal` | an open stretch | fails | closes the extant part |
| `pair`, `invade` | equal runs of extant, unpaired nucleotides | fails | fails: *pair each flank separately* (D10) |
| `unpair` | existing trans pairings | unaffected: none can exist there (I5) | releases the pairings of both flanks |
| `damage`, `excise` (base), `repair`, `set-state` with a base lesion | one nucleotide | fails, including a point site at `a` (D14) | — |
| `fill-gap`, `set-state` with a break lesion | an interbase position | strictly inside: fails. At `a` or `b`: the junction | — |
| `excise-interval` | an internal interval of present nucleotides, with both flanks present | fails: *nothing left to excise* | an interval that contains an earlier one is accepted and merges with it (I4); one whose flank is excised fails |

The same rule covers references that are not action targets: an `occupy`, `pair` or `unwind` that would newly cover an excised nucleotide through an explicit `span` fails or clips exactly as the table says for its row.

Definitions are never rejected for pointing at coordinates that are excised in the initial state: a site or an alignment range may lie inside `initial.nucleic.excised`. It is a stable reference that no action can use.

## 7. Invariants

- **I1.** Coordinates are never renumbered. `length` is constant for the life of a molecule.
- **I2.** `excised` intervals are sorted, disjoint and merged; each is internal (`0 < from < to < length`) and leaves at least one extant nucleotide on each side of the molecule.
- **I3.** `excised` is disjoint from `missing`, `nascent` and `open`. Excising clips those to what remains.
- **I4.** `excised` intervals that touch or overlap are stored merged. An `excise-interval` whose flank is already excised fails (§8): the author names the whole interval instead.
- **I5.** No occupancy and no trans pairing covers an excised nucleotide.
- **I6.** A junction is one covalent bond between `a−1` and `b`. It exists on a strand only where both of those nucleotides are present; where one is `missing`, the junction is the edge of a gap, as any other position would be.
- **I7.** Initial strand state obeys the same invariants as any snapshot, and no others (§3.3): ranges inside `[0, length)`; `missing` and `nascent` disjoint on a strand; `open` only on a duplex, only where both strands are present; a single-stranded molecule has only `top`.
- **I8.** A molecule never *begins*, and never comes out of `excise-interval`, with nothing present. Validation of `initial.nucleic` requires at least one extant nucleotide that is not `missing` on some strand (§8). `excise-interval` requires both flanks present on every strand, so after it at least two such nucleotides remain. This is not a global invariant of state: `resect` keeps its v5 behaviour and may remove the last nucleotides of a strand, so a present molecule with no extant, non-missing nucleotide is reachable through it (I9).
- **I9.** A v5 document produces exactly the snapshots it produced before.
- **I10.** No action reads an excised nucleotide as present, as a fillable gap, or as paired (§6.8).
- **I11.** A base coordinate always denotes the same nucleotide. No lesion, occupancy or pairing is moved to a neighbour because its nucleotide was excised.
- **I12.** Lesion state is per site. Sites are never aliased, and a junction has no identity of its own beyond the adjacency derived from `excised`.

## 8. Invalid cases

Initial state:

| Document | Error |
|---|---|
| `initial.nucleic` on a protein, molecule or complex | only allowed on dna and rna actors |
| a range outside `[0, length)`, empty, or `from ≥ to` | range runs past the molecule |
| `strand: bottom` on a single-stranded molecule | has no bottom strand |
| `missing` and `nascent` overlapping on a strand | a nucleotide cannot be both absent and newly made |
| `open` on a single-stranded molecule, or over a missing stretch | a bubble needs both strands present |
| everything missing on every strand | nothing is present; use `initial: { present: false }` |
| `initial.nucleic` together with `present: false` | a product that does not exist yet has no strand state |

Excision (`excise-interval`), and any action afterwards:

| Action | Error |
|---|---|
| target is not a nucleic acid, or has no span | needs a nucleic acid and an interval |
| interval reaches coordinate 0 or `length` | not internal: that is truncation, not excision |
| interval lies wholly in an excised stretch | nothing left to excise there |
| a nucleotide of the interval is `missing` on a strand | the interval must be present; a gap is filled or resected, not excised |
| an occupant covers part of the interval | vacate it first |
| a legacy point occupancy (`bind` to a site) rests on a site that would be wholly excised | release it first |
| a trans pairing covers part of the interval | unpair it first |
| the interval overlaps an unwound bubble only in part | anneal it, or excise the whole bubble |
| any action targets a site wholly inside an excised interval | the site was excised (§6.8) |
| a flank nucleotide (`a−1` or `b`) does not exist on a strand (`missing`, or already excised) | nothing to join there: `excise-interval` seals a junction between exactly those two nucleotides. It never looks for the next surviving nucleotide; fill the gap, or excise one interval that covers both |
| a base lesion on a point site at the lower boundary `a` | that nucleotide was excised (D14) |
| `pair` or `occupy` on a span with no extant nucleotide | nothing is there |
| `pair` on a span that crosses a junction | pair each flank separately |
| `extend` whose template runs into an excised nucleotide | no template (§6.5) |
| `initial.nucleic.excised` not internal, overlapping `missing`/`nascent`/`open`, or leaving a side empty | same rules as after `excise-interval` (I2, I3) |

## 9. Decisions

| # | Decision | Options | Proposal |
|---|---|---|---|
| **D1** | How a molecule begins partial | (a) `initial.nucleic` with the existing `NucleicState`; (b) a dedicated `initial.extent`; (c) keep `cleave` + `resect` | **(a)** |
| **D2** | Which fields the initial state takes | (a) `missing`, `nascent`, `open`; (b) `missing` only; (c) also `excised` | **(c)** *(resolved)*. `excised` is topological state, not the history of an action: a document may begin with a molecule that already contains a junction (§3.3) |
| **D3** | Is the initial state an event | (a) pure state, nothing narrated; (b) expands to implicit actions | **(a)** |
| **D4** | Coordinates after excision | (a) stable, with adjacency derived from `excised`; (b) renumber the molecule; (c) replace the molecule by a shorter one | **(a)** |
| **D5** | Granularity of excision | (a) molecule-level interval, both strands of a duplex; (b) per strand | **(a)** *(resolved)*. Removing one strand stays with the existing gap and resection operations |
| **D6** | Name | (a) `excise` for this, and rename the v5 base-excision alias; (b) keep the alias and call this `excise-interval`; (c) another verb (`delete`, `remove`) | **(b)** *(resolved)*. The v5 alias `excise` is unchanged; PARP1 is not touched; no semantic migration |
| **D7** | Relation to breaks | (a) atomic: `excise-interval` cuts and joins, and clears break lesions at its boundaries; (b) requires a break at both boundaries first; (c) leaves a break at the junction for `ligate` | **(a)**. (c) would make `ligate` join non-adjacent ends, which is the meaning this RFC protects |
| **D8** | Sites inside the interval | (a) become excised and untargetable; (b) are kept and collapse onto the junction | **(a)**; boundary point sites denote the junction |
| **D9** | Footprints and spans across a junction | (a) count extant nucleotides, stored as a coordinate interval; (b) forbidden across a junction | **(a)** |
| **D10** | Pairing across a junction | (a) one pairing per flank; (b) a single pairing whose spans skip the excised stretch | **(a)** |
| **D11** | `extend` and templates with a junction | (a) unchanged: stops at the junction; (b) follows covalent order on the template | **(a)** *(resolved for this RFC)*. `extend` is not modified; (b) stays an open question (§10) |
| **D12** | What happens to the excised nucleotides | (a) they cease to exist in the model; (b) they become a product | **(a)**. (b) is out of scope |
| **D13** | Schema version | (a) `schemaVersion: 6` with automatic v5 → v6; (b) additive under v5 | **(a)**, purely additive |
| **D14** | A point site at a boundary of an excised interval | (a) the two readings of RFC 0004 are kept: boundary operations resolve `a` and `b` through the new adjacency; base operations still denote the original nucleotide, so `at: a` fails and `at: b` is nucleotide `b`; (b) both boundaries are always the junction, and a base lesion at `a` lands on nucleotide `b`; (c) a boundary site at `a` is excised for every action | **(a)** *(resolved)*. An excised base is never remapped |
| **D15** | Break state of a junction named by two point sites | (a) per site and independent, as two sites at one coordinate behave in v5; `excise-interval` clears break lesions on every point site at `a` or `b`; (b) one shared state per junction | **(a)** *(resolved)*. No bond identity, no site aliasing. `cleave` through one site and `ligate` through another fails, as it does in v5 |

## 10. Open questions

1. **Templated synthesis across a junction** (cDNA from spliced mRNA). Needs `extend` to follow covalent order on its template, and an alignment that can relate one contiguous range to two flanks.
2. **Partial overlap with a bubble.** Listed as invalid in §8; it may be simpler to clip the bubble.
3. **Should `excise-interval` be reversible?** Integration (a transposon or provirus entering) is the inverse and needs inserted coordinates. Not proposed.

## 11. Migration v5 → v6

- **Purely additive.** `initial.nucleic`, `NucleicState.excised` and the primitive `excise-interval` are new. No existing field, action or alias changes name or meaning. The v5 alias `excise` (base excision) is untouched.
- `migrateV5` sets `schemaVersion: 6` and nothing else. No step is rewritten and no authored document needs editing.
- v1–v5 documents keep loading through the existing chain, and their snapshots are unchanged (I9). The legacy render baselines must stay byte-identical; a v6 fixture set is added beside v2–v5.
- `schema.json` gains the new field and action. An intact molecule still omits `nucleic` from its state.

## 12. Minimal examples

### 12.1 Transcription initiation (A)

Before, v5: the transcript is a whole molecule that is broken and resected.

```yaml
actors:
  - { id: pre-mrna, type: rna, nucleic: { length: 32 }, sites: [{ id: five, at: 4 }] }
steps:
  - id: initiation
    actions:
      - { type: unwind, target: gene.w1 }
      - { type: cleave, target: pre-mrna.five }
      - { type: resect, target: pre-mrna.five, length: 28 }
      - { type: pair, target: pre-mrna, span: [0, 4], with: gene }
  - id: elongation
    actions:
      - { type: extend, target: pre-mrna.five, length: 8 }
```

After, v6: the transcript begins as its first four nucleotides.

```yaml
actors:
  - id: pre-mrna
    type: rna
    nucleic: { length: 32 }
    sites: [{ id: five, at: 4 }]
    initial: { nucleic: { missing: [{ strand: top, from: 4, to: 32 }] } }
steps:
  - id: initiation
    actions:
      - { type: unwind, target: gene.w1 }
      - { type: pair, target: pre-mrna, span: [0, 4], with: gene }
  - id: elongation
    actions:
      - { type: extend, target: pre-mrna.five, length: 8 }   # unchanged
```

No lesion, and nothing to seal at the end.

### 12.2 Splicing (B)

Before, v5: the molecule is destroyed and another is made.

```yaml
- { type: cleave, target: pre-mrna.donor }
- { type: cleave, target: pre-mrna.acceptor }
- { type: degrade, actor: pre-mrna }
- { type: synthesize, product: mrna }      # a different, unrelated actor
```

After, v6: the same molecule, with the intron excised.

```yaml
actors:
  - id: pre-mrna
    type: rna
    nucleic: { length: 36 }
    sites: [{ id: donor, at: 12 }, { id: acceptor, at: 24 }, { id: intron, span: [12, 24] }]
steps:
  - id: splicing
    actions:
      - { type: cleave, target: pre-mrna.donor }      # optional narration
      - { type: cleave, target: pre-mrna.acceptor }
      - { type: excise-interval, target: pre-mrna.intron }
```

State after: `excised: [{ from: 12, to: 24 }]`, no lesion at `donor`, nucleotide 11 bonded to 24, extant length 24. A ribosome with an 8-nt footprint placed from coordinate 8 covers `[8, 12)` and `[24, 28)`.

### 12.3 V(D)J coding joint (B, duplex)

```yaml
actors:
  - id: locus
    type: dna
    nucleic: { length: 120 }
    sites: [{ id: v, span: [10, 40] }, { id: intervening, span: [40, 80] }, { id: j, span: [80, 110] }]
steps:
  - id: joint
    actions:
      - { type: excise-interval, target: locus.intervening }
```

State after: `excised: [{ from: 40, to: 80 }]` on both strands; base pair 39 is adjacent to base pair 80. The V and J sites keep their coordinates.

### 12.4 A molecule that begins spliced (A + B)

No action produced this state, and none is needed (§3.3).

```yaml
actors:
  - id: mrna
    type: rna
    nucleic: { length: 36 }                       # pre-mRNA coordinates
    sites: [{ id: junction, at: 24 }, { id: exon2, span: [24, 36] }]
    initial: { nucleic: { excised: [{ from: 12, to: 24 }] } }
```

First snapshot: nucleotide 11 is bonded to 24; extant length 24. `occupy` over `[8, 28)` covers 8 nucleotides; `cleave mrna.junction` breaks the junction bond; `pair` over `[14, 20)` fails, because nothing is there.

## 13. Implementation outline

1. Core: `initial.nucleic` validation and `initialState`; tests that `extend` continues from an initial 3′ end with no lesion.
2. Core: `excised`, the derived extant/successor helpers, `excise-interval`, the `excised` answer and the checks of §6.8, and the changes of §6 to occupancy, pairing, `resect` and site targeting.
3. Schema v6, `migrateV5`, fixtures and legacy baselines.
4. Renderer: out of scope here. It will need to decide how an excised interval is drawn; until then a molecule with `excised` state has no agreed drawing.

### 13.1 Implementation notes

Steps 1–3 are implemented. Where the text above leaves something open, the code decides as follows:

- **`repair` follows the lesion that is on the site**: a break is read at the boundary, anything else, or no lesion, as a base. So a break at the junction can be cleared through the site that holds it, and `repair` at `a` with no break fails.
- **A legacy point occupancy** (`bind` to a site) on a site that would be wholly excised blocks `excise-interval`, like a span occupant: *release it first*.
- **`extend` reads its 3′ end covalently on its own molecule.** I6 allows a junction to be the edge of a gap (an initial state with `excised [12, 24)` and `missing [24, 36)`); the 3′-terminal nucleotide is then 11, and synthesis continues at 24. The template is still followed by coordinate (§6.5).
- **`unwind` centred on a point site counts extant nucleotides** either side of it, as footprints do.
