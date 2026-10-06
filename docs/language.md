# The language

A mechanism is one YAML or JSON document: who takes part, where, and what happens step by step. This page describes every part of that document. The actions a step can contain are listed in [Actions](actions.md), which is generated from the compiler.

The design decisions behind the language are in the [RFCs](rfcs/); this page says how to write it.

## A complete document

```yaml
schemaVersion: 6
mechanism:
  id: nick-repair
  name: Repair of a nick
compartments: [nucleus]
actors:
  - id: dna
    type: dna
    compartment: nucleus
    nucleic: { length: 60 }
    sites:
      - { id: nick, at: 30, strand: top }
  - id: ligase
    type: protein
    label: DNA ligase
    compartment: nucleus
steps:
  - id: damage
    title: A nick appears
    actions:
      - { type: cleave, target: dna.nick, lesion: nick }
  - id: repair
    title: Ligase seals it
    actions:
      - { type: recruit, actor: ligase, target: dna.nick }
      - { type: ligate, target: dna.nick, by: ligase }
```

A document is validated when it is parsed, and compiled once: every step is folded into an immutable snapshot of the state after it. Both report errors with the path of what is wrong, such as `steps[1].actions[0]: no strand break to ligate at "dna.nick"`.

## Editor support

The JSON Schema of the language is published at `https://molecular-motion.alvaroesteban.dev/schema/v6.json`, and is also in the core package as `schema.json`. An editor with a YAML language server completes and checks a document that names it in its first line:

```yaml
# yaml-language-server: $schema=https://molecular-motion.alvaroesteban.dev/schema/v6.json
schemaVersion: 6
```

The schema of each earlier version is at the same address with its number, `v1.json` to `v5.json`.

## Top level

| Field | Required | What it is |
|---|---|---|
| `schemaVersion` | yes | `6`. Documents written for versions 1 to 5 are accepted and migrated automatically. |
| `mechanism` | yes | `id`, `name`, and optionally `description` and `references` (ids from the list below). |
| `actors` | yes | The molecules that take part. At least one. |
| `steps` | yes | What happens, in order. At least one. |
| `compartments` | | Where things are. |
| `alignments` | | Ranges of nucleic acids whose strands may pair. |
| `references` | | Citable sources that steps and the mechanism can point to. |

Ids are lowercase, start with a letter, and use letters, digits and hyphens: `rad51`, `er-membrane`. The JSON Schema requires that form.

## Actors

```yaml
- id: egfr
  type: protein
  label: EGFR
  compartment: membrane
  copies: 2
  initial: { activity: inactive }
  interfaces: [{ id: ligand }, { id: dimer }]
  sites: [{ id: y1068, label: Tyr1068 }]
```

| Field | What it is |
|---|---|
| `id` | Required. Unique. May not contain `#`. |
| `type` | Required. `dna`, `rna`, `protein`, `molecule` or `complex`. |
| `label`, `description`, `color` | How it is named and tinted. Presentation only. |
| `compartment` | The compartment it starts in. Must be declared in `compartments`. |
| `sites` | Named places on it that actions can target, as `actor.site`. |
| `copies` | An integer of 2 or more: the actor is that many instances, `id#1` … `id#n`, each with its own state. Not allowed on `dna` and `rna`. |
| `interfaces` | Binding interfaces, each with an `id` and an optional `valence` (default 1): how many partners it can hold at once. Not allowed on `dna` and `rna`. |
| `footprint` | `{ length, form }`: the nucleotides one copy covers when it occupies a nucleic acid. `form` is `single`, `duplex` or `any`. Not allowed on `dna` and `rna`. |
| `nucleic` | `dna` and `rna` only. See below. |
| `molecule` | `molecule` only. A key that names its structure, such as `atp` or `nad-plus`. The core does not interpret it. |
| `position` | `{ x, y }`: a layout override. Never a coordinate. |
| `initial` | The state it begins in. See below. |

