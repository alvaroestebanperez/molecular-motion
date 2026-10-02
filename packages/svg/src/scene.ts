import { hashString } from './primitives/shared';
import type { Activity, ActorDefinition, ActorType, LesionType, MechanismSnapshot, Modification, Point } from '@molecular-motion/core';
import { contactOutline, firstContact, proteinGeometry, proteinOutlineWidth, type ContactShape, type FirstContact, type ProteinSphere } from './primitives';

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

/**
 * A `boundTo` relation. `contact` (the default layout): the actor touches its partner, or the
 * backbone at the bound site, and `from`/`to` are the point where the outlines meet; the renderer
 * draws no line, only a soft contact shadow. `relation`: the layout could not honour contact
 * (an author-fixed `position`), so `from`/`to` run centre to target and a dotted link is drawn.
 */
export interface SceneConnection { source: string; target: string; from: Point; to: Point; kind?: 'contact' | 'relation' }
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

/** Helix geometry shared with the renderer: strand amplitude, wavelength and stroke widths. */
export const HELIX = { amplitude: 30, wavelength: 196, tube: 12, backTube: 10 } as const;

/** Centre line of one strand of a helix at `x` (strand 0 crests at the first site). */
export function helixY(acid: Pick<SceneNucleicAcid, 'y' | 'sites'>, strand: 0 | 1, x: number, width: number): number {
  const phaseX = acid.sites[0]?.x ?? width / 2;
  return acid.y + (strand === 0 ? -HELIX.amplitude : HELIX.amplitude) * Math.cos(2 * Math.PI / HELIX.wavelength * (x - phaseX));
}
/** Upper visible surface of the helix at `x`: the top edge of whichever backbone tube is higher. */
const helixTop = (acid: SceneNucleicAcid, x: number, width: number) =>
  Math.min(helixY(acid, 0, x, width) - HELIX.tube / 2, helixY(acid, 1, x, width) - HELIX.backTube / 2);

const RADIUS: Record<ActorType, number> = { dna: 0, rna: 0, protein: 62, complex: 70, molecule: 24 };
const PALETTE = ['#8b78d0', '#5aa9a0', '#d5839a', '#dca064', '#7c9cc4', '#8fae86', '#c58fc9', '#6fa3c9'];
const CHAIN_ANGLE = -0.45;
/** Docking directions for actors bound to another actor, in radians (SVG y grows downwards). */
const SLOTS = [-0.08, -2.2, -0.95, -3.05, 0.75];
const MOLECULE_SLOTS = [2.95, -2.6, 0.35];
/** Gap between neighbours resting on the same site: they share the site but do not touch. */
const SIDE_GAP = 8;

const isNucleic = (type: ActorType) => type === 'dna' || type === 'rna';

export { hashString } from './primitives/shared';

export const defaultColor = (id: string) => PALETTE[hashString(id) % PALETTE.length]!;
export const chainReach = (length: number) => Math.min(length, 16) * 12;

/** Small ball-and-stick chain for small molecules; jitter is seeded by the actor id. */
export function moleculeAtoms(seed: number, radius: number): { x: number; y: number; r: number }[] {
  let state = seed || 1;
  const random = () => { state = Math.imul(state ^ (state >>> 15), 2246822507) ^ Math.imul(state ^ (state >>> 13), 3266489909); return ((state ^= state >>> 16) >>> 0) / 4294967296; };
  return Array.from({ length: 6 }, (_, index) => ({ x: (index - 2.5) * radius * .55, y: (index % 2 ? -1 : 1) * radius * .32 + (random() - .5) * 4, r: radius * .36 }));
}

/** Width of the outline drawn around an actor's body (part of its visible surface). */
export const actorOutline = (type: ActorType, radius: number) => type === 'molecule' ? 1.6 : proteinOutlineWidth(radius);

