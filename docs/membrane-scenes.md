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

## Limits

- One membrane per scene, horizontal, with the plasma-membrane reading of its sides. Organelle membranes (an ER membrane with a lumen) are not covered.
- A spanning actor is single-pass with one domain per side. Other topologies would be a host choice, like `proteinVisuals`.
- v5 does not declare topology. The side of a site is inferred from who binds it; a site nobody binds has no declared side.

## Next

Upcoming (ghost) actors are still placed at fixed places on the canvas. They must wait in the band of their own compartment: a cytoplasmic actor cannot appear on the extracellular side while it is still a ghost.
