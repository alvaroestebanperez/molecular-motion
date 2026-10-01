# RFC 0003 — Composable molecular visual vocabulary

- **Status:** proposed, implemented on `feat/visual-vocabulary`
- **Builds on:** [RFC 0002](0002-step-references-and-viewer.md)

## 1. Goal

Molecular Motion needs a consistent visual language that can cover more than one repair pathway without turning every figure into bespoke SVG. The vocabulary therefore exposes reusable primitives and semantic presets for:

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
SVG primitives             Semantic catalog              React composition
proteinSurface             kinase                        MolecularGlyph
smallMolecule      ──────▶ ATP / NADH / Ca²⁺     ──────▶ VocabularyCard
nucleicAcid                DSB / PARylation               VisualVocabulary
```

1. **Primitives** know geometry but no biology: a deterministic molecular surface, ball-and-stick molecule, and nucleic-acid strand.
2. **Catalog entries** provide identity, category, accessible description, color, and illustrative labels.
3. **React components** handle responsive layout and theming. They do not recreate the SVG artwork.

This separation lets a future editor use the same `MolecularGlyph` in a palette and a mechanism renderer use the same primitives in an animated scene.

## 3. Public API

```tsx
import { MolecularGlyph, VisualVocabulary } from '@molecular-motion/react';

<MolecularGlyph item="kinase" />
<MolecularGlyph item="parylation" state="active" />
<VisualVocabulary categories={['lesions', 'modifications']} />
```

Framework-neutral consumers use `renderVocabularyGlyph`, `proteinSurface`, `smallMolecule`, and `nucleicAcid` from `@molecular-motion/svg`.

Every standalone glyph has a `<title>` and `<desc>`. Inside a named card it becomes decorative to avoid duplicate announcements. Geometry is deterministic so the same preset can participate in stable transitions.

## 4. Deliberate boundary with the mechanism schema

The initial catalog does **not** add dozens of new actor types or action verbs to schema v2. “Kinase” describes a protein's role; it is not a new physical actor type. “Phosphorylation” is a modification state; it is not a renderer instruction.

The next schema RFC may add an optional visual hint such as `visual.preset: kinase`. Until then, the vocabulary is independently useful as a component library and the current mechanism renderer remains fully backward compatible.

## 5. Follow-ups

- Reuse the primitives inside the main scene renderer instead of its older private equivalents.
- Define an optional, themeable `visual` hint in the mechanism schema.
- Add domain-level protein shapes and membrane topology.
- Add strand polarity, base-pair identity, and richer RNA secondary structure.
- Let applications register catalog extensions without forking the built-ins.
