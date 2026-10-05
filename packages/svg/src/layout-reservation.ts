import type { MechanismSnapshot } from '@molecular-motion/core';

/**
 * Mechanism-wide layout reservation (ADR 0003 §4.2). A compartment drawn as a band keeps a lane for
 * every nucleic acid that is ever in it, so the bands and their lanes are the same in every step.
 *
 * Layout may reserve space from resolved states across a mechanism, but it must not infer future
 * state from action semantics. Everything here is read from `snapshot.actors[id]`: whether a
 * compartment was reached by `translocate`, by a custom action or by a declaration makes no difference,
 * and no action, timeline or step is ever looked at.
 */

type ResolvedSnapshot = Pick<MechanismSnapshot, 'actors' | 'definition'>;

export interface LayoutReservation {
  /**
   * Per compartment id (`''` for an actor with none), the nucleic acids that need a lane there, in
   * declaration order. A reservation is capacity, not a drawing: an empty lane is empty canvas.
   */
  lanes: Record<string, string[]>;
}

export interface ReservationOptions {
  /**
   * Also reserve for molecules that are not present. Off for a whole mechanism, where a molecule
   * reserves the compartments it is present in at some step. On for a single snapshot, which has no
   * other step to learn from: every molecule in it then reserves where its state says it is.
   */
  absent?: boolean;
}

/** The reservation of a sequence of resolved snapshots. A pure function of their actor states. */
export function layoutReservation(snapshots: Iterable<ResolvedSnapshot>, options: ReservationOptions = {}): LayoutReservation {
  const seen = new Map<string, Set<string>>();
  let order: string[] = [];
  for (const snapshot of snapshots) {
    const acids = snapshot.definition.actors.filter(actor => actor.type === 'dna' || actor.type === 'rna').map(actor => actor.id);
    if (acids.length > order.length) order = acids;
    for (const id of acids) {
      const state = snapshot.actors[id];
      if (!state || (!state.present && !options.absent)) continue;
      const compartment = state.compartment ?? '';
      if (!seen.has(compartment)) seen.set(compartment, new Set());
      seen.get(compartment)!.add(id);
    }
  }
  const lanes: Record<string, string[]> = {};
  for (const compartment of [...seen.keys()].sort()) lanes[compartment] = order.filter(id => seen.get(compartment)!.has(id));
  return { lanes };
}

/** The reservation of a compiled mechanism: every step's resolved snapshot. */
export function mechanismReservation(mechanism: { readonly length: number; at(step: number): ResolvedSnapshot }): LayoutReservation {
  return layoutReservation(Array.from({ length: mechanism.length }, (_, index) => mechanism.at(index)));
}
