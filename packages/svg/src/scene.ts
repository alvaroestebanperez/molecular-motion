import type { ActorState, ActorType, LesionType, MechanismSnapshot, Point } from '@molecular-motion/core';

export interface SceneActor extends Point {
  id: string;
  type: ActorType;
  label: string;
  description?: string;
  color: string;
  boundTo?: string;
  polymer?: { product: string; length: number };
  modifications: { id: string; label: string }[];
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

export function buildSvgScene(snapshot: MechanismSnapshot, options: { width?: number; height?: number } = {}): SvgScene {
  const width = options.width ?? 900;
  const height = options.height ?? 500;
  const visible = Object.values(snapshot.actors).filter(actor => actor.visible);
  const positions = layout(visible, width, height);
  const actors = visible.map(actor => ({
    id: actor.id,
    type: actor.type,
    label: actor.label ?? actor.id,
    description: actor.description,
    color: actor.color ?? DEFAULT_COLORS[actor.type],
    boundTo: actor.boundTo,
    polymer: actor.polymer,
    modifications: actor.modifications,
    ...positions.get(actor.id)!,
  }));
  const connections = actors.filter(actor => actor.boundTo).map(actor => ({
    source: actor.id,
    target: actor.boundTo!,
    from: actor,
    to: targetPoint(actor.boundTo!, positions),
  }));
  const lesions = Object.entries(snapshot.lesions).map(([target, type]) => ({ target, type, ...targetPoint(target, positions) }));
  return {
    width, height,
    title: snapshot.step.title,
    description: snapshot.step.description ?? '',
    actors, connections, lesions,
  };
}

function layout(actors: ActorState[], width: number, height: number) {
  const positions = new Map<string, Point>();
  const nucleic = actors.filter(actor => actor.type === 'dna' || actor.type === 'rna');
  nucleic.forEach((actor, index) => positions.set(actor.id, actor.position ?? { x: width / 2, y: height * .64 + index * 100 }));
  const free = actors.filter(actor => !nucleic.includes(actor) && !actor.boundTo);
  free.forEach((actor, index) => positions.set(actor.id, actor.position ?? {
    x: free.length === 1 ? width / 2 : 100 + index * ((width - 200) / Math.max(1, free.length - 1)),
    y: height * .22 + (index % 2) * 38,
  }));

  const resolving = new Set<string>();
  const resolve = (actor: ActorState): Point => {
    const known = positions.get(actor.id);
    if (known) return known;
    if (!actor.boundTo || resolving.has(actor.id)) return { x: width / 2, y: height * .2 };
    resolving.add(actor.id);
    const targetId = actor.boundTo.split('.')[0]!;
    const targetActor = actors.find(item => item.id === targetId);
    const target = targetActor ? resolve(targetActor) : { x: width / 2, y: height / 2 };
    const siblings = actors.filter(item => item.boundTo === actor.boundTo);
    const index = siblings.findIndex(item => item.id === actor.id);
    const angle = -Math.PI / 2 + (index - (siblings.length - 1) / 2) * .72;
    const point = actor.position ?? { x: target.x + Math.cos(angle) * 110, y: target.y + Math.sin(angle) * 110 };
    positions.set(actor.id, point);
    resolving.delete(actor.id);
    return point;
  };
  actors.forEach(resolve);
  return positions;
}

function targetPoint(reference: string, positions: Map<string, Point>): Point {
  const actorId = reference.split('.')[0]!;
  return positions.get(actorId) ?? { x: 450, y: 250 };
}
