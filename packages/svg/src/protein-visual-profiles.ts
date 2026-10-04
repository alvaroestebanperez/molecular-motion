/**
 * Presentation-only protein profiles. Three independent dimensions describe a conceptual SVG glyph;
 * none of them is a PDB structure, an actor field or core state.
 */

/** Global shape: how the mass of the protein is arranged. `surface` lets the visual seed choose. */
export type ProteinArchitecture =
  | 'surface' | 'compact' | 'elongated' | 'bilobed' | 'multidomain' | 'crescent'
  | 'y-shaped' | 'dimer' | 'fibrous' | 'ring' | 'barrel' | 'multisubunit';

/** Structural motif of the folded body: built from rod and strand volumes, never drawn over a surface. */
export type ProteinFold = 'none' | 'helical-bundle' | 'beta-sandwich' | 'beta-propeller' | 'alpha-beta';

/** Intrinsic disorder: `tail` adds a disordered region to a folded body; `extended` is a mostly disordered protein. */
export type ProteinDisorder = 'none' | 'tail' | 'extended';

export interface ProteinVisualProfile {
  architecture: ProteinArchitecture;
  fold: ProteinFold;
  disorder: ProteinDisorder;
}

export const PROTEIN_ARCHITECTURES: readonly ProteinArchitecture[] = [
  'surface', 'compact', 'elongated', 'bilobed', 'multidomain', 'crescent',
  'y-shaped', 'dimer', 'fibrous', 'ring', 'barrel', 'multisubunit',
];
export const PROTEIN_FOLDS: readonly ProteinFold[] = ['none', 'helical-bundle', 'beta-sandwich', 'beta-propeller', 'alpha-beta'];
export const PROTEIN_DISORDERS: readonly ProteinDisorder[] = ['none', 'tail', 'extended'];
export const DEFAULT_PROTEIN_VISUAL_PROFILE: Readonly<ProteinVisualProfile> = Object.freeze({ architecture: 'surface', fold: 'none', disorder: 'none' });

/** Architectures whose single globular body can be drawn as a fold. */
const FOLDED_ARCHITECTURES: readonly ProteinArchitecture[] = ['surface', 'compact'];

/**
 * The dimensions are independent, but not every combination has a drawing. Returns why a
 * combination is not drawable, or undefined when it is. Catalogs declare concrete profiles.
 */
export function proteinProfileIssue(profile: ProteinVisualProfile): string | undefined {
  if (profile.fold !== 'none' && !FOLDED_ARCHITECTURES.includes(profile.architecture)) {
    return `fold "${profile.fold}" needs a single globular body (architecture surface or compact), not "${profile.architecture}"`;
  }
  if (profile.disorder === 'extended' && (profile.architecture !== 'surface' || profile.fold !== 'none')) {
    return 'disorder "extended" has no folded body: it needs architecture surface and fold none';
  }
  return undefined;
}

/** Resolve catalog/presentation preferences before rendering. No biological scene fields are read. */
export function resolveProteinVisualProfile(profile: Partial<ProteinVisualProfile> = {}): Readonly<ProteinVisualProfile> {
  const resolved = { ...DEFAULT_PROTEIN_VISUAL_PROFILE, ...Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== undefined)) } as ProteinVisualProfile;
  if (!PROTEIN_ARCHITECTURES.includes(resolved.architecture)) throw new Error(`Unknown protein architecture: ${resolved.architecture}`);
  if (!PROTEIN_FOLDS.includes(resolved.fold)) throw new Error(`Unknown protein fold: ${resolved.fold}`);
  if (!PROTEIN_DISORDERS.includes(resolved.disorder)) throw new Error(`Unknown protein disorder: ${resolved.disorder}`);
  const issue = proteinProfileIssue(resolved);
  if (issue) throw new Error(`Unsupported protein profile: ${issue}`);
  return { architecture: resolved.architecture, fold: resolved.fold, disorder: resolved.disorder };
}
