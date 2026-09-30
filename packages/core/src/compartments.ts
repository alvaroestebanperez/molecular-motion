import type { CompartmentDefinition, CompartmentKind } from './types';

export const COMPARTMENT_KINDS: readonly CompartmentKind[] = [
  'extracellular', 'membrane', 'cytoplasm', 'nucleus', 'er', 'golgi', 'mitochondrion', 'endosome', 'generic',
];

/** Data, not engine logic: string shorthands in `compartments:` resolve against this library. */
export const STANDARD_COMPARTMENTS: Readonly<Record<string, CompartmentDefinition>> = {
  extracellular: { id: 'extracellular', kind: 'extracellular', label: 'Extracellular space' },
  membrane: { id: 'membrane', kind: 'membrane', label: 'Plasma membrane' },
  cytoplasm: { id: 'cytoplasm', kind: 'cytoplasm', label: 'Cytoplasm' },
  nucleus: { id: 'nucleus', kind: 'nucleus', label: 'Nucleus', parent: 'cytoplasm' },
  er: { id: 'er', kind: 'er', label: 'Endoplasmic reticulum', parent: 'cytoplasm' },
  golgi: { id: 'golgi', kind: 'golgi', label: 'Golgi apparatus', parent: 'cytoplasm' },
  mitochondrion: { id: 'mitochondrion', kind: 'mitochondrion', label: 'Mitochondrion', parent: 'cytoplasm' },
  endosome: { id: 'endosome', kind: 'endosome', label: 'Endosome', parent: 'cytoplasm' },
};

/**
 * Resolve shorthands and defaults. A library parent that the mechanism does not declare is dropped,
 * so `compartments: [nucleus]` works on its own.
 */
export function normalizeCompartments(input: unknown[], issues: string[]): CompartmentDefinition[] {
  const resolved = input.map((entry, index): CompartmentDefinition | undefined => {
    const path = `compartments[${index}]`;
    if (typeof entry === 'string') {
      const standard = STANDARD_COMPARTMENTS[entry];
      if (!standard) issues.push(`${path} "${entry}" is not a standard compartment; use { id, kind } for custom ones`);
      return standard && { ...standard };
    }
    if (typeof entry !== 'object' || entry === null || typeof (entry as { id?: unknown }).id !== 'string') {
      issues.push(`${path} must be a compartment id or an object with an id`);
      return undefined;
    }
    const { id, kind, label, parent } = entry as Record<string, unknown>;
    const fallbackKind = (COMPARTMENT_KINDS as readonly unknown[]).includes(id) ? id as CompartmentKind : 'generic';
    if (kind !== undefined && !(COMPARTMENT_KINDS as readonly unknown[]).includes(kind)) issues.push(`${path}.kind "${String(kind)}" is not supported`);
    return {
      id: id as string,
      kind: (kind as CompartmentKind | undefined) ?? fallbackKind,
      ...(typeof label === 'string' && { label }),
      ...(typeof parent === 'string' && { parent }),
    };
  }).filter((entry): entry is CompartmentDefinition => entry !== undefined);

  const ids = new Set<string>();
  for (const compartment of resolved) {
    if (ids.has(compartment.id)) issues.push(`compartments duplicates "${compartment.id}"`);
    ids.add(compartment.id);
  }
  const explicit = new Set(input.flatMap(entry => typeof entry === 'object' && entry && typeof (entry as { parent?: unknown }).parent === 'string' ? [(entry as { id: string }).id] : []));
  for (const compartment of resolved) {
    if (!compartment.parent || ids.has(compartment.parent)) continue;
    if (explicit.has(compartment.id)) issues.push(`compartment "${compartment.id}" has unknown parent "${compartment.parent}"`);
    delete compartment.parent;
  }
  const byId = new Map(resolved.map(compartment => [compartment.id, compartment]));
  for (const compartment of resolved) {
    const seen = new Set<string>();
    for (let current: CompartmentDefinition | undefined = compartment; current?.parent; current = byId.get(current.parent)) {
      if (seen.has(current.id)) { issues.push(`compartment "${compartment.id}" has a cyclic parent chain`); break; }
      seen.add(current.id);
    }
  }
  return resolved;
}
