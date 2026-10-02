import type { ActorDefinition, ActorSite, NucleicForm } from './types';

/** Length of a nucleic acid that declares none. Chosen so v2 `start`/`center`/`end` map to 28/50/72. */
export const DEFAULT_NUCLEIC_LENGTH = 100;

export const isNucleicActor = (actor: Pick<ActorDefinition, 'type'>) => actor.type === 'dna' || actor.type === 'rna';

export const nucleicLength = (actor: Pick<ActorDefinition, 'nucleic'>) => actor.nucleic?.length ?? DEFAULT_NUCLEIC_LENGTH;

export const nucleicForm = (actor: Pick<ActorDefinition, 'type' | 'nucleic'>): NucleicForm =>
  actor.nucleic?.form ?? (actor.type === 'rna' ? 'single' : 'duplex');

/** Interbase interval of a site; a point site is the empty interval at its boundary. Undefined without a coordinate. */
export function siteInterval(site: Pick<ActorSite, 'at' | 'span'>): { from: number; to: number } | undefined {
  if (site.at !== undefined) return { from: site.at, to: site.at };
  if (site.span) return { from: site.span[0], to: site.span[1] };
  return undefined;
}
