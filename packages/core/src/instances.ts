import type { ActorDefinition, ActorInstance, MechanismDefinition } from './types';

/** Separator between an actor id and a copy number in an instance id (`rad51#3`). */
export const INSTANCE_SEPARATOR = '#';

/** Instance ids of one actor: `id#1 … id#n` with `copies: n`, otherwise just the actor id (RFC 0005 §3.1). */
export const instanceIds = (actor: Pick<ActorDefinition, 'id' | 'copies'>): string[] =>
  actor.copies === undefined ? [actor.id] : Array.from({ length: actor.copies }, (_, index) => `${actor.id}${INSTANCE_SEPARATOR}${index + 1}`);

/** Every instance of a mechanism, in declaration order (actors, then copy number). */
export const actorInstances = (definition: Pick<MechanismDefinition, 'actors'>): ActorInstance[] =>
  definition.actors.flatMap(actor => instanceIds(actor).map(id => ({ id, actor })));

/** Actor id an instance id belongs to; an actor id is its own. */
export const actorIdOf = (instance: string) => instance.split(INSTANCE_SEPARATOR)[0]!;

/** Definition of an instance (or of a single-copy actor), if it exists. */
export function instanceDefinition(definition: Pick<MechanismDefinition, 'actors'>, instance: string): ActorDefinition | undefined {
  const actor = definition.actors.find(item => item.id === actorIdOf(instance));
  return actor && instanceIds(actor).includes(instance) ? actor : undefined;
}
