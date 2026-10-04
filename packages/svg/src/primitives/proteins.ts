import {
  type ProteinMorphology, proteinGeometry, proteinOutlineWidth, proteinMorphology, renderProteinSurface, renderProteinInhibition, proteinProfileGeometry, renderProteinArchitectureSurface,
} from './protein-geometry';
import { type ModificationVisualKind, renderModificationPrimitive } from './modifications';
import { esc } from './shared';
import { proteinSurfacePoint } from './contact';
import type { ProteinVisualProfile } from '../protein-visual-profiles';

export type ProteinVisualState = 'normal' | 'active' | 'inactive' | 'inhibited' | 'degraded' | 'selected' | 'future';

export interface ProteinPrimitiveOptions {
  visualSeed: string;
  radius?: number;
  fill?: string;
  state?: ProteinVisualState;
  modifications?: readonly { kind: ModificationVisualKind; length?: number; branched?: boolean }[];
  /** Explicit schematic architecture or silhouette override; independent of activity. */
  morphology?: ProteinMorphology;
  /** Resolved presentation profile: an explicit architecture instead of the seed-derived silhouette. */
  visualProfile?: ProteinVisualProfile;
}

export function renderProteinPrimitive(options: ProteinPrimitiveOptions): string {
  const radius = options.radius ?? 52;
  const state = options.state ?? 'normal';
  const fill = options.fill ?? 'var(--mm-protein,#7d78d8)';
  const particles = options.visualProfile
    ? proteinProfileGeometry(options.visualSeed, radius, 28, options.visualProfile)
    : proteinGeometry(options.visualSeed, radius, 28, options.morphology);
  // Degradation fragments the same geometry instead of generating a different protein.
  const shown = state === 'degraded'
    ? particles.filter((_, index) => index % 3 !== 1).map((particle, index, all) => {
      const scatter = 1.25 + index / all.length * .8;
      return { ...particle, x: particle.x * scatter, y: particle.y * scatter, rx: particle.rx * .82, ry: particle.ry * .82 };
    })
    : particles;
  const halo = state === 'active' || state === 'selected' ? `<circle class="mm-primitive__halo" r="${radius + 14}"/>` : '';
  const inhibit = state === 'inhibited' ? renderProteinInhibition(shown, radius) : '';
  // Markers keep their stable fan of angles, but each one sits on the visible outline along its ray,
  // so concave, crescent and ring silhouettes never leave a marker floating over a gap.
  const carrier = { particles: shown, margin: proteinOutlineWidth(radius) };
  const modifications = (options.modifications ?? []).map((modification, index) => {
    const angle = -2.3 + index * .55;
    return renderModificationPrimitive(modification, proteinSurfacePoint(shown, angle, radius), { direction: { x: Math.cos(angle), y: Math.sin(angle) }, carrier });
  }).join('');
  const surface = options.visualProfile ? renderProteinArchitectureSurface(shown, fill, radius, options.visualProfile) : renderProteinSurface(shown, fill, radius);
  const profileAttributes = options.visualProfile ? ` data-architecture="${options.visualProfile.architecture}" data-fold="${options.visualProfile.fold}" data-disorder="${options.visualProfile.disorder}"` : '';
  return `<g class="mm-primitive mm-primitive--protein mm-primitive--${state}" data-visual-seed="${esc(options.visualSeed)}" data-morphology="${options.morphology ?? proteinMorphology(options.visualSeed)}"${profileAttributes} style="--mm-protein:${esc(fill)}">${halo}${inhibit}${surface}${modifications}</g>`;
}

// One CSS constant per primitive, so independent changes to different primitives do not collide.

/** Protein surfaces, states, halo and inhibition. */
export const proteinCss = `.mm-primitive .mm-surface{filter:drop-shadow(0 4px 4px #17213b24)}
.mm-primitive--inactive{opacity:.48;filter:saturate(.45)}.mm-primitive--future{opacity:.26;filter:blur(2.2px);pointer-events:none}.mm-primitive--degraded{opacity:.55}.mm-primitive__halo{fill:var(--mm-protein);opacity:.16;animation:mm-primitive-breathe 3s ease-in-out infinite}.mm-primitive--selected .mm-primitive__halo{stroke:var(--mm-accent,#2563eb);stroke-width:2}
.mm-primitive--inhibited > .mm-surface{filter:saturate(.72);opacity:.92}
@media(prefers-reduced-motion:reduce){.mm-primitive__halo{animation:none}}`;
