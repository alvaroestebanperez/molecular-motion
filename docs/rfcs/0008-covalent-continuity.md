# RFC 0008 — Covalent continuity between molecules

- **Status:** Implemented in the core as accepted (§9); the decisions that changed in review are marked. §4 defines the join formally. The renderer is not part of it (§14).
- **Builds on:** [RFC 0004](0004-nucleic-acid-geometry.md) (coordinates, strand state), [RFC 0006](0006-nucleic-acid-pairing.md) (alignments, pairing), [RFC 0007](0007-initial-extent-and-excision.md) (coordinate order is not covalent adjacency)
- **Roadmap item:** *Strand exchange between molecules: nuclease resolution of junctions, crossovers, flaps*
- **Schema:** `schemaVersion: 7`

## 1. Problem

The homologous-recombination example ends at an intact chromatid by synthesis-dependent strand annealing, the pathway with no crossover. Its own description says: *"Double Holliday junctions and crossovers are not part of this pathway and are not shown."* This RFC asks what stops the other pathway from being written.

A probe was written in schema v6 and compiled with the current core: a break, resection, invasion, synthesis, capture of the second end, synthesis again, ligation. The result, in the order tried:

| What | Result |
|---|---|
| **The double Holliday junction as state** | **Compiles.** Both strands of the broken chromatid are whole again and each is paired with a strand of the sister over `[22, 58)`. |
| **Dissolution** (the junctions migrate together and the molecules separate, no crossover) | **Compiles**: `unpair`, then `anneal` on each molecule. |
| **Cutting the junctions** | **Compiles**: `cleave` on a strand of each molecule at the junction. |
| **Joining the cut ends the other way round** | **Cannot be written.** `ligate` seals a break at a site of one molecule, so each strand can only be rejoined to itself. |

So a Holliday junction needs nothing new. In this state it is not a covalent structure: every strand is continuous within its own molecule, and a junction is only the place where a strand stops pairing with its own partner and starts pairing with the other molecule's. `partnerOf` already reports exactly that:

```text
dna    top     0–22 cis   22–58 trans → sister.bottom   58–80 cis
dna    bottom  0–22 cis   22–58 trans → sister.top      58–80 cis
sister top     0–22 cis   22–58 trans → dna.bottom      58–80 cis
sister bottom  0–22 cis   22–58 trans → dna.top         58–80 cis
```

The one thing missing is in core state: **covalent continuity cannot be reconnected between material that belongs to different molecules.** Without it there is no resolution by nucleases, no crossover and no gene-conversion patch.

The renderer already draws the junction intermediate, through the pairing geometry of RFC 0006. Drawing the products is renderer work and outside this RFC (§2).

## 2. Scope

One capability, and only this:

- **Reciprocal reconnection.** At a pair of corresponding positions, two strands of two molecules that run the same way swap what follows: each continues as the other (`reconnect-strands`).

Explicitly **outside**:

- the recombinant products as actors of their own, with an identity or a lineage ("the crossover chromatid");
- reconnection between two places of the *same* molecule (inversion, deletion as a circle); deletion is `excise-interval`;
- a single join with no reciprocal partner: a flap ligated to another molecule, the gapped and flapped products of asymmetric resolution, a translocation with one end lost;
- topology that is not strand continuity: catenation, supercoiling, the conformation or handedness of a junction;
- site-specific recombination as a feature. It was used only to test the abstraction (§5.2);
- any drawing of the result, and any renderer or layout work;
- actions named `resolve`, `crossover`, `recombine` or `dissolve`;
- changes to the homologous-recombination example.

`cleave`, `ligate`, `pair`, `unpair`, `extend`, `resect`, `degrade` and `translocate` keep exactly their current semantics. Where that leaves something inexpressible, the RFC says so (§6) instead of bending them.

## 3. Three identities

RFC 0007 separated coordinate order from covalent adjacency inside one molecule. Reconnection between molecules separates three things that have coincided until now:

| Identity | What it is | After a reconnection |
|---|---|---|
| **Material** | a nucleotide: molecule, strand, coordinate. `dna top 60` is a name | **never changes** |
| **Authored molecule** | the actor: `dna`, with its `present`, `visible`, `compartment`, `activity`, `modifications` and strand ranges | unchanged as a record, but **no longer one physical object** |
| **Physical object** | what holds together: nucleotides joined by covalent bonds and by base pairing | **derived**, and not one-to-one with authored molecules |

After a reconnection at coordinate 22 between `dna.top` and `sister.top`:

```text
before    dna.top     0 ……… 21 — 22 ……… 79
          sister.top  0 ……… 21 — 22 ……… 79

after     dna.top     0 ……… 21 ╲ ╱ 22 ……… 79          dna.top 21 is bonded to sister.top 22
          sister.top  0 ……… 21 ╱ ╲ 22 ……… 79          sister.top 21 is bonded to dna.top 22
```

**Material identity is what everything addresses.** Sites, alignments, pairings, occupancy and strand ranges all name nucleotides by molecule and coordinate, and all keep meaning what they meant. Nothing is renumbered and nothing moves between molecules.

**An authored molecule becomes a name for a set of nucleotides.** After a crossover the actor `dna` is the left arm of one product and the right arm of the other. Its record still exists and is still the only thing actions can address (§6.4).

The alternatives were to move nucleotides between molecules (renumbering them and silently invalidating every site, pairing and alignment that named them), or to destroy both molecules and synthesise two recombinants (two unrelated actors, the fault RFC 0007 found in `degrade` + `synthesize`).

