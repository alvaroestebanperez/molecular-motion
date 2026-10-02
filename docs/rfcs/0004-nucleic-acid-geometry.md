# RFC 0004 — Nucleic-acid geometry: coordinates, strand polarity, and site anchors

- **Status:** accepted
- **Builds on:** [RFC 0001](0001-schema-v2.md), [RFC 0002](0002-step-references-and-viewer.md), [RFC 0003](0003-visual-vocabulary.md) §4–5
- **Roadmap item:** *Rich DNA/RNA geometry, strand direction, and site anchors*

## 1. Problem

A nucleic acid in schema v2 is a featureless helix. Sites only have a layout hint (`position: start | center | end | Point`) that the scene maps to 28 %, 50 %, or 72 % of the canvas width. As a result:

- **Every lesion is drawn on strand 0.** An SSB cannot say which strand is broken, and base damage cannot say which strand carries the modified base.
- **Polarity does not exist in the model.** HR resection runs 5′→3′ and leaves 3′ overhangs. That is the central geometric fact of the pathway, and it cannot be expressed. Today the HR example jumps from "MRN binds" to "RAD51 filament" over an unchanged duplex.
- **Single-stranded regions, unwound bubbles, and newly synthesised DNA** already exist as renderer primitives (`nucleicAcid({ kind: 'ssdna' })`, the `unwound` and elongating states, `showDirectionality`), but no mechanism can reach them. RFC 0003 §4 explicitly left this open "until a future schema RFC proves that additional biological state is necessary".

The repair mechanisms in scope (PARP1/SSB, BER, HR, and later NHEJ/MMR) all prove that need.

## 2. Goals and non-goals

**Goals**

1. A **coordinate system** along each nucleic acid, so sites have a biological position rather than a layout hint.
2. **Named, antiparallel strands** with fixed polarity, so sites and lesions can be placed on one strand.
3. **Typed strand-level state**: missing nucleotides (resected or excised), unwound regions, and nascent (newly synthesised) nucleotides.
4. **Primitives that derive geometry from polarity.** `resect` knows which strand to remove from each side of a break. The author does not.
5. **Byte-identical output** for every existing v2 document.

**Non-goals** (each is a later RFC)

- Pairing *between* two nucleic-acid actors: strand invasion, D-loops, Holliday junctions, template switching. These are multi-partner relations and belong with complexes and stoichiometry (roadmap item *Complex assembly, stoichiometry, and repeated actor instances*).
- Sequence content and base identity beyond the existing `type` label on a site.
- RNA secondary structure (hairpins, stems). RNA is single-stranded and linear here.
- Circular molecules, flipping the drawing orientation, and chromatin.

## 3. Coordinates and strands

```yaml
actors:
  - id: dna
    type: dna
    nucleic:
      length: 80              # nucleotides / base pairs
      form: duplex            # duplex (dna default) | single (rna default)
      strands:                # optional display labels
        top:    { label: Watson }
        bottom: { label: Crick }
    sites:
      - id: break
        at: 40                # interbase coordinate, 0 … length
      - id: oxog
        at: 23                # nucleotide 23 = interval [23, 24)
        strand: bottom
        type: 8-oxoG
```

- **Interbase, 0-based coordinates**, the same convention as BED and UCSC: `at: n` is the boundary between nucleotide *n − 1* and *n*. Breaks and nicks fall *between* nucleotides, so they map onto a boundary. Nucleotide-level lesions (`base-damage`, `abasic-site`, `adduct`) refer to the nucleotide `[at, at + 1)`. A site may instead give a `span: [from, to]` for footprints and patches.
- **Two strands, fixed polarity.** Coordinates increase along `top` from its 5′ end to its 3′ end. `bottom` is antiparallel. A `single` molecule has only `top`. How this is drawn is a renderer convention (§7).
- **`strand`** on a site is `top | bottom | both`. The default depends on the lesion type it receives: `both` for `double-strand-break`, and `top` for every strand-level lesion. That default matches what the renderer draws today.
- **Sites on non-nucleic actors** (`EGFR.Y1068`) are unchanged. `at`, `span`, and `strand` are rejected on actors that are not `dna`/`rna`.

### Compatibility rule

The v2 → v3 migration gives an actor with no `nucleic` block an **implicit `length: 100`**, and turns the legacy layout keywords into coordinates: `start → 28`, `center → 50`, `end → 72`. Independently, the scene maps a coordinate to `x = width · at / length`, and together the two reproduce the current geometry exactly. A `Point` position stays what it always was: a layout override. Its site has **no coordinate**, so it can still be bound and carry lesions, but `resect`, `extend`, and `unwind` reject it. The core never derives a coordinate from pixels.

