# Changelog

The three packages, `@molecular-motion/core`, `@molecular-motion/svg` and `@molecular-motion/react`, are versioned and released together.

Before `1.0` the schema is not stable. A new `schemaVersion` may arrive in a minor release; documents written for an earlier one keep loading, migrated automatically.

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
