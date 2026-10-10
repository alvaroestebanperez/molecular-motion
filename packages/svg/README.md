# @molecular-motion/svg

SVG renderer of [Molecular Motion](https://molecular-motion.alvaroesteban.dev/), an open-source TypeScript library for creating interactive and animated molecular biology visualizations. It lays out a compiled step of a mechanism (proteins, DNA, RNA, membranes and their interactions) and serialises it to accessible SVG. It runs without a browser.

```bash
npm install @molecular-motion/core @molecular-motion/svg
```

```ts
import { compileMechanism } from '@molecular-motion/core';
import { parseMechanism } from '@molecular-motion/core/yaml';
import { buildSvgScene, exportSvg, mechanismReservation } from '@molecular-motion/svg';

const mechanism = compileMechanism(parseMechanism(yamlSource));
// Space reserved from every step, so regions stay where they are from one step to the next.
const reservation = mechanismReservation(mechanism);
const scene = buildSvgScene(mechanism.at(0), { reservation });
const file = exportSvg(scene, { theme: 'light' });   // a standalone SVG document, styles included
```

- `renderSvg(scene)` gives the markup alone, to be styled with `molecularMotionCss`.
- `exportPng` rasterises in a browser.
- `geometryFrame` and `interpolateGeometry` give the geometry between two steps, for hosts that animate.

For a ready-made player use [`@molecular-motion/react`](https://www.npmjs.com/package/@molecular-motion/react).

See the [repository](https://github.com/alvaroestebanperez/molecular-motion) for the language, the examples and the design documents. MIT licensed.
