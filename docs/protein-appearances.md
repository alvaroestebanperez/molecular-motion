# Protein visual profiles

Profiles belong to the SVG presentation package and visual catalog. They are not actor fields, core state or additions to schema v5.

```ts
import { resolveProteinVisualProfile, renderProteinPrimitive } from '@molecular-motion/svg';

const visualProfile = resolveProteinVisualProfile({ architecture: 'compact', fold: 'helical-bundle', disorder: 'tail' });
const glyph = renderProteinPrimitive({ visualSeed: 'stable-entity', visualProfile });
```

A profile has three independent dimensions. They are never mixed into one flat list.

| Dimension | Meaning | Values |
| --- | --- | --- |
| `architecture` | Global shape: how the mass is arranged | `surface`, `compact`, `elongated`, `bilobed`, `multidomain`, `crescent`, `y-shaped`, `dimer`, `fibrous`, `ring`, `barrel`, `multisubunit` |
| `fold` | Structural motif of the folded body | `none`, `helical-bundle`, `beta-sandwich`, `beta-propeller`, `alpha-beta` |
| `disorder` | Intrinsic disorder | `none`, `tail`, `extended` |

Each dimension defaults to its first value. The default profile preserves the previous seed-derived silhouette; the legacy `morphology` primitive option still controls its six original silhouette families. No calculation reads activity or uses runtime randomness. Profiles are schematic, with no residue coordinates, PDB claims or encoded stoichiometry.

Not every combination has a drawing. `proteinProfileIssue(profile)` says why one does not, and `resolveProteinVisualProfile` throws on it:

- A `fold` needs a single globular body: `architecture` `surface` or `compact`.
- `disorder: extended` has no folded body: it needs `architecture: surface` and `fold: none`.
- `disorder: tail` combines with any architecture and fold.

`PROTEIN_PROFILE_CATALOG` declares concrete profiles instead of the full product: every architecture, every fold on a compact body, three tails and the extended form. `VocabularyItem.proteinVisual` stores a seed and resolved profile; generic catalog rendering consumes that data without selecting geometry by biological name. A custom catalog item can supply the same profile with any label or ID. The vocabulary is frozen at this set.

## Architecture

`surface` lets the visual seed choose among the silhouette families; `compact`, `elongated`, `bilobed`, `multidomain` and `crescent` pin one. `y-shaped` has two arms and a stem around a hinge. `fibrous` is a long, thin rod. `ring` is an annular assembly. `barrel` shows the far side of its top ring, a dark lumen, then four courses of near-side units that narrow and darken towards the curved edges. `multisubunit` preserves each unit's contour instead of merging the units into a single organic outline.

`dimer` draws two mirrored protomers, each with its own contour. **It is a visual appearance only.** A dimer profile is one glyph for one actor: it creates no second instance, no interface and no interaction, and nothing in core or the scene knows it has two halves. A mechanism that needs two molecules that bind, separate or change state independently must author two actors and a `bind` action.

## Fold

A fold builds the body from the secondary-structure elements themselves, each an even rod with its own contour, so the fold is read from the silhouette at any size and no motif is drawn over a surface. `helical-bundle` packs four or five thick rods side by side. `beta-sandwich` stacks two sheets of thin parallel strands, the far one darker and offset. `beta-propeller` arranges seven twisted blades around a narrow pore. `alpha-beta` is a central sheet of short strands capped by one helix across each end.

There is no `alpha-rich` or `beta-rich`: without a drawing over the surface they would be indistinguishable from `helical-bundle` and `beta-sandwich`.

## Disorder

A disordered region is one continuous polypeptide backbone: a smooth, irregular cord in the protein's own colour, with the same outline and light as a folded surface. Its curvature drifts, so it wanders in loose bends without zigzags or closed rings. It has no beads, links, labels or repeated units, which keeps it distinct from PAR chains, poly-Ub and every other repeated marker.

`tail` appends the cord to a folded body: it leaves from under the body's outermost volume and keeps heading away from it. The body is the one the profile would have without the tail, only scaled so that body and tail fit the radius together. `extended` has no folded body: the whole protein is a loosely gathered cord.

The cord is sampled into overlapping volumes, so contacts, the inhibition halo and modification attachment follow the same path that is drawn.

`activity: inhibited` keeps the same shape, adding a static contour halo of three stacked layers, strongest at the outline, with a minimum pixel width so it stays visible on small glyphs. Surface desaturation is scoped to the protein, leaving modification markers intact. `inhibit` action/relationship arrows retain their T-bar. Reduced motion suppresses the animated active/selection halos; inhibition itself never animates. Theme tokens control the alert colour in light and dark modes.

## Compositions and review

`renderProteinAssembly({ members })` accepts any list of resolved protein primitives, offsets and optional rotations. It contains no biological identity lookup or special complex geometry. The catalog's `COMPOSED_COMPLEX_TEST` supplies a central barrel and two multisubunit caps as a schematic 26S. The labels 20S and 19S occur only in catalog/review data.

## Using a profile or an assembly in a mechanism

A host chooses how to draw an actor when it builds the scene. Nothing is added to the mechanism file, the schema or core state:

```ts
const scene = buildSvgScene(snapshot, {
  proteinVisuals: {
    proteasome: { assembly: COMPOSED_COMPLEX_TEST, extent: 1.6 },
    p53: { profile: resolveProteinVisualProfile({ architecture: 'compact', disorder: 'tail' }) },
  },
});
```

`proteinVisuals` is keyed by actor id and applies to `protein` and `complex` actors; every copy of an actor shares it. Actors without an entry keep their seed-derived silhouette. A visual may declare its natural size with `extent`, relative to a generic actor of the same type (1 when omitted): the scene sizes the actor itself with it, so the drawing is never rescaled on its own. The same radius and particles drive rendering, bounds, framing, contacts, callout collisions, DNA clearance, the inhibition halo and modification attachment. `COMPOSED_COMPLEX_VISUAL` is the composed complex at its natural size. An assembly is still one actor: it adds no instances, interfaces or interactions. `MechanismStage`, `MechanismThumbnail`, `StepThumbnails` and `MolecularMechanism` take the same map as a `proteinVisuals` prop; keep its reference stable between renders.

The demo draws the p53–MDM2 proteasome this way, with `COMPOSED_COMPLEX_VISUAL`. Poly-Ub needs no option: a `modify` action with `kind: ubiquitination` and a `length` already resolves to the repeated-marker profile.

Repeated modification markers keep the existing `Modification → ModificationVisualProfile → repeated markers` path. Catalog framing uses the resolved marker bounds to keep the poly-Ub chain inside its drawing area; no semantic actors or new ubiquitination rendering conditions are added.

Generate the review sheets after building:

```sh
npm run build
node scripts/protein-profile-preview.mjs   # catalog by architecture, fold and disorder
node scripts/p53-sequence-preview.mjs      # every p53–MDM2 step with the composed 26S
```

The catalog sheet is `artifacts/protein-profile-review/comparison.html` plus standalone light/dark SVGs. An optional `MM_SVG_RASTERIZER` path to a locally installed `@resvg/resvg-js` module also creates PNGs without adding a project dependency. The sequence sheets are `artifacts/p53-mdm2-sequence/sequence-{light,dark}.svg`, with one SVG per step beside them.
