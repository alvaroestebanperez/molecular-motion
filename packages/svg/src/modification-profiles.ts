import type { Modification } from '@molecular-motion/core';
import type { ModificationVisualProfile, ModificationVisualProfiles } from './repeated-marker';

/** Biological semantics are resolved here only; downstream code receives visual properties. */
export const MODIFICATION_VISUAL_PROFILES: ModificationVisualProfiles = Object.freeze({
  ubiquitination: Object.freeze({ marker: 'protein-surface', radius: 10, fill: '#e39467', seed: 'ub', gap: 4.5 }),
});
export function resolveModificationVisualProfile(modification: Modification, profiles: ModificationVisualProfiles = MODIFICATION_VISUAL_PROFILES): ModificationVisualProfile | undefined {
  const profile = Object.hasOwn(profiles, modification.kind) ? profiles[modification.kind] : undefined;
  return profile ? Object.freeze({ ...profile }) : undefined;
}
