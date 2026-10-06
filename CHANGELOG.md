# Changelog

The three packages, `@molecular-motion/core`, `@molecular-motion/svg` and `@molecular-motion/react`, are versioned and released together.

Before `1.0` the schema is not stable. A new `schemaVersion` may arrive in a minor release; documents written for an earlier one keep loading, migrated automatically.

## Unreleased

- **`schemaVersion: 7`: covalent continuity between molecules** ([RFC 0008](docs/rfcs/0008-covalent-continuity.md)), in `@molecular-motion/core` only. Documents with `schemaVersion` 1 to 6 are migrated automatically, and produce the snapshots they produced before.
  - New primitive `reconnect-strands`: at two point sites that an alignment puts opposite each other, one strand of each of two molecules continues as the other. It clears a break at either site, and applied again at the same sites it undoes itself. With it a double Holliday junction can be resolved as a crossover or as a non-crossover.
  - New state `joins` in a snapshot: directed covalent bonds between strands of different molecules. It is absent while there are none. No nucleotide moves and no coordinate is renumbered.
  - New derived readings, exported from core: `covalentSuccessor`, `covalentPredecessor`, `covalentStrands`, `productsOf`, `joinedTo`, `bondAt` and `nucleotidePresent`.
  - `resect` and `extend` stop at a join, `excise-interval` is refused over or beside one, and `degrade` of a joined molecule is refused. `translocate` is unchanged.
  - `migrateV6` is exported, and the schema of version 6 is archived as `schema.v6.json`.
- **Joined strands are drawn** ([ADR 0004](docs/adr/0004-drawing-covalent-joins.md)), in `@molecular-motion/svg` and `@molecular-motion/react`. A document without joins renders exactly as before.
  - Every molecule stays on its own row, and a link draws each covalent bond between two molecules, in place of the backbone that used to run through that boundary. A crossover and a non-crossover are now different figures.
  - A strand drawn beside a pairing partner that a join continues ends at the link, and no longer eases back to its own row.
  - A break at a joined bond removes its link, and labels the two ends it exposes with their 5′ and 3′, each where its own molecule is drawn.
  - A step that adds or removes a join cross-fades between the two drawings. `describeScene` says which strand continues as which.
  - A scene carries `joins`, and the markup a `joins` layer, only when there are any. `nucleicLayerMarkup` also returns `joins`.
  - Not done: a colour per molecule of origin, any layout of the products, and routing of links that cross or crowd.
- The JSON Schemas are published at `https://molecular-motion.alvaroesteban.dev/schema/v<n>.json`, and every schema names that address as its `$id`. The previous `$id` pointed to a domain that served nothing. `SCHEMA_BASE_URL` is exported from core.

## 0.2.0

**Breaking: `parseMechanism` moves to `@molecular-motion/core/yaml`.**

```diff
- import { compileMechanism, parseMechanism } from '@molecular-motion/core';
+ import { compileMechanism } from '@molecular-motion/core';
+ import { parseMechanism } from '@molecular-motion/core/yaml';
```

Nothing else changes: the function, its arguments and what it returns are the same, and so are the language and every figure.

Why: the main entry of core imported the YAML parser, and a bundler kept it in every page that used core, `svg` or `react`, even one that never parsed YAML. The main entry now imports no package at all. A page that receives its mechanisms already parsed loads no parser, without a rule of its own: about 39 KB less (11 KB gzip). A page that parses YAML imports the new entry, and only then is the parser loaded.

- The main entry keeps `compileMechanism` and `validateMechanism`, which take a parsed document.
- `@molecular-motion/svg` and `@molecular-motion/react` use only the main entry.
- The rule 0.1.1 needed (`treeshake.moduleSideEffects` or similar) can be removed.

## 0.1.1

Lighter pages for sites that inline figures. No change to the language or to how anything is drawn.

- **`exportSvg` with `theme: 'auto'`** fixes no colours, so one inlined copy of a figure serves the light and the dark theme of the page. The default is unchanged: a standalone file with its theme resolved.
- **`exportSvg` with `styles: false`** leaves the stylesheet out of the figure, and **`exportCss`** is that stylesheet, to be included once per page.
- **`"sideEffects": false`** in the three packages. None of them does anything when imported, so bundlers can drop the parts of them a page does not use.

Known limit: this does not remove the YAML parser. The main entry of `@molecular-motion/core` imports `yaml`, and `yaml` does not declare itself free of side effects, so a bundler keeps it in any page that imports core, `svg` or `react`, even one that never parses YAML. That is about 39 KB minified (11 KB gzip). Until core has an entry without it, a site that wants it gone needs its own rule, for example `treeshake.moduleSideEffects` in Rollup or Vite.

## 0.1.0

The first release. It fixes `schemaVersion: 6` as the current language.

### Language (`@molecular-motion/core`)

- Mechanisms in YAML or JSON: actors (`dna`, `rna`, `protein`, `molecule`, `complex`), sites, compartments, and steps made of actions that run in sequence or in parallel.
- An extensible action registry. A small set of primitives defines every state change, and biological verbs are aliases of them. `schema.json` is generated from the registry.
- Compilation folds every step once into immutable snapshots, so seeking is O(1) and deterministic. Impossible sequences are rejected: binding a degraded actor, ligating a site with no break.
- Nucleic acids with interbase coordinates and strand polarity: resection, templated synthesis, unwinding and annealing ([RFC 0004](docs/rfcs/0004-nucleic-acid-geometry.md)).
- Copies of an actor, an interaction graph with interfaces and valence, and footprint occupancy on nucleic acids ([RFC 0005](docs/rfcs/0005-assemblies-and-occupancy.md)).
- Base pairing between molecules through declared alignments: strand invasion, synthesis on another molecule ([RFC 0006](docs/rfcs/0006-nucleic-acid-pairing.md)).
- Nucleic acids that begin partial, and `excise-interval`, which removes an internal interval and joins its flanks without renumbering coordinates ([RFC 0007](docs/rfcs/0007-initial-extent-and-excision.md)).
- Documents with `schemaVersion` 1 to 5 are migrated automatically.

### Figures (`@molecular-motion/svg`)

- Automatic layout and an accessible SVG of each step, without a browser. Export to a standalone SVG, and to PNG in a browser.
- A code-native visual language: helix with depth, protein surfaces, small molecules, lesions, modifications, callouts.
- Membranes, with actors that span them, and compartments drawn as bands. An actor's resolved compartment decides the band it is drawn in, nucleic acids included ([ADR 0003](docs/adr/0003-compartment-aware-layout.md)).
- An excised interval is drawn closed, with its flanks joined at a junction mark ([ADR 0002](docs/adr/0002-drawing-excision.md)).
- Geometry between two steps, for hosts that animate ([ADR 0001](docs/adr/0001-nucleic-geometry-animation.md)).

### Player (`@molecular-motion/react`)

- `MolecularMechanism`, a self-contained player, and the building blocks of a dashboard: stage, timeline, playback controls, step details and thumbnails.
- Steps morph into one another. Keyboard accessible, with light and dark themes, and no animation under `prefers-reduced-motion`.

### Known limits

- The schema will change before `1.0`.
- A scene draws one membrane. Moving between two membrane compartments relabels it.
- A strand paired with both flanks of an excised interval is drawn as two pairings, without the loop between them.
- Figures are explanatory models. They carry no stoichiometry or kinetics, and are not clinical decision tools.