## 4. New state: directed joins

### 4.1 Definition

A **boundary** is an interbase position on one strand of one molecule: molecule, strand, coordinate. Coordinate `c` is the position between nucleotide `c − 1` and nucleotide `c` (RFC 0004).

A **join** is one covalent bond, directed 5′→3′, between two boundaries on strands of the same name:

```ts
/** A boundary: the interbase position `at` on one strand of one molecule. */
interface StrandPoint { acid: string; strand: StrandId; at: number }

/** One covalent bond, 5′→3′: from the nucleotide on the 5′ side of `from` to the nucleotide on the 3′ side of `to`. */
interface StrandJoin { from: StrandPoint; to: StrandPoint }

interface MechanismState {
  // …
  /** Joins between molecules, keyed by strand pair. Absent while there are none. */
  joins?: Record<string, StrandJoin[]>;
}
```

A join `{ from: P, to: Q }` says: **the nucleotide on the 5′ side of boundary `P` is bonded, through its 3′ end, to the 5′ end of the nucleotide on the 3′ side of boundary `Q`.** The first is the *source*, the second the *destination*.

Which nucleotide lies on which side of a boundary is the only place polarity enters. `top` runs 5′→3′ with increasing coordinate and `bottom` against it (RFC 0004), so for a boundary at coordinate `c`:

| Strand | Nucleotide on the 5′ side (a source) | Nucleotide on the 3′ side (a destination) |
|---|---|---|
| `top` | `c − 1` | `c` |
| `bottom` | `c` | `c − 1` |

Every part of a join is therefore fixed by its two boundaries:

| | From the join |
|---|---|
| molecule, strand, boundary coordinate | `from.acid`, `from.strand`, `from.at`, and the same of `to` |
| side that takes part | the 5′ side of `from`, the 3′ side of `to` |
| source material | the nucleotide on the 5′ side of `from` |
| destination material | the nucleotide on the 3′ side of `to` |
| effect of polarity | the table above, and nothing else |

A join **replaces** two ordinary bonds: the one the source had with its neighbour across `from`, and the one the destination had with its neighbour across `to`.

`joins` is optional, and an absent record means exactly the same as an empty one. The core stores it only while it has entries, so a v6 document produces the snapshots it produced before (X9).

### 4.2 Covalent adjacency, from three rules and no biology

Ordinary adjacency is the join of a boundary with itself: `{ from: P, to: P }` bonds the 5′ side of `P` to its 3′ side. An excised interval `[a, b)` of RFC 0007 is the join of its two boundaries, in the direction of the strand: `a → b` on `top`, `b → a` on `bottom`. Neither is stored as a join; both are read from the state that already says them.

So the covalent successor of a nucleotide `N`, 5′→3′, needs only this:

```text
covalentSuccessor(N):
  P := the boundary on the 3′ side of N                  (top: n + 1   bottom: n)
  if a join has from = P:
      Q := its `to`                                      RFC 0008: a stored join
  else:
      Q := P, carried across an excised interval          RFC 0007: top a → b, bottom b → a
           that begins at P in the direction of the strand   otherwise ordinary adjacency
      if a join has to = Q: return none                  that 5′ end is bonded elsewhere: N has a free 3′ end
  D := the nucleotide on the 3′ side of Q                (top: Q.at   bottom: Q.at − 1)
  return D if it lies in its molecule and is not missing, else none
```

It reads `joins`, `excised`, `missing` and strand polarity. It knows no mechanism, no junction and no enzyme. `covalentPredecessor` is the mirror image. The branch that returns none for a 5′ end bonded elsewhere cannot arise in v7, where every join has its reciprocal (X5); it is what makes the function total over the shape of the state.

Whether a bond is intact is separate: a bond is broken while a point site that names it (§6.1) carries a break lesion on that strand.

Derived from the successor:

- **covalent strand**: a maximal chain of successors, written 5′→3′ as stretches, each of one molecule. A chain may close on itself: two molecules related by more than one alignment can be reconnected into a strand with no ends. A circle is derived and reported as one; it is not invalid, since no invariant forbids it;
- **product**: a set of nucleotides held together by covalent bonds and base pairing. Never stored, with no identity of its own (§2).

### 4.3 What v7 writes

**In v7 joins exist only in reciprocal pairs.** The one action that writes them (§5) reconnects two strands of the same name, of molecules `A` and `B`, at corresponding boundaries `P` on `A` and `Q` on `B`. It writes:

```text
{ from: P, to: Q }      the 5′ side of P on A   →   the 3′ side of Q on B
{ from: Q, to: P }      the 5′ side of Q on B   →   the 3′ side of P on A
```

The two entries have the same form on either strand; polarity only decides which nucleotides the boundaries denote. Reciprocity is a rule of this version (X5), not a property of the shape: a later RFC can admit a join without its partner (§10) without changing the state.

Applying the action again at the same two boundaries removes both joins. Reconnection is its own inverse.

### 4.4 The definition at work

Each case below was produced by an implementation of §4.2 that takes only lengths, excised intervals and joins. Strands are written 5′→3′.

**No join.** Ordinary adjacency:

```text
5′ dna.top 0…79 3′          5′ sister.top 0…79 3′
5′ dna.bottom 79…0 3′       5′ sister.bottom 79…0 3′
```

**1. One reciprocal reconnection on `top`, at 22.**