/** Particles of an actor's body in local coordinates; the renderer draws exactly these. */
export function actorParticles(id: string, type: ActorType, radius: number): ProteinSphere[] {
  if (type !== 'molecule') return proteinGeometry(id, radius, type === 'complex' ? 32 : 28);
  return moleculeAtoms(hashString(id), radius).map(atom => ({ ...atom, rx: atom.r, ry: atom.r, rotation: 0, depth: 0 }));
}

/**
 * Bead chain (PAR, filament) leaving the surface along `angle`: beads and links, in local
 * coordinates. `base` is where the visible surface ends along that angle (see `chainBase`); the
 * first bead sits just outside it, so the chain is attached to the body rather than floating.
 */
export function chainGeometry(radius: number, angle: number, length: number, base = radius) {
  const beads: { x: number; y: number; r: number; index: number }[] = [];
  const links: [Point, Point][] = [];
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -direction.y, y: direction.x };
  const count = Math.min(length, 16);
  let previous = { x: direction.x * (base - 4), y: direction.y * (base - 4) };
  for (let index = 0; index < count; index++) {
    const along = base + 6 + index * 12;
    const wave = Math.sin(index * 1.3) * 6;
    const point = { x: direction.x * along + normal.x * wave, y: direction.y * along + normal.y * wave };
    links.push([previous, point]);
    beads.push({ ...point, r: 6, index });
    if (index % 4 === 2 && index < count - 2) {
      // Short side branch, as PAR and other polymers branch.
      let tip = point;
      for (let branch = 1; branch <= 2; branch++) {
        const next = { x: point.x + normal.x * 12 * branch - direction.x * 3 * branch, y: point.y + normal.y * 12 * branch - direction.y * 3 * branch };
        links.push([tip, next]);
        beads.push({ ...next, r: 5.2, index: index + branch });
        tip = next;
      }
    }
    previous = point;
  }
  return { beads, links };
}

/** Bead stroke drawn by the renderer, part of the chain's visible surface. */
const BEAD_OUTLINE = .6;
const SHAPES = new Map<string, ContactShape>();
const CONTACTS = new Map<string, FirstContact>();
type Shaped = Pick<SceneActor, 'id' | 'type' | 'radius' | 'chain'>;
const shapeKey = (actor: Shaped) => `${actor.id}|${actor.type}|${actor.radius}|${actor.chain ? `${actor.chain.length}@${actor.chain.angle}` : ''}`;

/** Everything visible of an actor that a partner can touch: its body plus its chain, outlines included. */
export function actorContactShape(actor: Shaped): ContactShape {
  const key = shapeKey(actor);
  let shape = SHAPES.get(key);
  if (!shape) {
    const margin = actorOutline(actor.type, actor.radius);
    const body = actorParticles(actor.id, actor.type, actor.radius).map(particle => ({ ...particle, rx: particle.rx + margin, ry: particle.ry + margin }));
    const beads = actor.chain ? chainGeometry(actor.radius, actor.chain.angle, actor.chain.length, chainBase(actor)).beads
      .map(bead => ({ x: bead.x, y: bead.y, r: bead.r + BEAD_OUTLINE, rx: bead.r + BEAD_OUTLINE, ry: bead.r + BEAD_OUTLINE, rotation: 0, depth: 1 })) : [];
    shape = { particles: [...body, ...beads] };
    if (SHAPES.size > 512) SHAPES.clear();
    SHAPES.set(key, shape);
  }
  return shape;
}

const BASES = new Map<string, number>();
/** Distance from the origin to the visible surface (outline included) along the actor's chain angle. */
export function chainBase(actor: Shaped): number {
  if (!actor.chain) return actor.radius;
  const key = `${shapeKey(actor)}`;
  let base = BASES.get(key);
  if (base === undefined) {
    const body = actorContactShape({ id: actor.id, type: actor.type, radius: actor.radius });
    const d = { x: Math.cos(actor.chain.angle), y: Math.sin(actor.chain.angle) };
    const along = contactOutline(body).filter(point => Math.abs(point.x * d.y - point.y * d.x) < 3).map(point => point.x * d.x + point.y * d.y);
    base = Math.round(Math.max(actor.radius * .3, ...along) * 10) / 10;
    if (BASES.size > 512) BASES.clear();
    BASES.set(key, base);
  }
  return base;
}

