import { renderProteinPrimitive, type ProteinPrimitiveOptions } from './primitives/proteins';
import { proteinGeometry, proteinProfileGeometry, renderProteinArchitectureSurface, renderProteinSurface, type ProteinSphere } from './primitives/protein-geometry';
import { round } from './primitives/shared';
import type { ProteinVisualProfile } from './protein-visual-profiles';

/** A presentation composition: offsets and appearance carry no biological state or identities. */
export interface ProteinAssemblyMember extends ProteinPrimitiveOptions {
  at: { x: number; y: number };
  rotation?: number;
}
export interface ProteinAssemblyOptions { members: readonly ProteinAssemblyMember[] }

/** Compose any resolved protein profiles; the caller supplies the arrangement, not a semantic name. */
export function renderProteinAssembly(options: ProteinAssemblyOptions): string {
  return `<g class="mm-protein-assembly" data-members="${options.members.length}">${options.members.map(({ at, rotation = 0, ...protein }) => `<g class="mm-protein-assembly__member" transform="translate(${round(at.x)} ${round(at.y)}) rotate(${round(rotation)})">${renderProteinPrimitive(protein)}</g>`).join('')}</g>`;
}

/**
 * How a host chooses to draw one protein or complex actor: a profile, or a composition of profiles.
 * It is presentation data handed to the scene builder, keyed by actor id. The actor stays one actor:
 * an assembly adds no instances, interfaces or interactions.
 */
export type ProteinActorVisual = ({ profile: ProteinVisualProfile } | { assembly: ProteinAssemblyOptions }) & {
  /**
   * Natural size relative to a generic actor of the same type; 1 when omitted. The scene sizes the actor
   * with it, so the drawing is never rescaled on its own: bounds, contacts and collisions follow.
   */
  extent?: number;
};
export type ProteinActorVisuals = Readonly<Record<string, ProteinActorVisual>>;

const MEMBER_RADIUS = 52;
/** Scale that fits a whole assembly, as authored in its own pixels, inside `radius`. */
const assemblyScale = (assembly: ProteinAssemblyOptions, radius: number) =>
  radius / Math.max(...assembly.members.map(member => Math.hypot(member.at.x, member.at.y) + (member.radius ?? MEMBER_RADIUS)));

const memberParticles = (member: ProteinAssemblyMember, radius: number) => member.visualProfile
  ? proteinProfileGeometry(member.visualSeed, radius, 28, member.visualProfile)
  : proteinGeometry(member.visualSeed, radius, 28, member.morphology);

/** Body particles of an actor drawn with a chosen visual, in the actor's local coordinates and within `radius`. */
export function proteinVisualParticles(visualSeed: string, radius: number, count: number, visual: ProteinActorVisual): ProteinSphere[] {
  if ('profile' in visual) return proteinProfileGeometry(visualSeed, radius, count, visual.profile);
  const scale = assemblyScale(visual.assembly, radius);
  return visual.assembly.members.flatMap(member => {
    const turn = (member.rotation ?? 0) * Math.PI / 180;
    return memberParticles(member, (member.radius ?? MEMBER_RADIUS) * scale).map(p => ({
      ...p,
      x: member.at.x * scale + p.x * Math.cos(turn) - p.y * Math.sin(turn),
      y: member.at.y * scale + p.x * Math.sin(turn) + p.y * Math.cos(turn),
      rotation: p.rotation + (member.rotation ?? 0),
    }));
  });
}

/** Surface for the same visual and radius as `proteinVisualParticles`; `fill` colours members that declare none. */
export function renderProteinVisualSurface(visualSeed: string, radius: number, count: number, fill: string, visual: ProteinActorVisual): string {
  if ('profile' in visual) return renderProteinArchitectureSurface(proteinProfileGeometry(visualSeed, radius, count, visual.profile), fill, radius, visual.profile);
  const scale = assemblyScale(visual.assembly, radius);
  return `<g class="mm-surface mm-surface--assembly">${visual.assembly.members.map(member => {
    const size = (member.radius ?? MEMBER_RADIUS) * scale;
    const particles = memberParticles(member, size);
    const surface = member.visualProfile ? renderProteinArchitectureSurface(particles, member.fill ?? fill, size, member.visualProfile) : renderProteinSurface(particles, member.fill ?? fill, size);
    return `<g transform="translate(${round(member.at.x * scale)} ${round(member.at.y * scale)}) rotate(${round(member.rotation ?? 0)})">${surface.replaceAll('mm-surface', 'mm-subunit-surface')}</g>`;
  }).join('')}</g>`;
}