```text
join  from dna.top@22     to sister.top@22       bond  dna.top[21]    → sister.top[22]
join  from sister.top@22  to dna.top@22          bond  sister.top[21] → dna.top[22]

5′ dna.top 0…21 → sister.top 22…79 3′
5′ sister.top 0…21 → dna.top 22…79 3′
5′ dna.bottom 79…0 3′       5′ sister.bottom 79…0 3′       unchanged
```

**2. One reciprocal reconnection on `bottom`, at 58.** The stored joins have the same form; the nucleotides differ, because on `bottom` the 5′ side of a boundary is the higher coordinate.

```text
join  from dna.bottom@58     to sister.bottom@58    bond  dna.bottom[58]    → sister.bottom[57]
join  from sister.bottom@58  to dna.bottom@58       bond  sister.bottom[58] → dna.bottom[57]

5′ dna.bottom 79…58 → sister.bottom 57…0 3′
5′ sister.bottom 79…58 → dna.bottom 57…0 3′
5′ dna.top 0…79 3′          5′ sister.top 0…79 3′          unchanged
```

**3. `top` at 22 and `top` at 58: the non-crossover topology.** One strand of each molecule carries a stretch of the other; the other two strands are untouched.

```text
5′ dna.top 0…21 → sister.top 22…57 → dna.top 58…79 3′
5′ sister.top 0…21 → dna.top 22…57 → sister.top 58…79 3′
5′ dna.bottom 79…0 3′       5′ sister.bottom 79…0 3′
```

**4. `top` at 22 and `bottom` at 58: the crossover topology.** All four strands change molecule, the two of each name at different places.

```text
5′ dna.top 0…21 → sister.top 22…79 3′
5′ sister.top 0…21 → dna.top 22…79 3′
5′ dna.bottom 79…58 → sister.bottom 57…0 3′
5′ sister.bottom 79…58 → dna.bottom 57…0 3′
```

**5. Excision alone, and with a join.** The same function gives RFC 0007's junction with no join stored, and composes with one:

```text
rna, [12, 24) excised:        5′ rna.top 0…11 → rna.top 24…35 3′
                              5′ rna.bottom 35…24 → rna.bottom 11…0 3′

sister [40, 50) excised,      5′ dna.top 0…21 → sister.top 22…39 → sister.top 50…79 3′
top reconnected at 22:        5′ sister.bottom 79…50 → sister.bottom 39…0 3′
```

Cases 3 and 4 say "topology" on purpose. The strands above are all the function gives. Whether they amount to two separate products depends on the pairing as well (§5.1, §5.2), and that they are a non-crossover or a crossover is a reading of the result, not something the core computes (D10).

## 5. The action

```yaml
- { type: reconnect-strands, target: dna.hj-left, with: sister.hj-left }
```

A primitive. `target` and `with` are point sites (`at`) on two different molecules.

- The two sites must **correspond**: an alignment relates the two molecules and puts `target`'s coordinate opposite `with`'s.
- The alignment must have orientation **`same`**, the default. The two strands are then the ones of the same name, and coordinates grow together on both molecules. An `opposite` alignment is rejected (D12).
- The strand is the site's `strand`, or the action's `strand` field. One strand is reconnected at a time.

It is atomic: after it, the two joins of §4.3 exist and both bonds are sealed. A break lesion on either site is cleared, because the bond it interrupted no longer exists; the bonds that replace it are the joins.

**It applies whole or not at all.** A site holds one lesion for the whole site (RFC 0004). If a site carries a break that also cuts the other strand, a `double-strand-break` or any break on a site of `strand: both`, sealing one strand would leave a state that one lesion cannot say: sealed here, still cut there. The action then fails and changes nothing; it does not clear the lesion in part. The author seals or re-declares the break first. This is the principle of §6.4 applied to a lesion.

An author who wants to narrate the chemistry writes `cleave` on each site in an earlier step, then `reconnect-strands` with `by:` the enzyme that seals. That is the order of canonical resolution: a resolvase introduces two symmetrical nicks, and the nicked duplexes that result are ligated (§5.3). Without the `cleave` it still stands alone, as a recombinase cuts and joins in one reaction.

### 5.1 What it expresses

With the junctions of §1 at 22 and 58. Computed by applying the joins to the real v6 state of the probe and following covalent bonds and base pairs:

| Reconnected | Products | Covalent strands |
|---|---|---|
| nothing | one structure | every strand within its own molecule |
| `top` at 22 only | one structure | still joined by the second junction |
| **`top` at 22, `top` at 58** | **two: non-crossover** | `dna.top[0,22) + sister.top[22,58) + dna.top[58,80)` with `dna.bottom[0,80)`: the arms are where they were, and `dna` carries a patch of the sister's strand |
| `bottom` at 22, `bottom` at 58 | two: non-crossover | the same, with the patch on the other strand |
| **`top` at 22, `bottom` at 58** | **two: crossover** | `dna.top[0,22) + sister.top[22,80)` with `dna.bottom[0,58) + sister.bottom[58,80)`: the arms are swapped |
| `bottom` at 22, `top` at 58 | two: crossover | the same, with the heteroduplex on the other strands |

**The same strands at both junctions give a non-crossover; different strands give a crossover.** The core does not decide which, and does not check that it is what a given enzyme would do (D10).

The pairing is untouched in every row. Between the two points of a crossover, `sister.top` is still paired in trans with `dna.bottom`: that is the heteroduplex, and it was already state.

Dissolution needs none of this: `unpair`, `anneal`. It was already expressible, and gives only the non-crossover.