/** First contact of `partner` against `anchor` along `angle`, memoised (pure, so caching is safe). */
function contactAlong(anchor: Shaped, partner: Shaped, angle: number): FirstContact {
  const key = `${shapeKey(anchor)}>${shapeKey(partner)}@${angle}`;
  let contact = CONTACTS.get(key);
  if (!contact) {
    contact = firstContact(actorContactShape(anchor), actorContactShape(partner), { x: Math.cos(angle), y: Math.sin(angle) });
    if (CONTACTS.size > 512) CONTACTS.clear();
    CONTACTS.set(key, contact);
  }
  return contact;
}

/** Horizontal extent of an actor's visible shape relative to its origin. */
function extentX(actor: Shaped): [number, number] {
  const xs = contactOutline(actorContactShape(actor)).map(point => point.x);
  return [Math.min(...xs), Math.max(...xs)];
}

/** Smallest vertical gap between an actor's outline (origin at x, y) and the helix surface below it. */
function clearance(actor: Shaped, x: number, y: number, acid: SceneNucleicAcid, width: number): number {
  return Math.min(...contactOutline(actorContactShape(actor)).map(point => helixTop(acid, x + point.x, width) - (y + point.y)));
}

/**
 * Lowest y for the actor's origin at `x` such that its outline rests on the helix, pressed `press` px
 * so the outlines merge; returns the origin and where the outlines meet.
 */
