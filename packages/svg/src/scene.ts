import type { Activity, ActorDefinition, ActorType, LesionType, MechanismSnapshot, Modification, Point } from '@molecular-motion/core';

export interface SceneSite extends Point { reference: string; lesion?: LesionType }

export interface SceneNucleicAcid {
  id: string;
  type: 'dna' | 'rna';
  label: string;
  color?: string;
  y: number;
  sites: SceneSite[];
}

export interface SceneActor extends Point {
  id: string;
  type: ActorType;
  label: string;
  description?: string;
  color: string;
  radius: number;
  compartment?: string;
  activity?: Activity;
  boundTo?: string;
  /** Upcoming actor drawn out of focus; not part of the current state. */
  ghost: boolean;
  /** Which side the label callout sits on. */
  labelSide: -1 | 1;
  /** Modification with a length (PAR chain, filament), drawn as beads along `angle` (radians). */
  chain?: { label: string; length: number; angle: number };
  /** Modifications without a length, drawn as small badges. */
  badges: Modification[];
}

export interface SceneConnection { source: string; target: string; from: Point; to: Point }
export interface SceneLesion extends Point { target: string; type: LesionType }

export interface SvgScene {
  width: number;
  height: number;
  title: string;
  description: string;
  nucleicAcids: SceneNucleicAcid[];
  actors: SceneActor[];
  connections: SceneConnection[];
  lesions: SceneLesion[];
}

export interface SceneOptions {
  width?: number;
  height?: number;
  /** Actors to show out of focus because they appear later (computed by the caller from the timeline). */
  ghosts?: readonly string[];
}

/** Helix geometry shared with the renderer. */
export const HELIX = { amplitude: 30, wavelength: 196 } as const;

const RADIUS: Record<ActorType, number> = { dna: 0, rna: 0, protein: 62, complex: 70, molecule: 24 };
const PALETTE = ['#8b78d0', '#5aa9a0', '#d5839a', '#dca064', '#7c9cc4', '#8fae86', '#c58fc9', '#6fa3c9'];
const CHAIN_ANGLE = -0.45;
/** Docking directions for actors bound to another actor, in radians (SVG y grows downwards). */
const SLOTS = [-0.08, -2.2, -0.95, -3.05, 0.75];
const MOLECULE_SLOTS = [2.95, -2.6, 0.35];

const isNucleic = (type: ActorType) => type === 'dna' || type === 'rna';

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

export const defaultColor = (id: string) => PALETTE[hashString(id) % PALETTE.length]!;
export const chainReach = (length: number) => Math.min(length, 16) * 12;

/**
 * Map resolved state to geometry. Reads only generic state (presence, visibility, bindings,
 * activity, modifications, site lesions) and never action types.
 */
