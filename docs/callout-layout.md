# Callout layout

Actor callouts (a pill and its leader) and chain callouts are placed by the scene builder, not authored. The mechanism file never positions a label.

## Collision geometry

Everything a reader sees takes part: actor bodies and their chains, pills, chain callout text, and the leader of every callout. The renderer draws exactly the pill and leader the layout checked (`labelGeometry`, `chainCallout`), so the two cannot disagree. A nucleic acid is an obstacle only for a callout hung below its body.

A callout that is clear stays where it was. One in conflict tries the other side, then higher on either side, then below the body. Callouts are placed in order, then any still in conflict is placed again against all the others. A chain callout chooses among places around the chain's tip by how much of its text and leader is covered.

## Cost

The place with the least perceptual cost wins. Zero conflicts is a goal, not a requirement: on a narrow canvas there is often no clear place, and the layout settles for the least bad one.

| Tier (`CALLOUT_COST`) | Cost | What it is |
| --- | --- | --- |
| `offCanvas` | 60 | The callout leaves the canvas |
| `lying` | 20 | The pill lies on a present actor, a chain, another callout, or (hung below) a nucleic acid |
| `crossing` | 10 | A leader crosses one of those, crosses another leader, or ends on another actor |
| `ghost` | 1 | Either of the above over an upcoming (ghost) actor or its callout |

Upcoming actors are soft obstacles: worth avoiding, never worth a conflict with something present. The layout may rest a callout on a ghost when every alternative is worse.

## Diagnostics

`scene.calloutConflicts` lists the callouts that could not be placed clear, with the cost of the place each settled for, split into `hard` (present things) and `ghost`. Nothing is drawn from it.

```sh
npm run build
node scripts/callout-diff.mjs
```

writes `artifacts/callout-diff/remaining-conflicts.json` (every example, wide and narrow canvas, upcoming actors shown) and a before/after page of every callout that differs from the committed renderer. The header of the script says how to make the "before" bundle. Review that page before regenerating the render baselines with `UPDATE_GOLDEN=1`.

## Open acceptance cases

Two hard conflicts remain on the wide canvas. They are acceptance cases for a future generic leader-routing system (a waypoint or a different curve), not to be solved with extra candidate places or per-actor exceptions:

- **HR, synthesis on the sister chromatid.** Every place for the Pol δ callout has a conflict, so its leader runs through an RPA ring.
- **p53, proteasome association.** The Ub chain callout is squeezed between p53 and the 26S, with part of it covered.

Both are asserted as recorded diagnostics, with `it.todo` entries for the routed result, in `packages/svg/test/callouts.test.ts`.