### 5.2 Is this the right abstraction? A second case

To test that the state is not shaped by homologous recombination, the same transition was applied to a case with a different chemistry: reciprocal site-specific recombination between two molecules, as a tyrosine recombinase does it. Two intact duplexes with no homologous pairing between them; one pair of strands is cut and rejoined, giving a Holliday junction; then the other pair, a few base pairs away (6 in the probe).

| State | Products |
|---|---|
| `top` reconnected at 17 | one structure: a Holliday junction |
| `top` at 17 and `bottom` at 23, the 6 bp between them still paired as in the parents | **one structure** |
| the same, with the strands of those 6 bp swapped: `unwind`, then `pair` across | **two: crossover** |

Three findings.

1. **The same state transition describes both.** Resolution of a junction and site-specific recombination are both "this strand, at this position, now continues as that one". Nothing in the state or the action is specific to either.
2. **A crossover separates only when, between its two points, each strand is paired with the other molecule's.** In homologous recombination that pairing is already there, as the heteroduplex. In site-specific recombination it is the swap of the strands of the spacer, which the author writes with `unwind` and `pair`. The reconnection does not imply it and must not: it is a separate fact, and the model already has it.
3. **A junction has two representations.** In §1 it is a change of pairing partner along strands that stay in their molecule. After the first reconnection above it is a change of covalent continuation along strands that stay paired with their partner. They are the same physical junction, named from either side. Anything that looks for junctions has to derive them from both pairings and joins.

### 5.3 The name

**`reconnect-strands`**, and the state **`joins`**.

The first draft called the action `exchange-strands`. The literature on tyrosine recombinases uses exactly that phrase for this reaction ("cleaving and exchanging one pair of strands", "the first reciprocal strand exchange"), so it is not wrong. But in homologous recombination, the first use of this RFC, *strand exchange* names what RAD51 does: homologous pairing and the invasion of a duplex, which is non-covalent and is `pair` / `invade` in this language. An author writing HR would reach for `exchange-strands` at the wrong step.

`reconnect-strands` names the change of state, covalent continuity reconnected, and no enzyme or pathway. It covers a resolvase followed by a ligase and a recombinase alike. Not `resolve` or `crossover`, which name one use each; not `exchange`, which signalling needs for nucleotide exchange on a GTPase.

## 6. Effects on the rest of the model

### 6.1 Sites, bonds and the ends a cut leaves

A point site names one bond: the one in which the nucleotide **before its coordinate, on its own molecule and strand** takes part. That nucleotide is the source of a bond on `top` and the destination of one on `bottom`, and at any boundary it takes part in exactly one.

After the reconnection of §4.4 case 1, `dna.hj-left` (top, at 22) names `dna.top[21] → sister.top[22]`, and `sister.hj-left` names `sister.top[21] → dna.top[22]`. After case 2, `dna.hj-right` (bottom, at 58) names `sister.bottom[58] → dna.bottom[57]`. Each new bond is named by exactly one of the two sites.

**`cleave` cuts that bond, and the cut leaves two physical ends**: a 3′ end, the bond's source, and a 5′ end, its destination. Which nucleotides they are comes from the topology of §4.2 and from nothing else. The molecule of the site says which bond is meant; it does not say that both ends are on that molecule.

| Site at 22 on `dna` | Bond cut | 3′ end | 5′ end |
|---|---|---|---|
| `top`, no join | `dna.top[21] → dna.top[22]` | `dna.top[21]` | `dna.top[22]` |
| `top`, joined to `sister` | `dna.top[21] → sister.top[22]` | `dna.top[21]` | **`sister.top[22]`** |
| `bottom`, no join | `dna.bottom[22] → dna.bottom[21]` | `dna.bottom[22]` | `dna.bottom[21]` |
| `bottom`, joined to `sister` | `sister.bottom[22] → dna.bottom[21]` | **`sister.bottom[22]`** | `dna.bottom[21]` |

A join puts one of the two ends on the other molecule: the 5′ end on `top`, the 3′ end on `bottom`. That follows from the definition of a join; nothing is special about either strand.

- `ligate` reseals the bond its site names, under its existing rule: both ends present, on whichever molecule each is.
- Break state stays per site, as in RFC 0007 D15. Nothing is aliased.
- Read as a **base**, a site still denotes its own nucleotide. A reconnection removes nothing, so no base reading is affected.

### 6.2 Strand-range actions

**`resect` acts on a cut, so it follows the bond.** It requires a break on its site. It removes nucleotides 5′→3′ starting at the 5′ end that cut left, the destination of the bond the site names, **in the molecule that end is in**. It does not assume that the site's molecule is the material to remove.

Resecting 4 nucleotides from each site of the table above:

| Site at 22 on `dna` | 5′ end | Removed |
|---|---|---|
| `top`, no join | `dna.top[22]` | `dna.top [22, 26)` |
| `top`, joined to `sister` | `sister.top[22]` | **`sister.top [22, 26)`**; nothing of `dna` |
| `bottom`, no join | `dna.bottom[21]` | `dna.bottom [18, 22)` |
| `bottom`, joined to `sister` | `dna.bottom[21]` | `dna.bottom [18, 22)`; nothing of `sister` |

The other bond of a reciprocal pair is named by the other molecule's site, and behaves the same way from there: `resect sister.hj-left` on `top` removes `dna.top [22, 26)`. A break of both strands at a join is resected strand by strand, each in the molecule its 5′ end is in.