## 4. State

`ActorState` gains one optional, typed field for nucleic-acid actors. Following RFC 0001 §9.1, state stays closed: there is still no free-form bag.

```ts
export interface StrandRange { strand: 'top' | 'bottom'; from: number; to: number }  // interbase, from < to

export interface NucleicState {
  missing: StrandRange[];   // nucleotides absent from one strand (resected, excised gap)
  nascent: StrandRange[];   // nucleotides synthesised during the mechanism
  open: Array<{ from: number; to: number }>;  // both strands present but unpaired (bubble)
}

export interface ActorState {
  // … RFC 0001 fields
  nucleic?: NucleicState;   // dna / rna only; normalised, merged, sorted ranges
}
```

The rest is derived, not stored. A region is single-stranded where exactly one strand is present, and base pairs exist where both strands are present and the region is not `open`. Because ranges are normalised (merged, sorted, clamped), equality checks and parallel-conflict diffs stay trivial. The diff key is `actors.dna.nucleic.missing`, and so on.

`SiteState.lesion` is unchanged. Its strand comes from the site definition.

## 5. Primitives

| Primitive | Fields | Effect |
|---|---|---|
| `resect` | `target` (site with a break), `length`, `by?` | Removes `length` nt **5′→3′** from every 5′ end at the break |
| `extend` | `target` (site), `length`, `strand?`, `by?` | Adds `length` nt **5′→3′** from a 3′ end at the site: removes them from `missing` and marks them `nascent` |
| `unwind` | `target` (site or span), `length?`, `by?` | Adds an `open` region centred on the site |
| `anneal` | `target` | Removes the `open` region at the site |

### Polarity does the work

For a double-strand break at `b`, the top strand (5′→3′ to the right) has its **3′** end on the left fragment and its **5′** end on the right fragment. The bottom strand is the reverse. 5′→3′ resection therefore removes:

```text
top     5′ ────────────────────────────────3′ ┊             5′ ─────────── 3′
bottom  3′ ────────────────── 5′              ┊3′ ──────────────────────── 5′
                                └────────────┘ └────────────┘
                                bottom [b−L, b) top [b, b+L)
```

That leaves a **3′ overhang** on each side, which is where RAD51 and RPA load. The author writes `resect: { target: dna.break, length: 18 }`, and the engine derives the strands and ranges from polarity. For an SSB or nick on one strand, `resect` removes only the 5′ flank on that strand (an excision gap). `extend` is the mirror operation: polymerases need a 3′-OH, so the engine finds the 3′ end at the site, and `strand` is only needed when both strands offer one.

### Validation (compile-time, during the fold — RFC 0001 §9.4)

- `resect` requires a break at the target (`single-strand-break`, `nick`, `double-strand-break`). It errors if `length` exceeds the distance to the molecule end. It never clamps silently.
- `extend` requires missing nucleotides adjacent to a 3′ end at the site, and cannot extend past them.
- `unwind` requires a `duplex` molecule and both strands present in the range. `anneal` requires an existing `open` region.
- At most one `open` region overlaps any site.

### Existing vocabulary

- `fill-gap` keeps exactly its v2 meaning (lesion → `nick`) and never touches `NucleicState`. Long-patch synthesis is written as an explicit `extend`, followed by `fill-gap` or `ligate`. Each action represents one transformation, so elongation is never hidden inside another verb.
- `cleave`, `ligate`, `repair`, and `damage` are unchanged, and now act on the site's strand.
- No new aliases. The four primitives are the whole addition.

## 6. Semantics and rendering stay separate

Everything in §3–5 is biology: `length`, coordinates, `strand`, and the `missing`, `nascent`, and `open` ranges. The core validates it and folds it, and it never mentions pixels, curves, labels, or colours. Everything below is a renderer decision. It may change between themes or renderers without a schema change, and it must never feed back into the core. Concretely:

- The core does not know that `top` is drawn on top, nor that the molecule is drawn left to right. That reading rule is a renderer convention (§10.3).
- `position: Point` stays a layout override. It is not a coordinate and never reaches `NucleicState`.
- The legacy keyword mapping (`start → 28`, …) lives in the v2 → v3 migration. It is not in the scene.
- Polarity labels, segment shapes, the RAD51 chain following the overhang, and `length → x` scaling are all scene and render concerns, and no core type carries them.