An action names an **instance**: the actor id, or `id#n` for an actor with copies. Naming an actor that has copies without a number is an error.

### Initial state

| Field | Default | What it is |
|---|---|---|
| `present` | `true` | `false` for a product that does not exist until a `synthesize`. |
| `visible` | `true` for `dna` and `rna`, `false` otherwise | Whether it is drawn. A hidden actor becomes visible when it is shown or binds. |
| `activity` | none | `active`, `inactive` or `inhibited`. |
| `nucleic` | intact | `dna` and `rna` only: the strand state the molecule begins with. |

`initial.nucleic` takes the strand state of a snapshot. It is state, not an event: nothing is narrated and no lesion is set.

```yaml
- id: transcript
  type: rna
  nucleic: { length: 36 }
  initial:
    nucleic:
      missing: [{ strand: top, from: 4, to: 36 }]   # only its first four nucleotides exist yet
```

- `missing`: nucleotides absent from a strand. A gap, which `extend` can fill.
- `nascent`: nucleotides marked as newly made.
- `open`: duplex only. Stretches where both strands are present but unpaired.
- `excised`: internal intervals removed from the molecule, whose flanks are covalent neighbours.

### Nucleic acids

```yaml
- id: chromosome
  type: dna
  nucleic: { length: 80, form: duplex, strands: { top: { label: Watson } } }
```

- `length`: nucleotides, or base pairs for a duplex. Default 100.
- `form`: `duplex` or `single`. Default `duplex` for `dna`, `single` for `rna`.
- `strands`: an optional label for `top` and `bottom`.

Coordinates are **interbase**: they run from 0 to `length` and name the boundaries between nucleotides. `[from, to]` is the nucleotides between two boundaries, and coordinate `n` alone is the boundary before nucleotide `n`. The `top` strand runs 5′→3′ as the coordinate grows; `bottom` is antiparallel.

Coordinates are never renumbered. After `excise-interval` removes `[12, 24]`, nucleotide 24 is still nucleotide 24, and it is now the neighbour of nucleotide 11.

### Sites

A site is a named place on an actor.

```yaml
sites:
  - { id: break, at: 40 }                       # a point on a nucleic acid
  - { id: overhang, span: [22, 40], strand: top }   # a stretch of one
  - { id: y1068, label: Tyr1068 }               # a residue of a protein
```

| Field | What it is |
|---|---|
| `id` | Required. Unique within the actor. |
| `label`, `type` | How it is named. |
| `at` | Nucleic acids: one coordinate. Read as a boundary by breaks, and as the nucleotide after it by base lesions. |
| `span` | Nucleic acids: `[from, to]`. |
| `strand` | Nucleic acids: `top`, `bottom` or `both`. |
| `position` | `{ x, y }`: a layout override, with no coordinate. |

A site of a nucleic acid has exactly one of `at`, `span` or `position`. A site of any other actor has no coordinate: it may only have a `position`.

A site carries a **lesion**, set by actions: `single-strand-break`, `nick`, `double-strand-break`, `base-damage`, `abasic-site` or `adduct`.

## Compartments

```yaml
compartments:
  - cytoplasm
  - nucleus
  - { id: er-membrane, kind: membrane, label: ER membrane }
```

A string is one of the standard compartments: `extracellular`, `membrane`, `cytoplasm`, `nucleus`, `er`, `golgi`, `mitochondrion`, `endosome`. An object declares a custom one, with an `id`, a `kind` and optionally a `label` and a `parent`.

The kinds are `extracellular`, `membrane`, `cytoplasm`, `nucleus`, `er`, `golgi`, `mitochondrion`, `endosome` and `generic`. The core gives them no behaviour. The renderer draws a compartment of kind `membrane` as a bilayer, and an actor is drawn in the region of the compartment it is in.

## Alignments

