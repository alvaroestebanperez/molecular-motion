import type { Activity, ActorDefinition, ActorType, LesionType, MechanismSnapshot, Modification, Point } from '@molecular-motion/core';

export interface SceneActor extends Point {
  id: string;
  type: ActorType;
  label: string;
  description?: string;
  color: string;
  compartment?: string;
  activity?: Activity;
  boundTo?: string;
  /** First modification that carries a length (PAR chain, filament), drawn as beads. */
  polymer?: { product: string; length: number };
  modifications: Modification[];
}

export interface SceneConnection { source: string; target: string; from: Point; to: Point }
export interface SceneLesion extends Point { target: string; type: LesionType }
export interface SvgScene {
  width: number;
  height: number;
  title: string;
  description: string;
  actors: SceneActor[];
  connections: SceneConnection[];
  lesions: SceneLesion[];
}

const DEFAULT_COLORS: Record<ActorType, string> = {
  dna: '#94a3b8', rna: '#34d399', protein: '#22d3ee', molecule: '#a78bfa', complex: '#fb923c',
};

interface LayoutActor { definition: ActorDefinition; boundTo?: string }

/** Map resolved state to geometry. Reads only generic state fields, never action types. */
export function buildSvgScene(snapshot: MechanismSnapshot, options: { width?: number; height?: number } = {}): SvgScene {
  const width = options.width ?? 900;
  const height = options.height ?? 500;
  const visible: LayoutActor[] = snapshot.definition.actors
    .filter(definition => { const state = snapshot.actors[definition.id]!; return state.present && state.visible; })
    .map(definition => ({ definition, boundTo: snapshot.actors[definition.id]!.boundTo }));
  const positions = layout(visible, width, height);
  const actors = visible.map(({ definition }): SceneActor => {
    const state = snapshot.actors[definition.id]!;
    const chain = state.modifications.find(modification => modification.length);
    return {
      id: definition.id,
      type: definition.type,
      label: definition.label ?? definition.id,
      description: definition.description,
      color: definition.color ?? DEFAULT_COLORS[definition.type],
      compartment: state.compartment,
      activity: state.activity?.state,
      boundTo: state.boundTo,
      polymer: chain && { product: chain.label, length: chain.length! },
      modifications: [...state.modifications],
      ...positions.get(definition.id)!,
    };
  });
  const connections = actors.filter(actor => actor.boundTo && positions.has(actor.boundTo.split('.')[0]!)).map(actor => ({
    source: actor.id,
    target: actor.boundTo!,
    from: { x: actor.x, y: actor.y },
    to: targetPoint(actor.boundTo!, positions),
  }));
  const lesions = Object.entries(snapshot.sites).flatMap(([target, site]) =>
    site.lesion && positions.has(target.split('.')[0]!) ? [{ target, type: site.lesion, ...targetPoint(target, positions) }] : []);
  return {
    width, height,
    title: snapshot.step.title,
    description: snapshot.step.description ?? '',
    actors, connections, lesions,
  };
}

function layout(actors: LayoutActor[], width: number, height: number) {
  const positions = new Map<string, Point>();
  const isNucleic = ({ definition }: LayoutActor) => definition.type === 'dna' || definition.type === 'rna';
  const nucleic = actors.filter(isNucleic);
  nucleic.forEach(({ definition }, index) => positions.set(definition.id, definition.position ?? { x: width / 2, y: height * .64 + index * 100 }));
  const free = actors.filter(actor => !isNucleic(actor) && !actor.boundTo);
  free.forEach(({ definition }, index) => positions.set(definition.id, definition.position ?? {
    x: free.length === 1 ? width / 2 : 100 + index * ((width - 200) / Math.max(1, free.length - 1)),
    y: height * .22 + (index % 2) * 38,
  }));

  const resolving = new Set<string>();
  const resolve = (actor: LayoutActor): Point => {
    const { id, position } = actor.definition;
    const known = positions.get(id);
    if (known) return known;
    if (!actor.boundTo || resolving.has(id)) return { x: width / 2, y: height * .2 };
    resolving.add(id);
    const targetActor = actors.find(item => item.definition.id === actor.boundTo!.split('.')[0]);
    const target = targetActor ? resolve(targetActor) : { x: width / 2, y: height / 2 };
    const siblings = actors.filter(item => item.boundTo === actor.boundTo);
    const index = siblings.findIndex(item => item.definition.id === id);
    const angle = -Math.PI / 2 + (index - (siblings.length - 1) / 2) * .72;
    const point = position ?? { x: target.x + Math.cos(angle) * 110, y: target.y + Math.sin(angle) * 110 };
    positions.set(id, point);
    resolving.delete(id);
    return point;
  };
  actors.forEach(resolve);
  return positions;
}

function targetPoint(reference: string, positions: Map<string, Point>): Point {
  const actorId = reference.split('.')[0]!;
  return positions.get(actorId) ?? { x: 450, y: 250 };
}