Without a join this is exactly what `resect` did before: the 5′ end of a cut is then always on the site's molecule. RFC 0007's junction is the same rule already, since the 5′ end across an excised interval is found through the adjacency and not by coordinate. No join is treated specially: the rule is the one above, and a join is one of the things §4.2 reads.

**Once the material is resolved, resection stays in that molecule.** It may reach a join or start at one, and it does not cross one: if the nucleotides to remove would run past a join on that strand, the action fails before removing anything, *the strand continues in another molecule*. To go on, the author cuts the bond at that join and resects from the site that names it.

Material identity is untouched by all of this (X1). `resect dna.hj-left` on a joined `top` strand writes the `missing` range of `sister`, at the sister's own coordinates. No nucleotide changes molecule, no fragment or product is introduced, and the join is still there.

**A consequence, left as it is.** After such a resection the join remains while one of its four nucleotides is missing. The covalent strand simply ends there. But the reconnection cannot be undone, because undoing seals two bonds and one has an end missing (§8), and so `degrade` and `excise-interval` beside it stay refused. `extend` restores the nucleotides, after which the bond can be ligated and the reconnection undone. Nothing restores them implicitly.

The other strand-range actions:

- `extend` does not act on a cut. Its site locates a gap on the site's own molecule, and it fills that gap; the 3′ end it grows from is the gap's covalent predecessor, found through §4.2, on another molecule if a join puts it there. It does not fill past a join.
- `unwind` and `anneal` read one molecule by coordinate, as now.
- `excise-interval` fails if a join lies inside the interval or at its boundaries.

No strand-range action writes two molecules' ranges *for one strand*, and none crosses a join (X6).

### 6.3 Pairing and occupancy

Both address nucleotides by material identity and are **unchanged**.

- A pairing span is a range of one strand of one molecule, as now. A covalent strand that crosses a join is paired through one pairing per stretch.
- An occupant rests on one molecule. A footprint that covers both sides of a join on the same covalent strand is not expressible: its two halves are on different molecules (§10).
- `reconnect-strands` does not fail because of occupants or pairings at the point. Neither loses a nucleotide.

### 6.4 Presence, place and the unit of movement

This is where the three identities of §3 matter. The first draft said that joined molecules are one object and proposed that `translocate` of one moves the other. That was wrong, and the reason is the finding of §5.2.

**The covalently connected set of molecules is not the physical object.** After a completed crossover `dna` and `sister` are still joined, by two pairs of joins, and yet there are two separate products, each made of half of each. A rule that moved "everything `dna` is covalently joined to" would move both products together, exactly when sister chromatids are about to part. The physical unit is the product, and a product has no identity that an action can name (§2).

Three models were compared for `translocate`:

| | Model | Problem |
|---|---|---|
| A | `translocate` of one molecule moves every molecule joined to it | Writes the state of actors the action does not name, and moves two separate products as one |
| B | `translocate` fails unless the whole joined set is addressed | `translocate` names one actor. Addressing a set needs a new field or a new meaning for `includeBound`, and it is still the wrong unit, as in A |
| **C** | **`translocate` is unchanged: it sets the compartment of the authored molecule it names** | The compartment of an authored molecule can disagree with that of material it is joined to |

**C is proposed.** The disagreement it allows is not new. Two molecules whose strands are paired can already be put in different compartments, and so can a protein and the nucleic acid it rests on; the core has never enforced that things held together are in one place. ADR 0003 settled what to do about it: the renderer draws by the partner and reports a diagnostic, and core validation does not change. A join is one more relation of that kind. `includeBound` keeps its meaning and does not follow joins.

The same reasoning, applied to the rest of an actor's state:

| | What it does | Why |
|---|---|---|
| `compartment`, `visible`, `activity`, `modifications` | unchanged: state of the authored molecule named | They describe a record, and the record still exists. They no longer describe one object; that is the limit of having no products (§10) |
| `degrade` | **fails** while the molecule has a join: *covalently joined to …; undo the reconnection first* | Its result cannot be represented. Removing a molecule leaves bonds to nothing. Dropping the joins instead would restore coordinate adjacency on the survivor and invent a bond that never formed |
| `present: false` and `synthesize` | unaffected | A join needs both molecules present to be made, and `degrade` is refused, so a joined molecule is always present |

The line between the two is a principle, and this RFC states it as one:

> **An action whose resulting state cannot be represented must fail rather than infer a new physical-product identity.**

`degrade` of a joined molecule has no representable result, so it fails. It is not repaired by deciding what the survivor now is, by removing the other molecule too, or by declaring a product. The converse holds as well: a result that can be represented is not refused for being physically odd, which is why `translocate` is left alone.

For hosts that need the object, the core offers two derived readings and stores neither: the molecules a molecule is joined to, and the products of a snapshot.

### 6.5 Initial state

A join relates two molecules, so it stays an event, like a pairing or an occupancy (RFC 0007 §3.4). A document cannot begin with one (D8).

### 6.6 Validation

- **Static:** both targets are point sites of nucleic acids, on different molecules; an alignment of orientation `same` relates the two molecules.
- **Dynamic:** the coordinates correspond under such an alignment; both molecules are present; the four nucleotides around the point exist (not `missing`, not `excised`); the strand has no join there with a third molecule.

Nothing checks that the ends are held next to each other. In both biological cases they are, on a common complementary strand: by the heteroduplex at a junction, by the swapped spacer strands in a recombinase. The core has pairing but no geometry, and does not require it.

