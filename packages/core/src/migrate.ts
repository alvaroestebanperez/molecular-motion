const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const BREAKS = new Set(['single-strand-break', 'double-strand-break']);

/**
 * Convert a schemaVersion 1 document to schemaVersion 2. Best effort on malformed input:
 * anything the migration does not recognise is passed through for the v2 validator to report.
 */
export function migrateV1(document: unknown): unknown {
  if (!isObject(document) || document.schemaVersion !== 1) return document;
  return {
    ...document,
    schemaVersion: 2,
    actors: Array.isArray(document.actors) ? document.actors.map(migrateActor) : document.actors,
    steps: Array.isArray(document.steps) ? document.steps.map(step => isObject(step) && Array.isArray(step.actions)
      ? { ...step, actions: step.actions.map(migrateAction) }
      : step) : document.steps,
  };
}

function migrateActor(actor: unknown): unknown {
  if (!isObject(actor) || actor.initiallyVisible === undefined) return actor;
  const { initiallyVisible, ...rest } = actor;
  return { ...rest, initial: { visible: initiallyVisible } };
}

function migrateAction(action: unknown): unknown {
  if (!isObject(action)) return action;
  const { type, ...rest } = action;
  switch (type) {
    case 'create-lesion': {
      const { lesion, ...fields } = rest;
      return lesion === undefined || BREAKS.has(lesion as string)
        ? { type: 'cleave', ...fields, ...(lesion !== undefined && { lesion }) }
        : { type: 'damage', ...fields, lesion };
    }
    case 'repair-lesion': return { type: 'repair', ...rest };
    case 'modify': {
      const { modification, ...fields } = rest;
      return { type: 'modify', ...fields, kind: modification };
    }
    default: return action;
  }
}
