import type { ActorState, LesionType, MechanismAction, MechanismDefinition, MechanismSnapshot } from './types';
import { validateMechanism } from './validate';

export interface CompiledMechanism {
  readonly definition: MechanismDefinition;
  readonly length: number;
  at(step: number | string): MechanismSnapshot;
}

export function compileMechanism(input: unknown): CompiledMechanism {
  const definition = validateMechanism(input);
  const indexById = new Map(definition.steps.map((step, index) => [step.id, index]));
  return {
    definition,
    length: definition.steps.length,
    at(step) {
      const index = typeof step === 'string' ? indexById.get(step) : step;
      if (index === undefined || !Number.isInteger(index) || index < 0 || index >= definition.steps.length) {
        throw new RangeError(`Unknown mechanism step: ${step}`);
      }
      return snapshotAt(definition, index);
    },
  };
}

export function snapshotAt(definition: MechanismDefinition, stepIndex: number): MechanismSnapshot {
  const actors = Object.fromEntries(definition.actors.map(actor => [actor.id, {
    ...actor,
    visible: actor.initiallyVisible ?? (actor.type === 'dna' || actor.type === 'rna'),
    modifications: [],
  } satisfies ActorState]));
  const lesions: Record<string, LesionType> = {};
  for (const step of definition.steps.slice(0, stepIndex + 1)) {
    for (const action of step.actions) applyAction(actors, lesions, action);
  }
  return { stepIndex, step: definition.steps[stepIndex]!, actors, lesions };
}

function applyAction(actors: Record<string, ActorState>, lesions: Record<string, LesionType>, action: MechanismAction) {
  switch (action.type) {
    case 'create-lesion': lesions[action.target] = action.lesion ?? 'single-strand-break'; break;
    case 'repair-lesion': delete lesions[action.target]; break;
    case 'bind':
    case 'recruit': actors[action.actor]!.visible = true; actors[action.actor]!.boundTo = action.target; break;
    case 'unbind': delete actors[action.actor]!.boundTo; break;
    case 'polymerize': actors[action.actor]!.polymer = { product: action.product, length: action.length ?? 7 }; break;
    case 'modify': actors[action.actor]!.modifications.push({ id: action.modification, label: action.label ?? action.modification }); break;
    case 'show': actors[action.actor]!.visible = true; break;
    case 'hide': actors[action.actor]!.visible = false; break;
  }
}
