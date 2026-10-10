# @molecular-motion/react

React player of [Molecular Motion](https://molecular-motion.alvaroesteban.dev/), an open-source TypeScript library for creating interactive and animated molecular biology visualizations with SVG: an animated, keyboard-accessible figure of a molecular mechanism, such as DNA repair or receptor signalling, written in YAML or JSON.

```bash
npm install @molecular-motion/core @molecular-motion/react
```

React 18 or newer is a peer dependency.

```tsx
import { parseMechanism } from '@molecular-motion/core/yaml';
import { MolecularMechanism } from '@molecular-motion/react';

const definition = parseMechanism(yamlSource);

export function Figure() {
  return <MolecularMechanism definition={definition} controls />;
}
```

`MolecularMechanism` is a self-contained player. For a custom layout compose `useMechanismPlayer` with `MechanismStage`, `StepTimeline`, `PlaybackControls`, `StepDetails` and `StepThumbnails`. Styles are injected by the components and themed through `--mm-*` CSS custom properties; `prefers-reduced-motion` is respected.

See the [repository](https://github.com/alvaroestebanperez/molecular-motion) for the language, the examples and the design documents. MIT licensed.
