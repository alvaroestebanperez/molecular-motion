# Repeated modification markers

`Modification` remains the semantic source (`kind`, `label`, `length`, optional site).
No actor or interaction is created for a repeated unit. Schema v5 and core are unchanged.

`resolveModificationVisualProfile` is the only lookup from semantic kind to repeated
appearance. Its default catalog maps ubiquitination to small protein surfaces (radius
10); unknown kinds and PAR retain the exact legacy bead path. A caller may replace the
catalog through the narrow `buildSvgScene(snapshot, { modificationProfiles })` option.
An empty catalog explicitly selects legacy rendering for every kind.

```ts
const scene = buildSvgScene(snapshot, {
  modificationProfiles: {
    'custom-modification': {
      marker: 'protein-surface',
      radius: 10,
      fill: '#e39467',
      seed: 'fixed-visual-seed',
      gap: 4.5,
      curl: 0.24,
    },
  },
});
const svg = exportSvg(scene);
```

The scene's existing chain carries an optional immutable resolved profile. It contains
no semantic kind. This is derived SVG presentation, not core state or a general
presentation context; it lets layout, rendering and export consume the same profile
without another lookup or hidden global registration. Existing profile-less scenes
retain their shape and markup.

`RepeatedMarker` geometry accepts only visual properties, count, direction and carrier
geometry. It produces unit positions, links, contact particles and bounds. Protein units
reuse the shared deterministic compact surface (eight particles), without actor states,
halos or interaction identity. The generic renderer also supports bead units. The visual
count is capped at 16; the semantic modification length is never rewritten.

Contacts use the marker particles, collisions use those particles or conservative unit
envelopes, and thumbnail/export framing uses the same bounds. Geometry cache keys include
the profile. No kind, actor-ID or mechanism-ID rules select marker appearance downstream.

PAR is intentionally not migrated: its existing positions, branches, markup and styles
remain byte-identical. The existing limitation of one displayed length-bearing
modification per carrier remains.

The p53–MDM2 example is a narrated eight-step cycle. Stabilization, expression and tag
recycling are explicitly schematic; no kinetics are implied. DNA engagement uses span
occupancy and leaves with `vacate`. The proteasome remains a generic complex.

## Tags

A third marker, `tag`, is one small labelled disc adhered to the carrier's surface, for a
modification without a length. The default catalog maps phosphorylation to it. Like every
profile it is appearance only: where on the carrier it sits is decided by the scene from the
modification's site (see `docs/membrane-scenes.md`), never by the profile. The standalone
`renderModificationPrimitive` keeps its own labelled tag for these kinds.