An alignment declares that two ranges of nucleic acids correspond, position for position, so their strands *may* pair. It is not state: `pair` and `unpair` change what is actually paired.

```yaml
alignments:
  - { id: sister, between: [chromosome, sister], range: [0, 80] }
  - { id: target, a: { acid: guide, span: [0, 20] }, b: { acid: sister, span: [50, 70] } }
```

- `between` and `range` align the same range of two molecules.
- `a` and `b` align two different ranges, which must be equally long.
- `orientation`: `same` (default) pairs a strand with the other molecule's opposite strand. `opposite` pairs strands of the same name, mirrored.

## Steps

```yaml
steps:
  - id: recruitment
    title: PARP1 finds the break
    summary: PARP1 binds the nick
    description: A longer explanation, shown with the step.
    keyEvents: [PARP1 binds DNA, PARP1 is activated]
    references: [ray-2017]
    actions:
      - { type: recruit, actor: parp1, target: dna.nick }
```

| Field | What it is |
|---|---|
| `id`, `title` | Required. The id is unique and can be used to seek to the step. |
| `summary` | One line, for timelines and thumbnails. |
| `description` | The explanation of the step. |
| `keyEvents` | Ordered, human-readable events. |
| `references` | Ids from the top-level `references`. |
| `actions` | Required. What happens. |

### Order within a step

Actions run in sequence. Two groups change that, and can be nested:

```yaml
actions:
  - parallel:
      - { type: show, actor: "egfr#1" }
      - { type: show, actor: "egfr#2" }
  - sequence:
      - { type: bind, actor: egf, target: "egfr#1" }
      - { type: activate, actor: "egfr#1" }
```

Branches of a `parallel` happen at the same time, and may not change the same piece of state: that is an error, not a race.

### Targets

Actions name what they act on in three ways, and each field of an action says which it takes:

- an **instance**: `parp1`, `rad51#3`;
- a **reference**: an instance or one of its sites, `dna` or `dna.break`;
- a **site**: `dna.break`.

Every action also accepts `by`, the instance that causes it (an enzyme, a ligand, a drug), and `duration` in milliseconds, which only affects presentation.

All actions and their fields are in [Actions](actions.md).

## References

```yaml
references:
  - id: ray-2017
    citation: Ray Chaudhuri & Nussenzweig (2017) Nat Rev Mol Cell Biol
    doi: 10.1038/nrm.2017.53
```

A reference has an `id`, an optional `citation`, and at least one identifier that can be resolved: `pmid`, `doi`, `reactome` or `url`.

## What the compiler refuses

Validation catches what is wrong with the document itself: an unknown actor, site, compartment or action, a misspelled field, a coordinate outside its molecule.

Compilation catches what is impossible in the state a step finds. Some examples:

- binding or modifying an actor that is not present;
- ligating a site with no break, or one whose strand is still missing nucleotides;
- two occupants covering the same nucleotide of the same strand;
- pairing a strand that is already paired, or acting on a nucleotide that was excised;
- two parallel branches changing the same state.

An action is checked against the state it finds, never against how that state came about.

## Custom actions

The actions are a registry, and a document can use more than the built-in ones:

```ts
import { builtinRegistry, compileMechanism, definePrimitive, field, type ActionSpec } from '@molecular-motion/core';

const methylate = definePrimitive<ActionSpec & { actor: string }>({
  type: 'methylate',
  description: 'Add a methyl group to an actor.',
  fields: { actor: field.actor({ required: true }) },
  presentation: { verb: 'methylates' },
  apply(_state, action, ctx) {
    ctx.requirePresent(action.actor).modifications.push({ id: 'methylation', kind: 'methylation', label: 'Me' });
  },
});

const mechanism = compileMechanism(document, { registry: builtinRegistry.extend([methylate]) });
```

`defineAlias` declares a verb that expands to an existing action. `toJsonSchema(registry)` gives the JSON Schema of the language with the registry's actions.
