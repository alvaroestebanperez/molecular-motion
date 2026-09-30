<div align="center">

# Molecular Motion

**A declarative engine for building interactive molecular biology mechanisms on the web.**

[![CI](https://github.com/alvaroesteban/molecular-motion/actions/workflows/ci.yml/badge.svg)](https://github.com/alvaroesteban/molecular-motion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-22d3ee.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![Status: experimental](https://img.shields.io/badge/status-experimental-f59e0b.svg)](#roadmap)

[Demo](https://alvaroesteban.github.io/molecular-motion/) · [YAML examples](examples/) · [Contributing](CONTRIBUTING.md)

</div>

Molecular Motion turns a YAML or JSON description of **actors, molecular sites, steps, and biological actions** into an animated, navigable SVG. Researchers and educators describe the mechanism; the engine handles layout, state, rendering, controls, and accessibility.

> [!IMPORTANT]
> Molecular Motion is an early MVP. Its schema will evolve before the first stable release and its visualizations are explanatory models—not clinical decision tools.

## Demo

The [interactive playground](https://alvaroesteban.github.io/molecular-motion/) places an editable YAML document next to the generated mechanism. Change an actor, target, or action and the preview updates immediately.

Run it locally:

```bash
git clone https://github.com/alvaroesteban/molecular-motion.git
cd molecular-motion
npm install
npm run dev
```

The repository includes two mechanisms to exercise different parts of the language:

- [PARP1-mediated single-strand break repair](examples/parp1-ssb-repair.yaml)
- [Homologous recombination](examples/homologous-recombination.yaml)

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
schemaVersion: 1

mechanism:
  id: parp1-ssb-repair
  name: PARP1-mediated SSB repair

actors:
  - id: dna
    type: dna
    sites:
      - id: lesion
        type: single-strand-break

  - id: parp1
    type: protein
    label: PARP1

  - id: xrcc1
    type: protein
    label: XRCC1

steps:
  - id: damage
    title: Single-strand break
    actions:
      - type: create-lesion
        target: dna.lesion

  - id: recognition
    title: PARP1 detects the break
    actions:
      - type: bind
        actor: parp1
        target: dna.lesion

  - id: parylation
    title: PAR synthesis
    actions:
      - type: polymerize
        actor: parp1
        product: PAR
        length: 9

  - id: recruitment
    title: XRCC1 recruitment
    actions:
      - type: recruit
        actor: xrcc1
        target: parp1
```

Targets use `actor.site` references. The validator catches unknown actors, sites, steps, and unsupported actions before the renderer runs.

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

JSON definitions can be passed directly. YAML is parsed once into the same typed definition:

```ts
import { compileMechanism, parseMechanism } from '@molecular-motion/core';

const mechanism = compileMechanism(parseMechanism(yaml));
const state = mechanism.at('recruitment');
```

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

Every visual frame is derived by replaying actions from the initial definition to the selected step. This event-sourced model makes seeking deterministic and keeps scientific state independent from transient animation state.

### MVP vocabulary

Actors: `dna`, `rna`, `protein`, `molecule`, and `complex`.

Actions: `create-lesion`, `repair-lesion`, `bind`, `recruit`, `unbind`, `polymerize`, `modify`, `show`, and `hide`.

Definitions may supply an explicit actor position when the automatic layout is not scientifically or visually appropriate. Coordinates remain an escape hatch, not the primary authoring model.

## Repository layout

```text
packages/
  core/       # language and deterministic state engine
  svg/        # layout, scene graph and SVG serializer
  react/      # React player
apps/
  demo/       # live YAML playground
examples/     # complete mechanism definitions
```

## Roadmap

- [x] Versioned YAML/JSON schema and semantic validation
- [x] Deterministic, seekable mechanism state
- [x] Automatic SVG layout with manual position overrides
- [x] Keyboard-accessible React player with reduced-motion support
- [x] Live editor with PARP1 and homologous recombination examples
- [ ] Sequential and parallel action groups within a step
- [ ] Rich DNA/RNA geometry, strand direction, and site anchors
- [ ] Complex assembly, stoichiometry, and repeated actor instances
- [ ] Camera actions, annotations, citations, and deep links
- [ ] Themes and renderer/action plugin APIs
- [ ] Framework-agnostic Web Component
- [ ] Export to standalone SVG, PNG, and video
- [ ] Visual editor and schema-aware YAML language service
- [ ] Published npm packages and stable `1.0` schema

See an important biological primitive missing? [Open a proposal](https://github.com/alvaroesteban/molecular-motion/issues/new) describing the concept independently from its desired animation.

## Contributing

Contributions from molecular biologists, educators, designers, accessibility specialists, and developers are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), run `npm run check` before opening a pull request, and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Scientific corrections should include a primary source or authoritative review. Changes to the declarative language should update the TypeScript types, JSON Schema, tests, documentation, and at least one example together.

## License

Molecular Motion is available under the [MIT License](LICENSE).