function restOnHelix(actor: Shaped, x: number, acid: SceneNucleicAcid, width: number, press = 1.5): { y: number; contact: Point } {
  let best = Infinity; let contact: Point = { x, y: acid.y };
  for (const point of contactOutline(actorContactShape(actor))) {
    const top = helixTop(acid, x + point.x, width);
    if (top - point.y < best) { best = top - point.y; contact = { x: x + point.x, y: top }; }
  }
  return { y: best + press, contact: { x: Math.round(contact.x * 10) / 10, y: Math.round(contact.y * 10) / 10 } };
}

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

  // Where each bound actor touches its partner (or the backbone), when the layout placed it in contact.
  const contacts = new Map<string, Point>();

  // 1. Actors bound to a nucleic acid rest on the helix at their site: first centred, then left, right, left…
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
      // Neighbours on the same site are spaced by their visible outlines, not by bounding circles.
      const body = { id: definition.id, type: definition.type, radius: RADIUS[definition.type] };
      const [minX, maxX] = extentX(body);
      let x = anchor.x;
      if (index === 0) { left = x + minX; right = x + maxX; }
      else if (index % 2 === 1) { x = left - SIDE_GAP - maxX; left = x + minX; }
      else { x = right + SIDE_GAP - minX; right = x + maxX; }
      let point = definition.position;
      if (!point) {
        const rest = restOnHelix(body, x, acid, width);
        point = { x, y: rest.y };
        contacts.set(definition.id, rest.contact);
      }
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

  // 3. Actors bound to other actors dock against their partner (body or chain) by first contact along a
  //    slot direction; the first one docks at the tip of a chain.
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
    let angle: number;
    if (definition.type === 'molecule') {
      const index = siblings.filter(item => item.type === 'molecule').indexOf(definition);
      angle = MOLECULE_SLOTS[index % MOLECULE_SLOTS.length]!;
    } else {
      let slot = siblings.filter(item => item.type !== 'molecule').indexOf(definition);
      if (partner.chain && slot === 0) angle = partner.chain.angle;
      else {
        if (partner.chain) slot += 1;
        angle = SLOTS[slot % SLOTS.length]!;
      }
    }
    const actor = make(definition, { x: partner.x, y: partner.y }, Math.cos(angle) >= 0 ? 1 : -1);
    if (definition.position) Object.assign(actor, { x: definition.position.x, y: definition.position.y });
    else {
      // A docked actor must not sink into a nucleic acid: tilt its slot towards "up" until it clears.
      const clears = (fit: FirstContact) => nucleicAcids.every(acid => clearance(actor, partner.x + fit.offset.x, partner.y + fit.offset.y, acid, width) >= 0);
      let fit = contactAlong(partner, actor, angle);
      for (let step = 0; step < 10 && !clears(fit); step++) {
        angle += Math.sign(Math.atan2(Math.sin(-Math.PI / 2 - angle), Math.cos(-Math.PI / 2 - angle))) * .15;
        fit = contactAlong(partner, actor, angle);
      }
      actor.x = Math.round((partner.x + fit.offset.x) * 10) / 10;
      actor.y = Math.round((partner.y + fit.offset.y) * 10) / 10;
      contacts.set(actor.id, { x: Math.round((partner.x + fit.point.x) * 10) / 10, y: Math.round((partner.y + fit.point.y) * 10) / 10 });
    }
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
    // On the chain's side the pill is lifted above the chain; it must still clear the chain's callout.
    const chained = (side: -1 | 1) => {
      if (!actor.chain || Math.sign(Math.cos(actor.chain.angle)) !== side) return false;
      const width = Math.max(48, actor.label.length * 8.4 + 24);
      const pillX = side * (actor.radius + 22); const pillY = -actor.radius - 62;
      const pill = [side === 1 ? pillX : pillX - width, pillY - 14, side === 1 ? pillX + width : pillX, pillY + 14];
      const reach = (chainBase(actor) + chainReach(actor.chain.length)) * .72;
      const tip = { x: Math.cos(actor.chain.angle) * reach, y: Math.sin(actor.chain.angle) * reach };
      const text = [tip.x - 64, tip.y - 40, tip.x - 64 + (actor.chain.label.length + 6) * 6.8, tip.y - 22];
      return pill[0]! < text[2]! && pill[2]! > text[0]! && pill[1]! < text[3]! && pill[3]! > text[1]!;
    };
    const score = (side: -1 | 1) => (fits(side) ? 0 : 2) + (collides(side) ? 1 : 0) + (chained(side) ? 1 : 0);
    const other = -actor.labelSide as -1 | 1;
    if (score(other) < score(actor.labelSide)) actor.labelSide = other;
  }

  const actors = snapshot.definition.actors.flatMap(definition => placed.get(definition.id) ?? []);
  const actorIndex = new Map(actors.map(actor => [actor.id, actor]));
  const connections = actors.filter(actor => !actor.ghost && actor.boundTo).flatMap((actor): SceneConnection[] => {
    const reference = actor.boundTo!;
    const contact = contacts.get(actor.id);
    if (contact) return [{ source: actor.id, target: reference, from: contact, to: contact, kind: 'contact' }];
    const acid = acidIndex.get(reference);
    const to = siteIndex.get(reference) ?? actorIndex.get(reference.split('.')[0]!) ?? (acid && { x: actor.x, y: acid.y - HELIX.amplitude });
    return to ? [{ source: actor.id, target: reference, from: { x: actor.x, y: actor.y }, to: { x: to.x, y: to.y }, kind: 'relation' }] : [];
  });
  const lesions = nucleicAcids.flatMap(acid => acid.sites.flatMap(site => site.lesion ? [{ target: site.reference, type: site.lesion, x: site.x, y: site.y }] : []));

  return {
    width, height,
    title: snapshot.step.title,
    description: snapshot.step.description ?? '',
    nucleicAcids, actors, connections, lesions,
  };
}

function siteX(position: 'start' | 'center' | 'end' | Point | undefined, width: number): number {
  if (typeof position === 'object') return position.x;
  return position === 'start' ? width * .28 : position === 'end' ? width * .72 : width * .5;
}