## 7. Invariants

- **X1.** Material identity never changes: no nucleotide moves between molecules, and no coordinate is renumbered.
- **X2.** A join connects strands of the same name of two different molecules, at coordinates that an alignment of orientation `same` puts opposite each other.
- **X3.** A boundary of a strand is the `from` of at most one join and the `to` of at most one, so `covalentSuccessor` and `covalentPredecessor` are functions: a nucleotide has at most one covalent neighbour on each side.
- **X4.** Joins are stored normalised: keyed by strand pair, sorted by coordinate.
- **X5.** In v7 every join has its reciprocal. No state has one without the other.
- **X6.** No strand-range action crosses a join. `resect` writes, for each strand it resects, the ranges of the one molecule its 5′ end is in, which the topology decides and need not be the site's (§6.2).
- **X7.** Pairing, occupancy, sites and alignments are not rewritten by a reconnection.
- **X8.** A molecule that has a join is present. Nothing requires joined molecules to be in one compartment.
- **X9.** A v6 document produces exactly the snapshots it produced before.
- **X10.** Lesion state is per site. A site at a join names one bond (§6.1), and no two sites share state.
- **X11.** No action infers a product. One whose result cannot be represented fails (§6.4).

## 8. Invalid cases

| Action | Error |
|---|---|
| `target` or `with` is not a point site of a nucleic acid | needs a site with a point coordinate on each molecule |
| both sites are on the same molecule | reconnection is between two molecules; a deletion is `excise-interval` |
| no alignment relates the two molecules | declare one in `alignments` |
| the coordinates do not correspond under any alignment | the sites are not opposite each other |
| the only alignment that puts the sites opposite each other has orientation `opposite` | reconnection across a mirrored alignment is not supported |
| a site is `strand: both`, or names none, and the action gives no `strand` | name the strand: one strand is reconnected at a time |
| a nucleotide next to the point is `missing` or `excised` | nothing to join there |
| the strand already has a join there with a third molecule | already joined to … |
| `resect` would pass a join, in the molecule its 5′ end is in | the strand continues in another molecule; nothing is removed |
| a site carries a break that also cuts the other strand | carries a …, which also cuts the other strand; one strand is reconnected at a time |
| `excise-interval` over or beside a join | undo the reconnection first |
| `degrade` of a molecule that has a join | covalently joined to …; undo the reconnection first |

## 9. Decisions

| # | Decision | Options | Proposal |
|---|---|---|---|
| **D1** | How a strand continues in another molecule | (a) joins as state, with material identity fixed and continuity derived; (b) nucleotides move between molecules; (c) the two molecules are replaced by two recombinants | **(a)** |
| **D2** | The shape of the state | (a) directed joins, one bond each, written in reciprocal pairs in v7; (b) reciprocal exchange points, one entry for two bonds | **(a)** *(changed)*. It names the bond, not one way of making it, and a later non-reciprocal join needs no change of state. v7 still admits only reciprocal pairs (X5) |
| **D3** | Relation to breaks | (a) atomic: `reconnect-strands` cuts and joins, and clears break lesions on its two sites; (b) requires a break on both sites first; (c) `ligate` is extended to join ends of different molecules | **(a)**. (c) changes what `ligate` means, which RFC 0007 protected |
| **D4** | Name | (a) `reconnect-strands`, state `joins`; (b) `exchange-strands`; (c) `resolve` / `crossover` | **(a)** *(changed)*. *Strand exchange* names RAD51's non-covalent pairing in the first field of use (§5.3) |
| **D5** | Undoing | (a) the same action at the same two points removes the joins; (b) a separate action; (c) not reversible | **(a)** |
| **D6** | Strand-range actions at a join | (a) they stay inside one molecule and fail or stop at the join; (b) they follow the covalent strand into the other molecule | **(a)**. (b) makes one action write two molecules' ranges |
| **D7a** | `translocate` of a joined molecule | (A) moves every molecule joined to it; (B) fails unless the whole set is addressed; (C) unchanged: sets the compartment of the molecule named | **(C)** *(changed)*. The joined set is not the physical object (§6.4), and the core does not enforce co-location for any relation |
| **D7b** | `degrade` of a joined molecule | (a) fails; (b) removes the joins with it; (c) removes every joined molecule | **(a)** *(split from D7)*. Its result cannot be represented |
| **D7c** | The rest of an actor's state after a reconnection | (a) unchanged, as state of the authored molecule; (b) propagated to joined molecules | **(a)** *(new)* |
| **D8** | Joins in the initial state | (a) not allowed: a join relates two molecules and is an event; (b) allowed, as `excised` is | **(a)** |
| **D9** | The products | (a) derived from joins and pairing, with no identity; (b) new actors | **(a)**. (b) is out of scope |
| **D10** | Which outcome a set of reconnections gives | (a) the author chooses the strands; the core checks only that each is valid; (b) the core derives crossover or non-crossover | **(a)**. The core has no sequence and no enzyme model |
| **D11** | Schema version | (a) `schemaVersion: 7` with automatic v6 → v7; (b) additive under v6 | **(a)**, purely additive |
| **D12** | Mirrored alignments | (a) only orientation `same`; `opposite` is rejected with an error; (b) both | **(a)** *(was an open question; confirmed)*. Under `opposite`, "what follows" points opposite ways on the two molecules |
| **D13** | Direction and sides of a join | (a) directed 5′→3′, from the nucleotide on the 5′ side of `from` to the one on the 3′ side of `to`, the sides given by strand polarity; (b) ordered by coordinate, low side to high side, with polarity applied by whoever reads it; (c) the two nucleotides stored explicitly | **(a)** *(new)*. One definition serves both strands, ordinary adjacency is the join of a boundary with itself, and the stored form of a reciprocal pair is the same on `top` and `bottom` (§4) |

