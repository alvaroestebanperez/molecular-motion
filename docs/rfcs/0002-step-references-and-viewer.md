# RFC 0002 — Step references, key events, and the viewer contract

- **Status:** proposed, implemented on `feat/viewer-ui`
- **Builds on:** [RFC 0001](0001-schema-v2.md) (schema v2 stays `schemaVersion: 2`; all additions are optional)

## 1. Schema additions

```yaml
mechanism:
  references: [ray-chaudhuri-2017]          # mechanism-wide sources

references:                                 # one list, referenced by id
  - id: ray-chaudhuri-2017
    citation: Ray Chaudhuri & Nussenzweig (2017) Nat Rev Mol Cell Biol
    pmid: "28676700"
    doi: 10.1038/nrm.2017.53
  - id: reactome-ber
    citation: Base Excision Repair
    reactome: R-HSA-73884

steps:
  - id: binding
    title: PARP1 binding                    # short, for timelines and thumbnails
    summary: PARP1 detects and binds SSB    # one line
    description: PARP1 rapidly recognizes … # explanation paragraph
    keyEvents:                              # ordered, human-readable
      - PARP1 zinc fingers bind the DNA at the SSB
    references: [ray-chaudhuri-2017, langelier-2012]
```

Decisions:

- **References are structured identifiers, not free text.** `pmid`, `doi`, `reactome`, and `url` are validated by pattern. Each reference needs at least one of them, and `citation` is optional display text. That keeps them resolvable and deduplicable, which the future wiki needs to cross-link sources between mechanisms.
- **One list per document, referenced by id** from steps and from `mechanism.references`. The compiler rejects unknown ids.
- **`keyEvents` are plain strings.** They are *not* derived from actions. Automatically generated captions ("PARP1 binds DNA") are possible from `TimedAction.presentation`, but scientific phrasing belongs to the author. Scene-anchored annotations (a note pointing at an actor or site) are left for later.
- **New lesion state `nick` and alias `fill-gap`.** Gap filling by POLβ is otherwise invisible: `single-strand-break` → `nick` → (`ligate`) → intact. `ligate` accepts `nick` as a break.

## 2. Viewer contract

```text
MechanismSnapshot ──buildSvgScene(snapshot, { ghosts })──▶ SvgScene ──renderSvg──▶ SVG string
                                                                        │
                                                        patchSvg (React) keyed DOM update
```

- **The scene reads generic state only:** presence, visibility, `boundTo`, activity, modifications (with and without `length`), and site lesions. It never sees action types.
- **Out-of-focus ("ghost") actors are a caller option**, not state. The React player passes the next three actors that become visible later (`firstAppearances` / `upcomingActors`), which is a pure timeline query.
- **Layout is deterministic** and depends only on state. Actors bound to a site sit on the helix above it; actors bound to actors dock against their partner, and the first child docks at the tip of a chain. Chains leave towards the free side. Labels avoid docked partners, chains, the canvas edges, and other actors.
- **Stable `data-key`s inside `data-layer` groups.** `patchSvg` keeps DOM nodes for persistent keys, so CSS transitions animate movement, a ghost becoming real, and label moves. New keys fade in and removed keys fade out. A test checks that any navigation path ends in the same DOM as a fresh render.
- **Thumbnails** use `renderSvg(scene, { compact: true })`: no labels, no ghosts, nothing focusable, and the `viewBox` cropped to the action.
- **Theming** is entirely through `--mm-*` CSS custom properties, with light defaults and dark values under `[data-theme=dark]`, `.mm-theme-dark`, or the OS preference.

## 3. React building blocks

`useMechanismPlayer`, `MechanismStage`, `MechanismThumbnail`, `PlaybackControls`, `StepTimeline`, `StepThumbnails`, `StepDetails` (Explanation · Molecular details · References), and `ReferenceList`. `MolecularMechanism` is now a thin composition of these. The demo dashboard composes them differently, and so can the future wiki.

## 4. Known limitations

- Layout is heuristic. Crowded steps with many partners on one site can still overlap. Explicit `position` remains the escape hatch.
- Only one strand-level lesion marker per site; strand direction (5′/3′) is not drawn yet.
- The "Molecular details" tab lists state generically; it has no per-protein domain information.
