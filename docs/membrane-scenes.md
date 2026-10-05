# Membranes in scenes

A scene draws a membrane, and organises its actors around it, from data schema v5 already has. Nothing is added to the schema or to core, and nothing is specific to an actor or a mechanism.

## Direction: compartment → membrane geometry → actor placement

1. **Compartment.** A compartment of kind `membrane` is a bilayer across the canvas (`renderMembranePrimitive`), with the outer leaflet up. It is drawn whether or not an actor is in it. The compartment of kind `extracellular`, and the first other one, are named on each side.
2. **Membrane geometry.** `scene.membranes` carries it. Documents without a membrane compartment get no membrane, no layer and no extra stylesheet: they render byte for byte as before.
3. **Actor placement.**
   - A `protein` or `complex` whose compartment is that membrane spans it: it is drawn with the shared transmembrane geometry (one pass, a domain on each side) on the midplane. `SceneActor.membrane` records it, and the same particles drive rendering, contacts and collisions.
   - A free actor waits in the band of its own compartment.
   - A partner docks on the side its own compartment lies on: above the outer domain or below the inner one. Two actors that both span the membrane touch along it.
   - Callouts stay off the bilayer and their leaders do not cross it.

## Sites and their anchors

`siteAnchor(actor, site, side?)` is one deterministic point on the actor's surface. It depends only on the actor's shape, the site id and the side, so it is the same in every step.

- A modification whose `site` is that id is drawn on the anchor.
- A partner bound to `actor.site` docks at the anchor.

Both use the one anchor, and neither moves when the other appears or leaves.

On a membrane-spanning actor the anchor lies on one of the two domains, facing away from the bilayer. The side is derived from the mechanism: a site that a cytosolic actor binds, anywhere in the document, is cytosolic from the first step. When nothing in the document says, the side is seeded from the site id.

A modification is associated with a site by naming its id exactly: `site: y1068` for a site declared as `id: y1068`. Core keeps `Modification.site` as a free string and does not check it against the actor's sites, and the renderer does not fold case or normalise it: `Y1068` is a different, undeclared site with its own anchor.

## Tags

`ModificationVisualProfile` has a third marker, `tag`: one small labelled disc adhered to the carrier's surface. The catalog maps `phosphorylation` to it, the same way it maps `ubiquitination` to small protein surfaces.

A profile is appearance only. It cannot say which side of a membrane a tag goes on; that comes from the site, as above. A tag without a site is spread along the surface. The tag is part of what a partner touches, so one bound at the same site rests against it. `SceneActor.tags` carries the placed tags.

An empty `modificationProfiles` catalog still selects the legacy badge for every kind.

## One bilayer, and the membrane the scene is at

A scene has one bilayer. When the document declares several membrane compartments, the bilayer stands for the one the scene is at: the one its present spanning actors are in. It carries that compartment's name, and `scene.membranes[0]` its id.

When those actors are moved to another membrane compartment with `translocate`, the same bilayer is relabelled and re-keyed (ER membrane → Golgi membrane in cGAS–STING). **This is a change of context, not a journey**: nothing travels between two organelles, no actor moves, and the two membranes are never on screen together. An actor moved to a compartment of kind `membrane` stays drawn spanning it; moved to any other kind it would be drawn soluble.

`translocate … includeBound: true` gives every bound partner the same compartment, which for a membrane is wrong for a soluble partner: the renderer no longer knows which side it is on. Move the spanning copies one by one and leave their partners in their own compartment.

The membrane's name is written where no spanning actor stands: left above the bilayer, else right, else along the top (`SceneMembrane.labelAt`). `areaLabels(scene)` gives every name written on the canvas; callouts stay off them.

## Regions

A compartment can be drawn as a delimited, labelled region with no membrane of its own (`scene.regions`). A compartment of kind `nucleus` gets one when the document also declares another compartment beside it, so that `translocate` between the two is a visible change of place. A document whose only such compartment is the nucleus has no region: the whole canvas is the nucleus, as before.

Since [ADR 0003](adr/0003-compartment-aware-layout.md) every actor is drawn in the band of its resolved compartment, nucleic acids included: a band keeps a lane for each DNA or RNA that is ever in it, reserved from the resolved snapshots of the mechanism and never from its actions.

The region is a band across the bottom with a shallow boundary and its name inside. It has no envelope, pores or inner structure, and it comes from the compartment's existing `kind`: nothing is added to the schema. Free actors in that compartment wait inside it, and so do upcoming ones.

## Stacking

A membrane alone sits in the middle of the canvas. When the document also declares a nucleic acid or a region, things stack from what the document declares, never from who is on screen, so nothing shifts when an actor is hidden:

1. the membrane near the top, with room above for its name;
2. the inner domains of what spans it;
3. the nucleic acid, with room above it for what rests on it;
4. the region.

Free actors and molecules wait between the inner domains and whatever closes their stretch below, in the nearest place along their row that is clear of every body already there. Each band has its own row of slots: an actor that spans the membrane does not move aside because a soluble one became free.

## Contacts

- Two actors that span the membrane meet along it and stay on its plane. Nothing tilts or lifts them to resolve a contact.
- An actor bound to several partners at once is placed from all of them: where it would touch each one gives a contact point, and its body is brought against the partners from the centre of those points. No partner is special.

## Limits

- One bilayer per scene, horizontal. Two membranes are never shown together, and the far side of an organelle membrane (a lumen) has no compartment or name: sides are read as for a plasma membrane.
- A spanning actor is single-pass with one domain per side. Other topologies would be a host choice, like `proteinVisuals`.
- v5 does not declare topology. The side of a site is inferred from who binds it; a site nobody binds has no declared side.

## Upcoming actors

An upcoming (ghost) actor waits in the band of its own compartment, like a present one: an actor that will be cytosolic never waits on the extracellular side, and one that will span the membrane waits on it. Within its band it takes the first place, from the right edge inwards, that is clear of the present actors and of earlier ghosts, so it may wait in a different place from one step to the next.

Without a membrane, upcoming actors wait exactly where they did.
