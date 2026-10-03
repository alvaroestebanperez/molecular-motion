import { readFileSync } from 'node:fs';
import { primaryPartner, type CompiledMechanism } from '../src';

export const MECHANISMS = ['parp1-ssb-repair', 'homologous-recombination'] as const;
/** Every shipped example, including those with no legacy fixture. */
export const EXAMPLES = [...MECHANISMS, 'egfr-dimerization'] as const;

export const readExample = (name: string) => readFileSync(new URL(`../../../examples/${name}.yaml`, import.meta.url), 'utf8');
export const readV1Fixture = (name: string) => readFileSync(new URL(`./fixtures/v1/${name}.yaml`, import.meta.url), 'utf8');
export const readGolden = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/v1/${name}.golden.json`, import.meta.url), 'utf8'));

/** Project v2 snapshots onto what the v1 engine exposed, to compare against golden output. */
export function projectToV1(mechanism: CompiledMechanism) {
  return Array.from({ length: mechanism.length }, (_, index) => {
    const snapshot = mechanism.at(index);
    return {
      step: snapshot.step.id,
      actors: Object.fromEntries(Object.values(snapshot.actors).map(actor => {
        const chain = actor.modifications.find(modification => modification.length);
        return [actor.id, {
          visible: actor.present && actor.visible,
          boundTo: primaryPartner(snapshot, actor.id) ?? null,
          polymer: chain ? { product: chain.label, length: chain.length } : null,
        }];
      })),
      lesions: Object.fromEntries(Object.entries(snapshot.sites).flatMap(([reference, site]) => site.lesion ? [[reference, site.lesion]] : [])),
    };
  });
}

/** Every snapshot of a mechanism as plain JSON (drops the shared definition). */
export const allStates = (mechanism: CompiledMechanism) =>
  Array.from({ length: mechanism.length }, (_, index) => {
    const { actors, sites, interactions, occupancy, pairings, timeline, duration } = mechanism.at(index);
    return JSON.parse(JSON.stringify({ actors, sites, interactions, occupancy, pairings, timeline, duration }));
  });

/**
 * Meaning of every step, independent of how state is stored (RFC 0005 §8). Schema v4 moves bindings
 * out of `ActorState.boundTo` into an interaction graph; later PRs rebuild this exact projection from
 * the v4 API and must match the baseline recorded from v3. Timing and subjects are included, the
 * per-action change keys are not (they name storage, which is allowed to change).
 */
export function semanticProjection(mechanism: CompiledMechanism, options: { assemblies?: boolean } = {}) {
  return Array.from({ length: mechanism.length }, (_, index) => {
    const snapshot = mechanism.at(index);
    return {
      step: snapshot.step.id,
      // v4 documents author these directly (interfaces, copies, footprints), so they are meaning there.
      ...(options.assemblies ? { interactions: snapshot.interactions, occupancy: snapshot.occupancy } : {}),
      actors: Object.fromEntries(Object.values(snapshot.actors).map(actor => [actor.id, {
        present: actor.present,
        visible: actor.visible,
        compartment: actor.compartment ?? null,
        activity: actor.activity ?? null,
        // v4: rebuilt from the interaction graph and occupancy, never stored on the actor.
        partner: primaryPartner(snapshot, actor.id) ?? null,
        modifications: actor.modifications,
        nucleic: actor.nucleic ?? null,
      }])),
      lesions: Object.fromEntries(Object.entries(snapshot.sites).flatMap(([reference, site]) => site.lesion ? [[reference, site.lesion]] : [])),
      timeline: snapshot.timeline.map(({ path, type, primitive, subject, agent, start, duration }) => ({ path, type, primitive, subject: subject ?? null, agent: agent ?? null, start, duration })),
      duration: snapshot.duration,
    };
  });
}