## 10. Open questions

1. **Products have no identity.** After a crossover no action can move, hide or degrade one product: actions address authored molecules, and each product is half of two. This RFC leaves actor state on the authored molecule (D7c) and offers the products only as a derived reading. A mechanism that needs to send two recombinant chromatids to different places needs products as something addressable, which §2 excludes.
2. **Occupancy across a join.** A protein whose footprint covers both sides of a join on one covalent strand rests on two molecules. Occupancy is of one molecule today.
3. **A join without its reciprocal.** The state admits it (D2); v7 does not write it. It would bring free ends that no site names, and needs its own rules.
4. **Reconnection within one molecule.** Inversion between two sites of the same molecule is not deletion and is not covered.

## 11. Migration v6 → v7

- **Purely additive.** `MechanismState.joins` and the primitive `reconnect-strands` are new. No existing field, action or alias changes name or meaning.
- `migrateV6` sets `schemaVersion: 7` and nothing else.
- v1–v6 documents keep loading, and their snapshots are unchanged (X9). The render baselines stay byte-identical.
- The homologous-recombination example is not changed.

## 12. Minimal examples

### 12.1 Resolution with a crossover

Before, v6: the junctions can be cut and each strand rejoined only to itself.

```yaml
- { type: cleave, target: dna.hj-left }
- { type: cleave, target: sister.hj-left }
- { type: ligate, target: dna.hj-left }      # back to dna.top, as it was
- { type: ligate, target: sister.hj-left }
```

After, v7:

```yaml
actors:
  - id: dna
    type: dna
    nucleic: { length: 80 }
    sites:
      - { id: hj-left, at: 22, strand: top }
      - { id: hj-right, at: 58, strand: bottom }
  - id: sister
    type: dna
    nucleic: { length: 80 }
    sites:
      - { id: hj-left, at: 22, strand: top }
      - { id: hj-right, at: 58, strand: bottom }
alignments:
  - { id: sister, between: [dna, sister], range: [0, 80] }
steps:
  - id: resolution
    actions:
      - { type: cleave, target: dna.hj-left }          # optional narration: the resolvase nicks
      - { type: cleave, target: sister.hj-left }
      - { type: reconnect-strands, target: dna.hj-left, with: sister.hj-left }
      - { type: reconnect-strands, target: dna.hj-right, with: sister.hj-right }
```

State after: the four joins of §4.4 case 4; no lesion on any of the four sites; every `nucleic` range and every pairing as before. The covalent strand whose 5′ end is `dna.top[0]` has its 3′ end at `sister.top[79]`. With the pairing of §1, two products.

### 12.2 Resolution without a crossover

The same, reconnecting the same strand at both junctions:

```yaml
- { type: reconnect-strands, target: dna.hj-left, with: sister.hj-left }             # top at 22
- { type: reconnect-strands, target: dna.hj-right-top, with: sister.hj-right-top }   # top at 58
```

The joins of §4.4 case 3. The covalent strand whose 5′ end is `dna.top[0]` runs `dna.top 0…21`, `sister.top 22…57`, `dna.top 58…79`: the arms are where they were, and `dna` carries a patch of the sister's strand. With the pairing of §1, two products.

### 12.3 Undoing a reconnection

```yaml
- { type: reconnect-strands, target: dna.hj-left, with: sister.hj-left }
- { type: reconnect-strands, target: dna.hj-left, with: sister.hj-left }
```

State after: no join. The snapshot equals the one before the first action.

## 13. The biology behind the examples

Checked against the literature for the examples and the wording of this RFC. None of it is encoded in the core (D10).

- **How the double junction forms.** After invasion and synthesis, "the other resected 3′ end anneals to the displaced strand of the D-loop", the two DNAs "are linked by nicked Holliday junctions", and "additional DNA synthesis and nick ligation lead to the formation of a double Holliday junction" (Wyatt & West 2014). This is the sequence of the probe in §1.
- **Dissolution.** "The combined activities of a DNA helicase and a type IA topoisomerase … catalyze branch migration and decatenation of the dHJ into noncrossover products" (Wyatt & West 2014). In human cells that is BLM–TOP3A–RMI1–RMI2, and the outcome is the non-crossover only (Reactome R-HSA-5693568). In the model: `unpair`, `anneal`.
- **Resolution.** Nucleases cleave the junctions "into either crossover or noncrossover products". Canonical resolvases (RuvC, GEN1) "introduce a pair of symmetrical and coordinated nicks across one of the helical axes to generate nicked DNA duplexes that can be directly ligated" (Wyatt & West 2014). In the model: two `cleave`, then `reconnect-strands`. The reconnection is the ligation of those nicks, seen from the names the nucleotides had before.
- **Crossover or not.** A junction has two strands that exchange and two that do not, and can be cut across either axis (Wyatt & West 2014, Figures 1 and 2). The rule of §5.1, the same strands at both junctions or different ones, was derived in the model and computed on the probe's state; it agrees with the two outcomes that figure draws and with the double-strand-break repair model those reviews follow (Szostak et al. 1983). The sentence that states the rule in those words was not found verbatim in a source that could be opened.
- **Asymmetric resolution.** Non-canonical resolvases (MUS81–EME1, SLX1–SLX4) cut asymmetrically and "produce gapped and flapped DNA duplexes that require further processing prior to ligation" (Wyatt & West 2014). Gaps are `missing` and already expressible; flaps are a join without its reciprocal and are out of scope (§2).
- **Site-specific recombination**, used in §5.2. It is "a process of DNA breakage and reunion that requires no DNA synthesis or high-energy cofactor", and "tyrosine recombinases break and rejoin single strands in pairs to form a Holliday junction intermediate" (Grindley et al. 2006). They act "by cleaving and exchanging one pair of strands between the two substrate sites to form a 4-way Holliday junction (HJ) intermediate and then resolve the HJ intermediate to recombinant products by a second round of strand exchanges" (Ghosh et al. 2005). The distance between the two cuts used in the probe, 6 base pairs, is an illustration and is not taken from these sources.

