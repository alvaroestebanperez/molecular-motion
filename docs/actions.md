# Actions

<!-- Generated from the action registry by packages/core/test/reference.test.ts. Do not edit: run `npm run reference`. -->

Every action a step can contain, as the compiler accepts it. For the rest of a document, see [the language](language.md).

**Primitives** define every change of state: [`bind`](#bind) · [`unbind`](#unbind) · [`set-state`](#set-state) · [`modify`](#modify) · [`translocate`](#translocate) · [`synthesize`](#synthesize) · [`degrade`](#degrade) · [`cleave`](#cleave) · [`ligate`](#ligate) · [`resect`](#resect) · [`extend`](#extend) · [`unwind`](#unwind) · [`anneal`](#anneal) · [`occupy`](#occupy) · [`coat`](#coat) · [`vacate`](#vacate) · [`pair`](#pair) · [`unpair`](#unpair) · [`excise-interval`](#excise-interval) · [`reconnect-strands`](#reconnect-strands)

**Aliases** are biological verbs that expand to a primitive and keep their own wording in captions: [`recruit`](#recruit) · [`invade`](#invade) · [`show`](#show) · [`hide`](#hide) · [`activate`](#activate) · [`inactivate`](#inactivate) · [`inhibit`](#inhibit) · [`phosphorylate`](#phosphorylate) · [`dephosphorylate`](#dephosphorylate) · [`ubiquitinate`](#ubiquitinate) · [`parylate`](#parylate) · [`polymerize`](#polymerize) · [`damage`](#damage) · [`excise`](#excise) · [`fill-gap`](#fill-gap) · [`repair`](#repair)

## Fields every action accepts

| Field | Required | Value | Notes |
|---|---|---|---|
| `duration` |  | integer ≥ 0 | Duration in milliseconds (presentation only). |
| `by` |  | instance | Causal agent: enzyme, ligand, drug, or sensor. |

## Primitives

### `bind`

Bind an instance to another instance (an interaction) or rest it on a nucleic acid (an occupancy).

In captions: "binds".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |
| `target` | yes | `actor` or `actor.site` |  |
| `interface` |  | text | Interface of the actor used for this binding. Without one the binding is the anonymous legacy attachment, replaced by the next anonymous bind. |
| `targetInterface` |  | text | Interface of the target used for this binding. |

### `unbind`

Release bindings of an instance: its anonymous attachment, or those to a given target or through a given interface.

In captions: "releases".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |
| `target` |  | `actor` or `actor.site` | Release only bindings to this instance, site or nucleic acid. |
| `interface` |  | text | Release only bindings through this interface of the actor. |

### `set-state`

Set visibility or activity of an actor, or the lesion state of a site.

In captions: "changes".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor` or `actor.site` |  |
| `visible` |  | `true` or `false` |  |
| `activity` |  | `active`, `inactive`, `inhibited` |  |
| `lesion` |  | `single-strand-break`, `nick`, `double-strand-break`, `base-damage`, `abasic-site`, `adduct`, `none` |  |

### `modify`

Add or remove a covalent modification, chain, or filament on an actor.

In captions: "modifies".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |
| `kind` | yes | text | Open vocabulary, e.g. phosphorylation, ubiquitination. |
| `site` |  | text | Residue or region, e.g. Y1068. |
| `label` |  | text |  |
| `length` |  | integer ≥ 1 | Chain or filament length. |
| `remove` |  | `true` or `false` |  |

### `translocate`

Move an actor to another compartment. Bindings are never changed.

In captions: "translocates to".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |
| `to` | yes | compartment id |  |
| `includeBound` |  | `true` or `false` | Also move every actor bound to this one, directly or transitively, keeping their bindings. |

### `synthesize`

Bring a declared product into existence (initial.present: false).

In captions: "synthesizes" (activating).

| Field | Required | Value | Notes |
|---|---|---|---|
| `product` | yes | instance |  |
| `compartment` |  | compartment id |  |

### `degrade`

Remove an actor from existence and release everything bound to it.

In captions: "degrades" (inhibitory).

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |

### `cleave`

Break the backbone of a nucleic acid at a site.

In captions: "cleaves".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor.site` |  |
| `lesion` |  | `single-strand-break`, `nick`, `double-strand-break` |  |

### `ligate`

Seal a backbone break at a site.

In captions: "ligates".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor.site` |  |

### `resect`

Remove nucleotides 5′→3′ from every 5′ end at a strand break, leaving 3′ overhangs.

In captions: "resects".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor.site` | Site with a break and a point coordinate (at). |
| `length` | yes | integer ≥ 1 | Nucleotides removed from each 5′ end. |

### `extend`

Synthesise nucleotides 5′→3′ from a 3′ end at a site into a gap, copying the strand that 3′ end is paired with: its own molecule's, or another molecule's through an existing pairing, which it prolongs.

In captions: "extends" (activating).

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor.site` | Site with a point coordinate (at) where the 3′ end sits. |
| `length` | yes | integer ≥ 1 | Nucleotides added. |
| `strand` |  | `top`, `bottom` | Strand to extend; needed only when both offer a 3′ end. |

### `unwind`

Separate both strands into an unpaired bubble around a site.

In captions: "unwinds".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor.site` | Site with a coordinate; a span is the bubble itself. |
| `length` |  | integer ≥ 1 | Bubble length, centred on a point site (at). Not used with a span. |

### `anneal`

Re-pair the unwound bubble at a site, or only part of it.

In captions: "anneals".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor.site` | Site with a coordinate inside or at the edge of the bubble. |
| `span` |  | `[from, to]` | Close only these nucleotides of the bubble (a junction moving along it). Without it the whole bubble closes. |

### `occupy`

Rest one instance on a nucleic acid, covering a span of nucleotides on a strand.

In captions: "occupies".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |
| `target` | yes | `actor` or `actor.site` | The nucleic acid, or one of its sites; a span site gives the span, a point site anchors the footprint. |
| `span` |  | `[from, to]` | Nucleotides covered, overriding the site and the footprint length. |
| `strand` |  | `top`, `bottom`, `both` | Defaults to the strand the footprint form allows. |
| `orientation` |  | `forward`, `reverse` | Relative to top 5′→3′. At a point site, forward covers [at, at + length), reverse [at − length, at). |

### `coat`

Place the listed instances side by side along a span, each covering its footprint, from one end.

In captions: "coats".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actors` | yes | list of instances | Instances in placement order. Only these are placed: nothing picks free copies. |
| `target` | yes | `actor` or `actor.site` | The nucleic acid, or a site with a span. |
| `span` |  | `[from, to]` | Span to coat, overriding the site. |
| `strand` |  | `top`, `bottom`, `both` | Defaults to the strand the footprint form allows. |
| `orientation` |  | `forward`, `reverse` | Forward fills from the span start towards increasing coordinates, reverse from its end. |

### `vacate`

Lift an instance off a nucleic acid.

In captions: "leaves".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |
| `target` |  | `actor` or `actor.site` | The nucleic acid, when the instance occupies more than one. |

### `pair`

Base-pair a strand span of one nucleic acid with the aligned strand span of another. Both must be present and unpaired: it never unwinds or displaces.

In captions: "pairs with".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor` or `actor.site` | The nucleic acid, or a site with a span, whose strand pairs. |
| `with` | yes | instance | The nucleic acid it pairs with; the span and strand follow from the alignment. |
| `strand` |  | `top`, `bottom` | Strand of the target. Defaults to the site's strand, else the one unpaired strand across the span. |
| `span` |  | `[from, to]` | Nucleotides of the target that pair, overriding the site. |
| `alignment` |  | text | Alignment to pair through; needed only when several relate the two molecules over the span. |

### `unpair`

Separate a strand span from the strand of another molecule it is paired with. Both become unpaired: it never anneals.

In captions: "unpairs from".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor` or `actor.site` | The nucleic acid, or a site with a span. A bare molecule means its whole length. |
| `strand` |  | `top`, `bottom` | Defaults to the site's strand, else both. |
| `span` |  | `[from, to]` | Nucleotides to unpair, overriding the site. |

### `excise-interval`

Remove an internal interval of a nucleic acid, on every strand, and join the nucleotides either side of it. Coordinates are not renumbered. Not a gap: nothing is left to fill or ligate.

In captions: "excises".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor` or `actor.site` | The nucleic acid, or one of its sites with a span. |
| `span` |  | `[from, to]` | Interval to remove, overriding the site. It must be internal: it reaches neither end of the molecule. |

### `reconnect-strands`

Reconnect one strand of two nucleic acids at corresponding points, so each continues 5′→3′ as the other. It cuts and joins in one step and clears a break at either site. No nucleotide moves or is renumbered, and no pairing changes. Applied again at the same two sites it undoes itself.

In captions: "reconnects with".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor.site` | Site with a point coordinate (at) on one molecule. |
| `with` | yes | `actor.site` | Site with a point coordinate (at) on the other molecule, which an alignment of orientation same puts opposite the target. |
| `strand` |  | `top`, `bottom` | Strand to reconnect, the same on both molecules. Needed when a site is on both strands or names none. |

## Aliases

### `recruit`

Bind an actor that is brought in by its target.

Alias of [`bind`](#bind).

In captions: "recruits".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |
| `target` | yes | `actor` or `actor.site` |  |
| `interface` |  | text | Interface of the actor used for this binding. Without one the binding is the anonymous legacy attachment, replaced by the next anonymous bind. |
| `targetInterface` |  | text | Interface of the target used for this binding. |

### `invade`

Pair a strand with another molecule, told as an invasion. Exactly a pair: the other duplex must already be unwound.

Alias of [`pair`](#pair).

In captions: "invades".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor` or `actor.site` | The nucleic acid, or a site with a span, whose strand pairs. |
| `with` | yes | instance | The nucleic acid it pairs with; the span and strand follow from the alignment. |
| `strand` |  | `top`, `bottom` | Strand of the target. Defaults to the site's strand, else the one unpaired strand across the span. |
| `span` |  | `[from, to]` | Nucleotides of the target that pair, overriding the site. |
| `alignment` |  | text | Alignment to pair through; needed only when several relate the two molecules over the span. |

### `show`

Show an actor without changing its biology.

Alias of [`set-state`](#set-state), with `visible: true`; it passes its `actor` as `target`.

In captions: "shows".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |

### `hide`

Hide an actor without changing its biology.

Alias of [`set-state`](#set-state), with `visible: false`; it passes its `actor` as `target`.

In captions: "hides".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |

### `activate`

Mark an actor as active.

Alias of [`set-state`](#set-state), with `activity: active`; it passes its `actor` as `target`.

In captions: "activates" (activating).

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |

### `inactivate`

Mark an actor as inactive.

Alias of [`set-state`](#set-state), with `activity: inactive`; it passes its `actor` as `target`.

In captions: "inactivates" (inhibitory).

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |

### `inhibit`

Mark an actor as inhibited.

Alias of [`set-state`](#set-state), with `activity: inhibited`; it passes its `actor` as `target`.

In captions: "inhibits" (inhibitory).

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |

### `phosphorylate`

Add phosphorylation, optionally at a named residue.

Alias of [`modify`](#modify), with `kind: phosphorylation`, `label: P`.

In captions: "phosphorylates".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |
| `site` |  | text |  |
| `label` |  | text |  |

### `dephosphorylate`

Remove phosphorylation, optionally at a named residue.

Alias of [`modify`](#modify), with `kind: phosphorylation`, `label: P`, `remove: true`.

In captions: "dephosphorylates".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |
| `site` |  | text |  |
| `label` |  | text |  |

### `ubiquitinate`

Add ubiquitination, optionally at a named residue.

Alias of [`modify`](#modify), with `kind: ubiquitination`, `label: Ub`.

In captions: "ubiquitinates".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |
| `site` |  | text |  |
| `label` |  | text |  |

### `parylate`

Attach a poly(ADP-ribose) chain.

Alias of [`modify`](#modify), with `kind: parylation`, `label: PAR`, `length: 7`.

In captions: "PARylates".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |
| `length` |  | integer ≥ 1 |  |

### `polymerize`

Grow a chain or filament on an actor.

Alias of [`modify`](#modify), with `kind: polymer`, `length: 7`; it passes its `product` as `label`.

In captions: "polymerizes".

| Field | Required | Value | Notes |
|---|---|---|---|
| `actor` | yes | instance |  |
| `product` | yes | text |  |
| `length` |  | integer ≥ 1 |  |

### `damage`

Mark a site as base-damage.

Alias of [`set-state`](#set-state), with `lesion: base-damage`.

In captions: "damages".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor.site` |  |
| `lesion` |  | `base-damage`, `adduct` |  |

### `excise`

Mark a site as abasic-site.

Alias of [`set-state`](#set-state), with `lesion: abasic-site`.

In captions: "excises the base at".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor.site` |  |

### `fill-gap`

Mark a site as nick.

Alias of [`set-state`](#set-state), with `lesion: nick`.

In captions: "fills the gap at".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor.site` |  |

### `repair`

Restore an intact site.

Alias of [`set-state`](#set-state), with `lesion: none`.

In captions: "repairs".

| Field | Required | Value | Notes |
|---|---|---|---|
| `target` | yes | `actor.site` |  |
