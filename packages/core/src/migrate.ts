const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const BREAKS = new Set(['single-strand-break', 'double-strand-break']);
/** v2 layout keywords as v3 coordinates on the implicit 100-unit molecule (RFC 0004 §3). */
const KEYWORD_COORDINATES: Record<string, number> = { start: 28, center: 50, end: 72 };

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

/**
 * Convert a schemaVersion 3 document to schemaVersion 4 (RFC 0005). Without `copies` every actor is
 * one instance whose id is the actor id, so references, sites and keys are unchanged: only the
 * version moves. Best effort on malformed input.
 */
export function migrateV3(document: unknown): unknown {
  if (!isObject(document) || document.schemaVersion !== 3) return document;
  return { ...document, schemaVersion: 4 };
}

/**
 * Convert a schemaVersion 4 document to schemaVersion 5 (RFC 0006). Alignments and pairings are new
 * and optional, so only the version moves. Best effort on malformed input.
 */
export function migrateV4(document: unknown): unknown {
  if (!isObject(document) || document.schemaVersion !== 4) return document;
  return { ...document, schemaVersion: 5 };
}

/**
 * Convert a schemaVersion 2 document to schemaVersion 3 (RFC 0004). Sites on nucleic acids trade
 * their layout keyword (or its absence, which meant `center`) for an interbase coordinate on the
 * implicit 100-unit molecule; a `Point` position stays a layout override without a coordinate.
 * Keywords on other actors' sites never had an effect and are dropped. Best effort on malformed input.
 */
export function migrateV2(document: unknown): unknown {
  if (!isObject(document) || document.schemaVersion !== 2) return document;
  return {
    ...document,
    schemaVersion: 3,
    actors: Array.isArray(document.actors) ? document.actors.map(migrateSites) : document.actors,
  };
}

function migrateSites(actor: unknown): unknown {
  if (!isObject(actor) || !Array.isArray(actor.sites)) return actor;
  const nucleic = actor.type === 'dna' || actor.type === 'rna';
  return {
    ...actor,
    sites: actor.sites.map(site => {
      if (!isObject(site) || isObject(site.position)) return site;
      const { position, ...rest } = site;
      if (!nucleic) return position === undefined ? site : rest;
      const at = position === undefined ? KEYWORD_COORDINATES.center : KEYWORD_COORDINATES[position as string];
      return at === undefined ? site : { ...rest, at };
    }),
  };
}