Sources. The quotations of site-specific recombination are from the abstracts in the PubMed records, read directly; the articles themselves were not opened.

- Wyatt HDM, West SC (2014). Holliday junction resolvases. *Cold Spring Harb Perspect Biol* 6:a023192. doi:10.1101/cshperspect.a023192. Pages 1–4 read in full.
- Grindley NDF, Whiteson KL, Rice PA (2006). Mechanisms of site-specific recombination. *Annu Rev Biochem* 75:567–605. doi:10.1146/annurev.biochem.73.011303.073908. PMID 16756503. A review.
- Ghosh K, Lau CK, Guo F, Segall AM, Van Duyne GD (2005). Peptide trapping of the Holliday junction intermediate in Cre-loxP site-specific recombination. *J Biol Chem* 280(9):8290–8299. doi:10.1074/jbc.M411668200. PMID 15591069.
- Szostak JW, Orr-Weaver TL, Rothstein RJ, Stahl FW (1983). The double-strand-break repair model for recombination. *Cell* 33(1):25–35. doi:10.1016/0092-8674(83)90331-8. PMID 6380756. Its abstract does not state the crossover rule; the article was not opened.
- Reactome, *Resolution of D-loop Structures through Holliday Junction Intermediates*, R-HSA-5693568.

## 14. Implementation outline (implemented in the core)

1. Core: `joins` state, the derived covalent neighbour, covalent strand and products, and `reconnect-strands` with the checks of §6.6 and §8.
2. Core: the rules of §6.2 and §6.4 in `resect`, `extend`, `excise-interval` and `degrade`.
3. Schema v7, `migrateV6`, fixtures and baselines.
4. Renderer: out of scope here. Until an ADR decides how joined strands are drawn, a document with joins has no agreed drawing.

### 14.1 Implementation notes

Steps 1–3 are implemented. Where the text above leaves something open, the code decides as follows:

- **The strand must be unambiguous.** Without the action's `strand`, both sites must name one strand, and the same one; a site of a single-stranded molecule counts as `top`. With it, a site that names the other strand is rejected. A join is always between strands of the same name (X2).
- **Which checks are static.** That the two sites are point sites of two different nucleic acids, that an alignment relates them, that not all of those are mirrored, and the strand, are checked on the document. That the coordinates correspond is checked at the action, as §6.6 says.
- **A break that also cuts the other strand is not half cleared.** A site that carries a `double-strand-break`, or any break of a `strand: both` site, makes `reconnect-strands` fail: one lesion per site cannot say "sealed on this strand, still cut on the other" (X11). A break of the other strand alone is left as it is.
- **Undoing needs the same four nucleotides.** It seals two bonds as making the joins does, so "nothing to join there" (§8) applies to it too.
- **"Already joined" is any other join at either boundary**, not only one with a third molecule: the same two molecules at another coordinate, through a second alignment, would break X3 as well.
- **"Pass a join" means a join strictly inside the range.** `resect` and `extend` may end at a join or begin at one, which is what "up to the join, then a site of the other molecule" needs. A gap that reaches a join from both sides is still two strands, and neither action runs through it. `extend` refusing to fill across a join is not in §8; it follows from D6.
- **`extend` across a join** takes the 3′-terminal nucleotide from the other molecule only if it is present, and prolongs that nucleotide's pairing on the coordinates of the molecule it fills, translated through the join. The alignment between that molecule and the template must still cover the new stretch.
- **`ligate` at a join** applies its rule to the bond the site names (§6.1): the end on the site's own side is read on its molecule, the other end on the molecule the join reaches.
- **`resect` is still read by coordinate on the molecule of its site.** On `top`, the 5′ end of the bond a site at a join names (§6.1) lies on the other molecule, so the break that licenses resection from that site and the nucleotides it removes belong to different bonds. Nothing in this RFC reconciles the two; the code keeps `resect` as it was, as §2 requires.
- **Normal form (X4).** The key is that of `pairings` (`dna.top~sister.top`); within a key joins are sorted by the coordinate they leave from, then by molecule.
- **Derived readings.** `covalentStrands` returns stretches in 5′→3′ order and marks a strand with no ends as `circular`: two molecules related by more than one alignment can close one. `productsOf` returns each product as strand spans. Neither reads lesions (§4.2): a nick does not split a strand or a product. `joinedTo` returns only the molecules that share a join with the one asked about. `bondAt` is the bond a point names (§6.1).
- **The renderer** draws a document with joins as if no join existed. The v7 fixture that reconnects strands has a semantic baseline and no render baseline.
