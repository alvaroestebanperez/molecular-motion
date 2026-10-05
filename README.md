<div align="center">

# Molecular Motion

**A declarative engine for building interactive molecular biology mechanisms on the web.**

[![CI](https://github.com/alvaroestebanperez/molecular-motion/actions/workflows/ci.yml/badge.svg)](https://github.com/alvaroestebanperez/molecular-motion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-22d3ee.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![Status: experimental](https://img.shields.io/badge/status-experimental-f59e0b.svg)](#roadmap)

[Demo](https://molecular-motion.alvaroesteban.dev/) · [Visual language](https://molecular-motion.alvaroesteban.dev/#/visual-language) · [YAML examples](examples/) · [Contributing](CONTRIBUTING.md)

</div>

Molecular Motion turns a YAML or JSON description of **actors, molecular sites, steps, and biological actions** into an animated, navigable SVG. Researchers and educators describe the mechanism; the engine handles layout, state, rendering, controls, and accessibility.

> [!IMPORTANT]
> Molecular Motion is an early MVP. Its schema will evolve before the first stable release and its visualizations are explanatory models—not clinical decision tools.

## Demo

The [demo](https://molecular-motion.alvaroesteban.dev/) opens on the mechanism viewer: a step timeline, the animated figure with playback controls, the explanation, key events and references for each step, and thumbnails of the whole story. The [visual language](https://molecular-motion.alvaroesteban.dev/#/visual-language) documents the reusable programmatic primitives for proteins, molecules, nucleic acids, lesions, modifications, membranes, compartments and molecular events. The [playground](https://molecular-motion.alvaroesteban.dev/#/playground) places an editable YAML document next to the generated mechanism; change an actor, target, or action and the preview updates immediately.

Run it locally:

```bash
git clone https://github.com/alvaroestebanperez/molecular-motion.git
cd molecular-motion
npm install
npm run dev
```

The repository includes six mechanisms to exercise different parts of the language:

- [PARP1-mediated single-strand break repair](examples/parp1-ssb-repair.yaml)
- [Homologous recombination: from the break to an intact chromatid by strand invasion, synthesis on the sister chromatid and annealing (SDSA)](examples/homologous-recombination.yaml)
- [EGFR activation by ligand-induced dimerization](examples/egfr-dimerization.yaml)
- [p53–MDM2 negative feedback](examples/p53-mdm2-feedback.yaml)
- [cGAS–STING sensing of cytosolic DNA](examples/cgas-sting.yaml)
- [Gene expression: a transcript that begins as its first nucleotides, and splicing by excision](examples/gene-expression.yaml)

## Install

```bash
npm install @molecular-motion/core @molecular-motion/svg     # figures, with or without a browser
npm install @molecular-motion/core @molecular-motion/react   # the React player
```

The packages are ES modules and need Node.js 20 or newer. `@molecular-motion/react` needs React 18 or newer. The three are versioned together; see the [changelog](CHANGELOG.md).

Without React, a compiled step becomes a standalone SVG in a few lines, in Node or in a browser:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
import { buildSvgScene, exportSvg, mechanismReservation } from '@molecular-motion/svg';

const mechanism = compileMechanism(parseMechanism(readFileSync('mechanism.yaml', 'utf8')));
// Space reserved from every step, so regions stay where they are from one step to the next.
const reservation = mechanismReservation(mechanism);

for (let step = 0; step < mechanism.length; step += 1) {
  const snapshot = mechanism.at(step);
  writeFileSync(`${snapshot.step.id}.svg`, exportSvg(buildSvgScene(snapshot, { reservation }), { theme: 'light' }));
}
```

## Why Molecular Motion?

Interactive pathway figures are usually written as one-off combinations of SVG markup, animation code, and scientific content. That makes them expensive to create and difficult to review, update, reuse, or reproduce.

Molecular Motion separates those concerns:

- **Scientists author structured biology**, not animation code.
- **Definitions are reviewable and versionable** alongside data and manuscripts.
- **One mechanism can use different renderers or visual themes.**
- **Navigation is deterministic:** moving backward, forward, or directly to a step always produces the same state.
- **Accessibility is part of the renderer contract**, including keyboard interaction, SVG text alternatives, and reduced-motion behavior.
- **Framework adapters stay thin.** The compiler and state engine do not depend on React or the DOM.

The aim is not to reproduce atomistic simulations. Molecular Motion communicates causal, spatial, and temporal relationships in molecular mechanisms at the level used in reviews, lectures, pathway explainers, and scientific websites.

## A mechanism in YAML

```yaml
schemaVersion: 6

mechanism:
  id: parp1-ssb-repair
  name: PARP1-mediated SSB repair

compartments: [nucleus]

actors:
  - id: dna
    type: dna
    compartment: nucleus
    nucleic: { length: 60 }   # base pairs; coordinates run 0 … 60
    sites:
      - id: lesion
        type: single-strand-break
        at: 30                # between nucleotides 29 and 30
        strand: top

  - id: parp1
    type: protein
    label: PARP1
    compartment: nucleus
    initial: { activity: inactive }

  - id: xrcc1
    type: protein
    label: XRCC1
    compartment: nucleus

steps:
  - id: damage
    title: Single-strand break
    actions:
      - type: cleave
        target: dna.lesion

  - id: recognition
    title: PARP1 detects the break
    actions:            # a list runs in sequence
      - type: bind
        actor: parp1
        target: dna.lesion
      - type: activate
        actor: parp1
        by: dna

  - id: parylation
    title: PAR synthesis
    actions:
      - type: parylate
        actor: parp1
        length: 9

  - id: recruitment
    title: XRCC1 recruitment
    actions:
      - type: recruit
        actor: xrcc1
        target: parp1
```

Targets use `actor.site` references. Sites on DNA and RNA have an interbase coordinate (`at`, or `span: [from, to]`) and a `strand`: `top` runs 5′→3′ as the coordinate grows, and `bottom` is antiparallel. The validator catches unknown actors, sites, compartments, and actions, as well as misspelled fields, before the renderer runs. The compiler also rejects biologically impossible sequences, such as ligating a site that has no break or binding an actor that was degraded.

`schemaVersion: 1` to `5` documents are still accepted and migrated automatically. The design of the schema is described in [RFC 0001](docs/rfcs/0001-schema-v2.md), and nucleic-acid geometry (v3) in [RFC 0004](docs/rfcs/0004-nucleic-acid-geometry.md).

Several copies of one molecule are declared with `copies: n` and addressed as `id#1 … id#n`. Each copy has its own state but the same silhouette and colour ([RFC 0005](docs/rfcs/0005-assemblies-and-occupancy.md)).

Strands of two nucleic acids can base-pair. A top-level `alignments` list declares which ranges correspond, and `pair` / `unpair` change the pairing that actually exists; neither unwinds nor anneals a duplex ([RFC 0006](docs/rfcs/0006-nucleic-acid-pairing.md), schema v5).

A nucleic acid may begin with only part of itself present: `initial.nucleic` takes the strand state of a snapshot (`missing`, `nascent`, `open`, `excised`), so a transcript can start as its first nucleotides and grow with `extend`. `excise-interval` removes an internal interval and makes its flanks covalent neighbours, as in splicing or a V(D)J coding joint. Coordinates are never renumbered, so sites and alignments keep their meaning ([RFC 0007](docs/rfcs/0007-initial-extent-and-excision.md), schema v6). The viewer draws the molecule closed, with its flanks joined at a junction mark ([ADR 0002](docs/adr/0002-drawing-excision.md)).

## React

```tsx
import { parseMechanism } from '@molecular-motion/core';
import { MolecularMechanism } from '@molecular-motion/react';
import source from './parp1.yaml?raw';

const mechanism = parseMechanism(source);

export function RepairFigure() {
  return (
    <MolecularMechanism
      definition={mechanism}
      initialStep="damage"
      controls
      onStepChange={(snapshot) => {
        console.log(snapshot.step.id);
      }}
      onActorSelect={(actorId) => {
        console.log(actorId);
      }}
    />
  );
}
```

`MolecularMechanism` is a compact, self-contained player. For richer layouts, compose the building blocks the demo dashboard uses:

```tsx
import {
  MechanismStage, PlaybackControls, StepDetails, StepThumbnails, StepTimeline, useMechanismPlayer,
} from '@molecular-motion/react';

function MechanismPage({ definition }) {
  const player = useMechanismPlayer(definition);
  return <>
    <StepTimeline player={player} />
    <MechanismStage mechanism={player.mechanism} stepIndex={player.stepIndex} ghosts={player.upcoming} />
    <PlaybackControls player={player} />
    <StepDetails player={player} />      {/* Explanation · Molecular details · References */}
    <StepThumbnails player={player} />
  </>;
}
```

Consecutive steps morph instead of re-rendering: actors glide to new positions, upcoming actors wait out of focus and come into focus when they appear. Everything is themed through `--mm-*` CSS custom properties and follows `[data-theme=dark]` or the OS preference.

### Visual vocabulary

The same code-native SVG language is available independently of a complete mechanism:

```tsx
import { MolecularGlyph, VisualVocabulary } from '@molecular-motion/react';

<MolecularGlyph item="kinase" />
<MolecularGlyph item="parylation-branched" state="active" />
<VisualVocabulary categories={['dna-damage', 'modifications']} />
```

The built-in catalog covers common catalytic activities, non-catalytic proteins, cofactors, nucleic-acid structures, DNA lesions, PTMs, and compartments. Presentation profiles describe a protein glyph on three independent dimensions, `architecture` (global shape), `fold` and `disorder`, in the visual catalog ([appearance guide](docs/protein-appearances.md)). Inhibited proteins use a soft red contour halo; T-bars mark inhibition actions. Applications can also pass custom catalog entries. See [RFC 0003](docs/rfcs/0003-visual-vocabulary.md).

### Step metadata and references

Each step can carry a `summary`, a `description`, ordered `keyEvents`, and `references` to entries in a top-level `references` list. References are structured identifiers (`pmid`, `doi`, `reactome`, `url`) so they stay resolvable. See [RFC 0002](docs/rfcs/0002-step-references-and-viewer.md) and the [PARP1 example](examples/parp1-ssb-repair.yaml).

JSON definitions can be passed directly. YAML is parsed once into the same typed definition:

```ts
import { compileMechanism, parseMechanism } from '@molecular-motion/core';

const mechanism = compileMechanism(parseMechanism(yaml));
const state = mechanism.at('recruitment');
```

## Export

Any step can be saved as a figure for a manuscript, slide or poster. `exportSvg` produces a standalone file: styles embedded, the theme resolved (`light` or `dark`, never the viewer's OS preference), an explicit pixel size, no interactive roles, and every animation frozen in its final state. Callouts that the interactive viewer lets overflow the canvas are kept by growing the `viewBox`. In the browser, `exportPng` rasterises that file.

```ts
import { buildSvgScene, exportPng, exportSvg } from '@molecular-motion/svg';

const svg = exportSvg(buildSvgScene(mechanism.at('filament')), { theme: 'light', scale: 2 });
const png = await exportPng(svg, { pixelRatio: 2 });   // Blob, browser only
```

Pass `compact: true` for a thumbnail cropped to the action, and `background: false` for a transparent figure. The demo offers both downloads for the current step.

## Architecture

```text
YAML / JSON
    │
    ▼
parse + semantic validation       @molecular-motion/core
    │
    ▼
deterministic timeline reducer    @molecular-motion/core
    │
    ▼
framework-neutral scene graph     @molecular-motion/svg
    │
    ├──► SVG string
    │
    └──► React player             @molecular-motion/react
```

| Package | Responsibility | Browser required? |
| --- | --- | --- |
| `@molecular-motion/core` | Schema, YAML/JSON parsing, validation, compilation, timeline snapshots | No |
| `@molecular-motion/svg` | Automatic layout, scene graph, accessible SVG output | No |
| `@molecular-motion/react` | Player state, controls, selection, autoplay, React lifecycle | Yes |
| `@molecular-motion/demo` | Editable playground and integration example | Yes |

During compilation, actions are applied once in step order and an immutable snapshot is stored at each step boundary. Seeking retrieves the precomputed snapshot in O(1), and the renderer derives the scene from that state. This makes navigation deterministic and keeps scientific state independent from transient animation state.

### Vocabulary

Actors: `dna`, `rna`, `protein`, `molecule`, and `complex`, optionally placed in declared **compartments** (`extracellular`, `membrane`, `cytoplasm`, `nucleus`, `er`, `golgi`, `mitochondrion`, `endosome`, or custom ones).

A `molecule` actor may name its structure with an optional `molecule` key from the small-molecule vocabulary (`atp`, `adp`, `gtp`, `gdp`, `nad-plus`, `nadh`, `cgamp`, `glucose`, `calcium`, `zinc`), for example `molecule: nad-plus`. The viewer then draws the same topology glyph as the visual language; without a key, or with an unknown one, it draws a generic ball-and-stick glyph. The renderer never infers structure from the label.

Actions come from an extensible **registry**. A small set of primitives defines every state transition:

`bind` · `unbind` · `set-state` · `modify` · `translocate` · `synthesize` · `degrade` · `cleave` · `ligate`

Biological verbs are aliases that expand to those primitives while keeping their own wording in captions:

`recruit` · `activate` · `inactivate` · `inhibit` · `phosphorylate` · `dephosphorylate` · `ubiquitinate` · `parylate` · `polymerize` · `damage` · `excise` · `fill-gap` · `repair` · `show` · `hide`

Actions in a step run in sequence. Wrap them in `parallel:` when they happen at the same time; parallel branches may not change the same state. Custom actions are registered with `builtinRegistry.extend([...])` and passed to `parseMechanism` / `compileMechanism` through `{ registry }`.

Definitions may supply an explicit actor position when the automatic layout is not scientifically or visually appropriate. Coordinates remain an escape hatch, not the primary authoring model.

## Repository layout

```text
packages/
  core/       # language and deterministic state engine
  svg/        # layout, scene graph and SVG serializer
  react/      # player hook, animated stage, timeline, details, thumbnails
apps/
  demo/       # mechanism viewer and live YAML playground
examples/     # complete mechanism definitions
```

## Roadmap

- [x] Versioned YAML/JSON schema and semantic validation
- [x] Deterministic, seekable mechanism state
- [x] Automatic SVG layout with manual position overrides
- [x] Keyboard-accessible React player with reduced-motion support
- [x] Live editor with PARP1 and homologous recombination examples
- [x] Sequential and parallel action groups within a step
- [x] Extensible action registry, compartments, and typed actor state
- [x] Nucleic-acid coordinates, strand polarity, resection, synthesis and unwinding ([RFC 0004](docs/rfcs/0004-nucleic-acid-geometry.md))
- [x] Pairing between nucleic-acid molecules: strand invasion, displaced strands, synthesis on another molecule ([RFC 0006](docs/rfcs/0006-nucleic-acid-pairing.md))
- [x] Nucleic acids that begin partial, and internal excision with resealing, in the core ([RFC 0007](docs/rfcs/0007-initial-extent-and-excision.md))
- [x] Drawing an excised interval: the molecule closes about its centre, and the closure is animated ([ADR 0002](docs/adr/0002-drawing-excision.md))
- [x] Compartment-aware layout: an actor's resolved compartment decides the band it is drawn in, nucleic acids included ([ADR 0003](docs/adr/0003-compartment-aware-layout.md))
- [ ] Pairing loops across a junction
- [ ] Strand exchange between molecules: nuclease resolution of junctions, crossovers, flaps
- [x] Actor copies, interaction graph with interfaces, and footprint occupancy on nucleic acids ([RFC 0005](docs/rfcs/0005-assemblies-and-occupancy.md))
- [x] Per-step references, key events, and summaries
- [x] Review-figure SVG language: helix with depth, molecular surfaces, lesion states, PAR chains, callouts
- [x] Dashboard viewer: timeline, animated stage, step details, thumbnails, light/dark themes
- [ ] Camera actions, scene-anchored annotations, and deep links
- [ ] Themes and renderer/action plugin APIs
- [ ] Framework-agnostic Web Component
- [x] Export to standalone SVG and PNG
- [ ] Export to video
- [ ] Visual editor and schema-aware YAML language service
- [x] Published npm packages: [`@molecular-motion/core`](https://www.npmjs.com/package/@molecular-motion/core), [`@molecular-motion/svg`](https://www.npmjs.com/package/@molecular-motion/svg) and [`@molecular-motion/react`](https://www.npmjs.com/package/@molecular-motion/react)
- [ ] Stable `1.0` schema

See an important biological primitive missing? [Open a proposal](https://github.com/alvaroestebanperez/molecular-motion/issues/new) describing the concept independently from its desired animation.

## Contributing

Contributions from molecular biologists, educators, designers, accessibility specialists, and developers are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and run `npm run check` before opening a pull request.

Scientific corrections should include a primary source or authoritative review. Changes to the declarative language should update the TypeScript types, JSON Schema, tests, documentation, and at least one example together.

## License

Molecular Motion is available under the [MIT License](LICENSE).