export function buildSvgScene(snapshot: MechanismSnapshot, options: SceneOptions = {}): SvgScene {
  const width = options.width ?? 960;
  const height = options.height ?? 540;
  const ghosts = new Set(options.ghosts ?? []);
  const shown = snapshot.definition.actors.filter(definition => {
    const state = snapshot.actors[definition.id]!;
    return state.present && state.visible;
  });

  const nucleicAcids = shown.filter(definition => isNucleic(definition.type)).map((definition, index): SceneNucleicAcid => {
    const y = definition.position?.y ?? height * .74 + index * 120;
    return {
      id: definition.id,
      type: definition.type as 'dna' | 'rna',
      label: definition.label ?? definition.id,
      ...(definition.color && { color: definition.color }),
      y,
      sites: (definition.sites ?? []).map(site => {
        const reference = `${definition.id}.${site.id}`;
        const lesion = snapshot.sites[reference]?.lesion;
        return { reference, x: siteX(site.position, width), y: y - HELIX.amplitude, ...(lesion && { lesion }) };
      }),
    };
  });
  const siteIndex = new Map(nucleicAcids.flatMap(acid => acid.sites.map(site => [site.reference, site] as const)));
  const acidIndex = new Map(nucleicAcids.map(acid => [acid.id, acid]));

  const proteins = shown.filter(definition => !isNucleic(definition.type));
  const byId = new Map(proteins.map(definition => [definition.id, definition]));
  const placed = new Map<string, SceneActor>();
  const children = new Map<string, ActorDefinition[]>();
  for (const definition of proteins) {
    const partner = snapshot.actors[definition.id]!.boundTo?.split('.')[0];
    if (partner && byId.has(partner)) children.set(partner, [...(children.get(partner) ?? []), definition]);
  }

  const make = (definition: ActorDefinition, point: Point, labelSide: -1 | 1, ghost = false): SceneActor => {
    const state = snapshot.actors[definition.id]!;
    const chain = state.modifications.find(modification => modification.length);
    return {
      id: definition.id,
      type: definition.type,
      label: definition.label ?? definition.id,
      ...(definition.description && { description: definition.description }),
      color: definition.color ?? defaultColor(definition.id),
      radius: RADIUS[definition.type],
      ...(state.compartment && { compartment: state.compartment }),
      ...(state.activity && { activity: state.activity.state }),
      ...(state.boundTo && !ghost && { boundTo: state.boundTo }),
      ghost,
      labelSide,
      ...(chain && !ghost && { chain: { label: chain.label, length: chain.length!, angle: CHAIN_ANGLE } }),
      badges: ghost ? [] : state.modifications.filter(modification => !modification.length),
      x: point.x,
      y: point.y,
    };
  };

  // 1. Actors bound to a nucleic acid sit on the helix above their site: first centred, then left, right, left…
  const onAcid = new Map<string, ActorDefinition[]>();
  for (const definition of proteins) {
    const boundTo = snapshot.actors[definition.id]!.boundTo;
    if (boundTo && acidIndex.has(boundTo.split('.')[0]!)) onAcid.set(boundTo, [...(onAcid.get(boundTo) ?? []), definition]);
  }
  for (const [reference, group] of onAcid) {
    const acid = acidIndex.get(reference.split('.')[0]!)!;
    const anchor = siteIndex.get(reference) ?? { x: width / 2, y: acid.y - HELIX.amplitude };
    let left = anchor.x;
    let right = anchor.x;
    group.forEach((definition, index) => {
      const radius = RADIUS[definition.type];
      let x = anchor.x;
      if (index === 0) { left = x - radius; right = x + radius; }
      else if (index % 2 === 1) { x = left - radius - 4; left = x - radius; }
      else { x = right + radius + 4; right = x + radius; }
      const point = definition.position ?? { x, y: acid.y - HELIX.amplitude - radius - 2 };
      placed.set(definition.id, make(definition, point, index % 2 === 0 && index > 0 ? 1 : -1));
    });
  }

  // Chains leave towards the free side: up-left when a neighbour sits on the right and none on the left.
  for (const actor of placed.values()) {
    if (!actor.chain) continue;
    const neighbours = [...placed.values()].filter(other => other !== actor && Math.abs(other.y - actor.y) < actor.radius);
    const right = neighbours.some(other => other.x > actor.x);
    const left = neighbours.some(other => other.x < actor.x);
    if (right && !left) actor.chain.angle = Math.PI - CHAIN_ANGLE;
  }

  // 2. Free actors (visible, unbound) line up across the top.
  const free = proteins.filter(definition => !placed.has(definition.id) && !snapshot.actors[definition.id]!.boundTo);
  free.forEach((definition, index) => {
    const x = free.length === 1 ? width * .5 : width * (.22 + .56 * index / (free.length - 1));
    placed.set(definition.id, make(definition, definition.position ?? { x, y: height * .26 }, -1));
  });

  // 3. Actors bound to other actors dock against their partner; the first one docks at the tip of a chain.
  const resolving = new Set<string>();
  const place = (definition: ActorDefinition): SceneActor => {
    const existing = placed.get(definition.id);
    if (existing) return existing;
    const partnerId = snapshot.actors[definition.id]!.boundTo?.split('.')[0];
    const partnerDefinition = partnerId ? byId.get(partnerId) : undefined;
    if (!partnerDefinition || resolving.has(definition.id)) {
      const fallback = make(definition, definition.position ?? { x: width * .5, y: height * .26 }, -1);
      placed.set(definition.id, fallback);
      return fallback;
    }
    resolving.add(definition.id);
    const partner = place(partnerDefinition);
    const siblings = children.get(partner.id) ?? [];
    const radius = RADIUS[definition.type];
    let point: Point;
    if (definition.type === 'molecule') {
      const index = siblings.filter(item => item.type === 'molecule').indexOf(definition);
      point = polar(partner, MOLECULE_SLOTS[index % MOLECULE_SLOTS.length]!, partner.radius + radius + 6);
    } else {
      let slot = siblings.filter(item => item.type !== 'molecule').indexOf(definition);
      if (partner.chain && slot === 0) {
        point = polar(partner, partner.chain.angle, partner.radius + chainReach(partner.chain.length) + radius * .75);
      } else {
        if (partner.chain) slot += 1;
        point = polar(partner, SLOTS[slot % SLOTS.length]!, partner.radius + radius - 8);
      }
    }
    const actor = make(definition, definition.position ?? point, point.x >= partner.x ? 1 : -1);
    placed.set(definition.id, actor);
    resolving.delete(definition.id);
    return actor;
  };
  proteins.forEach(place);

  // 4. Upcoming actors wait out of focus in the upper background, away from the action.
  const upcoming = snapshot.definition.actors.filter(definition => ghosts.has(definition.id) && !placed.has(definition.id) && !isNucleic(definition.type));
  upcoming.forEach((definition, index) => {
    // Staggered diagonal so their callouts (always on the left) never overlap.
    const x = width * (.79 + .075 * (index % 3));
    const y = height * (.12 + .175 * (index % 3));
    placed.set(definition.id, make(definition, { x, y }, -1, true));
  });

  // Labels go on the side away from docked partners and chains, so callouts do not cross them.
  for (const actor of placed.values()) {
    if (actor.ghost) continue;
    const docked = (children.get(actor.id) ?? []).map(child => placed.get(child.id)!).filter(child => child.type !== 'molecule');
    if (actor.chain) actor.labelSide = Math.cos(actor.chain.angle) > 0 ? -1 : 1;
    else if (docked.some(child => child.x > actor.x + 4)) actor.labelSide = -1;
    else if (docked.some(child => child.x < actor.x - 4)) actor.labelSide = 1;
    // Keep the callout inside the canvas and off other actors; flip only if the other side is better.
    const extent = actor.radius + 30 + actor.label.length * 8.4 + 24;
    const fits = (side: -1 | 1) => side === 1 ? actor.x + extent <= width - 6 : actor.x - extent >= 6;
    const collides = (side: -1 | 1) => [...placed.values()].some(other => other !== actor && !other.ghost
      && Math.abs(other.y - (actor.y - actor.radius - 18)) < other.radius + 14
      && (side === 1 ? other.x + other.radius > actor.x + actor.radius + 22 && other.x - other.radius < actor.x + extent
                     : other.x - other.radius < actor.x - actor.radius - 22 && other.x + other.radius > actor.x - extent));
    const score = (side: -1 | 1) => (fits(side) ? 0 : 2) + (collides(side) ? 1 : 0);
    const other = -actor.labelSide as -1 | 1;
    if (score(other) < score(actor.labelSide)) actor.labelSide = other;
  }

  const actors = snapshot.definition.actors.flatMap(definition => placed.get(definition.id) ?? []);
  const actorIndex = new Map(actors.map(actor => [actor.id, actor]));
  const connections = actors.filter(actor => !actor.ghost && actor.boundTo).flatMap(actor => {
    const reference = actor.boundTo!;
    const acid = acidIndex.get(reference);
    const to = siteIndex.get(reference) ?? actorIndex.get(reference.split('.')[0]!) ?? (acid && { x: actor.x, y: acid.y - HELIX.amplitude });
    return to ? [{ source: actor.id, target: reference, from: { x: actor.x, y: actor.y }, to: { x: to.x, y: to.y } }] : [];
  });
  const lesions = nucleicAcids.flatMap(acid => acid.sites.flatMap(site => site.lesion ? [{ target: site.reference, type: site.lesion, x: site.x, y: site.y }] : []));

  return {
    width, height,
    title: snapshot.step.title,
    description: snapshot.step.description ?? '',
    nucleicAcids, actors, connections, lesions,
  };
}

function polar(origin: Point, angle: number, distance: number): Point {
  return { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
}

function siteX(position: 'start' | 'center' | 'end' | Point | undefined, width: number): number {
  if (typeof position === 'object') return position.x;
  return position === 'start' ? width * .28 : position === 'end' ? width * .72 : width * .5;
}
