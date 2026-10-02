// Public facade: primitive implementations and their styles live in family modules.
export {
  type ProteinVisualState, type ProteinPrimitiveOptions, renderProteinPrimitive, proteinCss,
} from './primitives/proteins';
export {
  type ModificationVisualKind, UBIQUITIN_RADIUS, ubiquitinGeometry, renderModificationPrimitive, modificationCss,
} from './primitives/modifications';
export {
  type DnaVisualState, type NucleicAcidOptions, type NascentStrandGeometry, nascentStrandGeometry, renderNucleicAcidPrimitive, nucleicCss,
} from './primitives/nucleic-acids';
export { type VisualLesion, renderLesionPrimitive, lesionCss } from './primitives/lesions';
export {
  type ActionVisualKind, type ActionArrowVariant, type ActionArrowEnd, type ActionArrowMark, type ActionArrowOptions, type ActionArrowGeometry, ACTION_ARROW_STROKE, autoArrowCurvature, actionArrowGeometry, renderActionArrow, ACTION_VISUAL_STYLES, renderActionVisual, actionCss,
} from './primitives/actions';
export { mix } from './primitives/shared';
export { type ProteinSphere, type ProteinMorphology, PROTEIN_MORPHOLOGIES } from './primitives/protein-geometry';
export {
  proteinMorphology, proteinGeometry, renderProteinSurface, proteinOutlineWidth, type ProteinPoint, type ProteinAnchors, proteinAnchors,
} from './primitives/protein-geometry';
export {
  proteinSurfacePoint, type ContactSide, contactOffset, type ContactShape, type FirstContact, contactOutline, shapesOverlap, firstContact,
} from './primitives/contact';
export {
  type MoleculeElement, type MoleculeSubstituent, type MoleculeMark, type MoleculeRingSystem, type MoleculeUnit, type SmallMoleculeTopology, type SmallMoleculeOptions, renderSmallMoleculePrimitive, moleculeCss,
} from './primitives/molecules';
export {
  type MembranePoint, type MembraneShape, type MembraneOptions, type MembraneLipid, type MembraneLeaflet, type MembraneGeometry, membraneGeometry, renderMembranePrimitive, membraneCss,
} from './primitives/membranes';
export {
  type CompartmentVisualKind, type CompartmentOptions, renderCompartmentPrimitive, compartmentCss,
} from './primitives/compartments';
export {
  type InteractionKind, type InteractionOptions, renderInteractionPrimitive, interactionCss,
} from './primitives/interactions';
export { type UnitChainOptions, renderUnitChainPrimitive, unitChainCss } from './primitives/unit-chains';
export {
  type TransmembraneDomain, type TransmembraneOptions, type TransmembraneSpan, type TransmembraneGeometry, transmembraneGeometry, renderTransmembranePrimitive, transmembraneCss,
} from './primitives/transmembrane';
export { motionCss, primitiveCss } from './primitives/styles';
