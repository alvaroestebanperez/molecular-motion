# @molecular-motion/svg

Scene builder and accessible SVG renderer for [Molecular Motion](https://github.com/alvaroestebanperez/molecular-motion). It lays out a compiled step and serialises it to SVG. It runs without a browser.

```bash
npm install @molecular-motion/core @molecular-motion/svg
```

```ts
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
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