## 7. Rendering

The scene reads `NucleicState` and site strands. It never sees action types.

```ts
export interface SceneStrandSegment { from: number; to: number; x0: number; x1: number; kind: 'paired' | 'single' | 'open' | 'nascent' }
export interface SceneNucleicAcid {
  // … existing fields
  length: number;
  strands: Array<{ id: 'top' | 'bottom'; segments: SceneStrandSegment[] }>;
}
export interface SceneLesion { /* … */ strand: 'top' | 'bottom' | 'both' }
```

- **Missing** ranges are gaps in that backbone with no rungs. **Single** segments relax towards a gentle curve away from the axis, using the existing `ssdna` geometry. **Open** segments separate both strands into a bubble, using the existing `unwound` geometry. **Nascent** segments use the `mm-nucleic__new` style.
- **Polarity labels** (5′/3′) are drawn at strand ends, at break ends, and at overhang termini whenever the actor declares a `nucleic` block. Legacy documents stay unlabelled, which keeps compatibility.
- **Strand-aware lesions**: the gap and marker sit on the declared strand.
- **Bound actors and chains follow the anchor.** An actor bound to a site on single-stranded DNA rests on the remaining strand. A modification chain (`polymerize`, e.g. a RAD51 filament) on such an actor runs *along* the single-stranded segment instead of leaving towards the free side. True stoichiometry (one RAD51 per 3 nt) stays out of scope. The chain is still a single modification with a `length`.
- **Stable keys**: segments are keyed `acid/strand/from`, so `patchSvg` animates resection as the backbone shortening rather than a redraw.
- **Accessibility**: the SVG description gains strand and range information, for example "top strand resected from 40 to 58 (3′ overhang on bottom strand)".

## 8. Schema version

RFC 0001 §9.1 says that a new *kind* of state is a schema change. `NucleicState` is one, so this RFC introduces **`schemaVersion: 3`**:

- Every v2 document is a valid v3 document after an **identity-plus-mapping migration** (`position` keywords → `at`, implicit `length: 100`), applied automatically by `parseMechanism` just as v1 → v2 is.
- A golden test locks the migrated PARP1 and HR scenes to the current v2 output, byte for byte.
- `schema.json` is regenerated from the registry. The v2 schema is kept as `schema.v2.json`.

## 9. Code changes (in reviewable PRs)

| PR | Scope |
|---|---|
| 1. Coordinates | `core/types.ts` (`NucleicDefinition`, `at`/`span`/`strand`), `validate.ts`, `migrate.ts` (v2 → v3), `schema.ts`; `svg/scene.ts` maps `at` → x; golden identity test |
| 2. Strand state | `NucleicState` in `types.ts`, range utilities (normalise/merge/subtract) with property tests, `resect`/`extend`/`unwind`/`anneal` in `actions.ts`, diff keys |
| 3. Rendering | `svg/scene.ts` segments and strand-aware lesions; `render.ts` per-segment backbones, polarity labels, chains along ssDNA; `patchSvg` key test |
| 4. Examples & docs | HR gains a resection step and RAD51 on the 3′ overhang; PARP1 declares the lesion strand; README roadmap; vocabulary page shows a resected end |

PR 1 changes no output. PR 4 is the first PR that intentionally changes an example scene.

## 10. Decisions

1. **Interbase coordinates** *(proposed)* rather than 1-based nucleotides. Breaks are boundaries, and the convention matches BED, which most bioinformatics readers already know.
2. **`top`/`bottom`** *(proposed)* rather than `watson`/`crick` or `+`/`−`. These names are neutral, and display labels are optional.
3. **Fixed left-to-right orientation** *(renderer convention)*. Authors cannot flip a molecule, which keeps "5′ on the left of the top strand" a reliable reading rule. Revisit if two-molecule figures need it.
4. **`schemaVersion: 3`** *(accepted)*, following RFC 0001 §9.1. Migration v2 → v3 is automatic, and existing documents render byte-identically.
5. **`fill-gap` keeps its v2 semantics** *(accepted)*. Long-patch synthesis needs an explicit `extend`.
6. **Semantics and rendering are separate** *(accepted)*, as described in §6.
7. **Multi-molecule pairing stays out** *(accepted)*. Strand invasion, D-loops, and Holliday junctions are not approximated with this model, for example by faking a second molecule as `open` or `nascent` ranges on the first.
8. **Lengths are abstract units** for layout. A 10 kb resection is drawn at the same width as 100 nt. Scale bars and breaks in the axis are deferred.
