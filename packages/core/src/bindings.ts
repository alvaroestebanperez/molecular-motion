import { releasePairings } from './pairings';
import type { Interaction, InteractionEnd, MechanismState, Occupancy } from './types';

/**
 * Bindings live in two records (RFC 0005 §4–5): `interactions` between instances and `occupancy` of
 * instances on nucleic acids. Nothing is stored on the actors; everything below reads or edits those
 * records, and the queries derive what `boundTo` used to say.
 */

type BindingState = Pick<MechanismState, 'interactions' | 'occupancy'>;

/** Text of one end: `instance`, `instance.site`, plus `:interface` when one is used. */
const endKey = (end: InteractionEnd) => `${end.instance}${end.site ? `.${end.site}` : ''}${end.interface ? `:${end.interface}` : ''}`;

/** Canonical id: binder first for directed edges, sorted ends for symmetric ones. */
export function interactionId(ends: [InteractionEnd, InteractionEnd], symmetric = false): string {
  const keys = ends.map(endKey);
  return (symmetric ? keys.sort() : keys).join('~');
}

export const occupancyId = (instance: string, acid: string) => `${instance}@${acid}`;

/** `instance` or `instance.site`, the reference syntax actions use. */
const reference = (instance: string, site?: string) => site ? `${instance}.${site}` : instance;

export function addInteraction(state: BindingState, ends: [InteractionEnd, InteractionEnd], symmetric = false): Interaction {
  const interaction: Interaction = { id: interactionId(ends, symmetric), ends, ...(symmetric && { symmetric: true }) };
  state.interactions[interaction.id] = interaction;
  return interaction;
}

export function addOccupancy(state: BindingState, instance: string, acid: string, site?: string): Occupancy {
  const occupancy: Occupancy = { id: occupancyId(instance, acid), instance, acid, ...(site && { site }) };
  state.occupancy[occupancy.id] = occupancy;
  return occupancy;
}

/**
 * The legacy single attachment of an instance: the anonymous edge it binds through, or its occupancy.
 * v3 allowed exactly one (`boundTo`), and anonymous `bind`/`unbind` keep that contract.
 */
export function anonymousAttachment(state: BindingState, instance: string): { kind: 'interaction' | 'occupancy'; id: string } | undefined {
  const edge = Object.values(state.interactions).find(item => !item.symmetric && item.ends[0].instance === instance && !item.ends[0].interface);
  if (edge) return { kind: 'interaction', id: edge.id };
  // Only a point occupancy (legacy bind) is an anonymous attachment; span occupancy leaves with `vacate`.
  const occupancy = Object.values(state.occupancy).find(item => item.instance === instance && !item.span);
  return occupancy && { kind: 'occupancy', id: occupancy.id };
}

/** Remove the legacy attachment, if any. */
export function detachAnonymous(state: BindingState, instance: string): boolean {
  const attachment = anonymousAttachment(state, instance);
  if (!attachment) return false;
  delete (attachment.kind === 'interaction' ? state.interactions : state.occupancy)[attachment.id];
  return true;
}

/** Remove every binding that involves `instance`, including occupancies on it and its pairings when it is a nucleic acid. */
export function releaseAll(state: BindingState & Pick<MechanismState, 'pairings'>, instance: string): void {
  releasePairings(state, instance);
  for (const edge of Object.values(state.interactions)) if (edge.ends.some(end => end.instance === instance)) delete state.interactions[edge.id];
  for (const occupancy of Object.values(state.occupancy)) if (occupancy.instance === instance || occupancy.acid === instance) delete state.occupancy[occupancy.id];
}

/** Edges that use one interface of an instance (for valence). */
export const interfaceUse = (state: BindingState, instance: string, name: string) =>
  Object.values(state.interactions).filter(edge => edge.ends.some(end => end.instance === instance && end.interface === name)).length;

export interface Partner {
  /** `instance`, `instance.site`, or for occupancy the nucleic acid (`dna`, `dna.lesion`). */
  reference: string;
  via: 'interaction' | 'occupancy';
  id: string;
  /** This instance's interface, and the partner's, when the binding uses interfaces. */
  interface?: string;
  partnerInterface?: string;
}

/** Everything an instance is bound to, in a stable order: its occupancy, then edges by id. */
export function partnersOf(state: BindingState, instance: string): Partner[] {
  const partners: Partner[] = Object.values(state.occupancy).filter(item => item.instance === instance)
    .map(item => ({ reference: reference(item.acid, item.site), via: 'occupancy', id: item.id }));
  for (const edge of Object.values(state.interactions).sort((a, b) => a.id < b.id ? -1 : 1)) {
    const index = edge.ends.findIndex(end => end.instance === instance);
    if (index < 0) continue;
    const self = edge.ends[index]!; const other = edge.ends[1 - index]!;
    partners.push({
      reference: reference(other.instance, other.site), via: 'interaction', id: edge.id,
      ...(self.interface && { interface: self.interface }), ...(other.interface && { partnerInterface: other.interface }),
    });
  }
  return partners;
}

/**
 * The one partner a legacy view would show (what v3 called `boundTo`): what this instance binds, not
 * what binds it. The anonymous attachment when there is one, then the nucleic acid it occupies, then
 * its first outgoing or symmetric edge by id. Derived on demand, never stored.
 */
export function primaryPartner(state: BindingState, instance: string): string | undefined {
  const attachment = anonymousAttachment(state, instance);
  if (attachment?.kind === 'occupancy') { const item = state.occupancy[attachment.id]!; return reference(item.acid, item.site); }
  if (attachment) { const target = state.interactions[attachment.id]!.ends[1]; return reference(target.instance, target.site); }
  const resting = Object.values(state.occupancy).sort((a, b) => a.id < b.id ? -1 : 1).find(item => item.instance === instance);
  if (resting) return reference(resting.acid, resting.site);
  const edge = Object.values(state.interactions).sort((a, b) => a.id < b.id ? -1 : 1)
    .find(item => item.ends[0].instance === instance || (item.symmetric && item.ends[1].instance === instance));
  if (!edge) return undefined;
  const other = edge.ends[0].instance === instance ? edge.ends[1] : edge.ends[0];
  return reference(other.instance, other.site);
}

/**
 * Instances bound *to* `instance`: binders of directed edges that target it, partners of symmetric
 * edges, and occupants when it is a nucleic acid. This is what `translocate { includeBound }` carries
 * along (RFC 0001 §9.7: the partner an instance itself binds is not moved).
 */
export function boundTo(state: BindingState, instance: string): string[] {
  const out = new Set<string>();
  for (const edge of Object.values(state.interactions)) {
    if (edge.symmetric) { const index = edge.ends.findIndex(end => end.instance === instance); if (index >= 0) out.add(edge.ends[1 - index]!.instance); }
    else if (edge.ends[1].instance === instance) out.add(edge.ends[0].instance);
  }
  for (const occupancy of Object.values(state.occupancy)) if (occupancy.acid === instance) out.add(occupancy.instance);
  out.delete(instance);
  return [...out];
}

/** Connected component of the interaction graph around `instance`: a derived complex (RFC 0005 D6). */
export function componentOf(state: BindingState, instance: string): string[] {
  const seen = new Set([instance]);
  const queue = [instance];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of Object.values(state.interactions)) {
      const index = edge.ends.findIndex(end => end.instance === current);
      const other = index >= 0 ? edge.ends[1 - index]!.instance : undefined;
      if (other && !seen.has(other)) { seen.add(other); queue.push(other); }
    }
  }
  return [...seen].sort();
}
