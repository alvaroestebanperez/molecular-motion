# @molecular-motion/core

Framework-agnostic compiler and state engine for [Molecular Motion](https://github.com/alvaroestebanperez/molecular-motion): it parses and validates a mechanism written in YAML or JSON and folds its steps into immutable, seekable snapshots. No DOM, no rendering.

```bash
npm install @molecular-motion/core
```

```ts
import { compileMechanism } from '@molecular-motion/core';
import { parseMechanism } from '@molecular-motion/core/yaml';

const mechanism = compileMechanism(parseMechanism(yamlSource));
const snapshot = mechanism.at('damage');   // by step id or index, O(1)
snapshot.actors;                            // resolved state of every actor at that step
```

- `parseMechanism` reads YAML and is in its own entry, `@molecular-motion/core/yaml`: the main entry loads no YAML parser. A document that is already parsed goes straight to `compileMechanism` or `validateMechanism`.
- `schemaVersion` 1 to 6 are accepted, and older documents are migrated automatically.
- `schema.json` is the JSON Schema of the current version, generated from the action registry.
- Custom actions are registered with `builtinRegistry.extend([...])`.

To draw a snapshot use [`@molecular-motion/svg`](https://www.npmjs.com/package/@molecular-motion/svg); for a player, [`@molecular-motion/react`](https://www.npmjs.com/package/@molecular-motion/react).

The schema is not stable before `1.0`. The document format is described in [the language](https://github.com/alvaroestebanperez/molecular-motion/blob/main/docs/language.md), and every action in [Actions](https://github.com/alvaroestebanperez/molecular-motion/blob/main/docs/actions.md). See the [repository](https://github.com/alvaroestebanperez/molecular-motion) for the examples and the design documents. MIT licensed.
