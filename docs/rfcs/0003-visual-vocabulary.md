# RFC 0003 — Composable molecular visual vocabulary

- **Status:** implemented
- **Builds on:** [RFC 0002](0002-step-references-and-viewer.md)

## 1. Goal

Molecular Motion needs a consistent visual language that can cover more than one repair pathway without turning every figure into bespoke SVG. The vocabulary therefore exposes reusable primitives and composed documentation scenes for:

- enzymes and catalytic activities;
- non-catalytic proteins;
- small molecules and cofactors;
- nucleic acids and related structures;
- DNA damage and lesions;
- post-translational modifications;
- cellular compartments.

The built-in catalog is a useful default, not a closed ontology. Hosts can filter it, replace entries, or render their own `VocabularyItem` with the same components.

## 2. Three layers

```text
Biological semantics       Resolved scene              Visual primitives       SVG
schema + compiler   ─────▶ SceneState            ─────▶ Protein / DNA   ─────▶ output
                                                        markers / actions
```

1. **Compiler** resolves biological actions into state. It may know that an actor is a kinase; the renderer does not.
2. **Primitives** know geometry and presentation state but no enzyme role. Protein shape is generated from a stable seed without `Math.random()`.
3. **Catalog scenes** demonstrate biological concepts by composing primitives. They are documentation, not renderer branching rules.
4. **React components** handle responsive layout and theming. They do not recreate the SVG artwork.

This separation lets a future editor use the same `MolecularGlyph` in a palette and a mechanism renderer use the same primitives in an animated scene.

## 3. Public API

```tsx
import { MolecularGlyph, VisualVocabulary } from '@molecular-motion/react';

<MolecularGlyph item="kinase" />
<MolecularGlyph item="parylation-branched" state="active" />
<VisualVocabulary categories={['dna-damage', 'modifications']} />
```

Framework-neutral consumers use `renderVocabularyGlyph`, `proteinSurface`, `smallMolecule`, and `nucleicAcid` from `@molecular-motion/svg`.

Every standalone glyph has a `<title>` and `<desc>`. Inside a named card it becomes decorative to avoid duplicate announcements. Geometry is deterministic so the same preset can participate in stable transitions.

## 4. Deliberate boundary with the mechanism schema

The catalog does **not** add enzyme presets or renderer instructions to schema v2. “Kinase” describes a role and a reaction; it is not a protein silhouette. Entity color and seeded shape identify actors, while activity, binding and modifications come from resolved `SceneState`.

Mismatch, crosslink, receptor topology, strand polarity and compartment transitions are supported by standalone primitives but are not all expressible in the current mechanism schema. They remain documented renderer capabilities until a future schema RFC proves that additional biological state is necessary.

## 5. Follow-ups

- Add strand polarity, base-pair identity, and richer RNA secondary structure.
- Define membrane topology and compartment transitions in `SceneState` before building full cGAS–STING or EGFR–MAPK mechanisms.
- Let applications register catalog extensions without forking the built-ins.
