import {
  lesionStrands, nucleicLength, siteInterval, type Activity, type ActorDefinition, type ActorSite, type ActorType, type LesionType, type MechanismSnapshot,
  type Modification, type Point, type SiteStrand, type StrandId,
} from '@molecular-motion/core';
import { contactOutline, firstContact, proteinGeometry, proteinOutlineWidth, smallMoleculeAtoms, type ContactShape, type FirstContact, type ProteinSphere, type SmallMoleculeTopology } from './primitives';
import { SMALL_MOLECULE_TOPOLOGIES } from './vocabulary';

export interface SceneSite extends Point {
  reference: string;
  lesion?: LesionType;
  /** Strands the lesion affects (top is drawn as strand 0); present with a lesion. */
  lesionStrands?: StrandId[];
  /** Strand declared on the site, if any. */
  strand?: SiteStrand;
}

/** Interbase range of a nucleic acid with its drawn extent (`x0` < `x1`). */
export interface SceneRange { from: number; to: number; x0: number; x1: number }
export interface SceneStrandRange extends SceneRange { strand: StrandId }

export interface SceneNucleicAcid {
  id: string;
  type: 'dna' | 'rna';
  label: string;
  color?: string;
  y: number;
  sites: SceneSite[];
  /** Coordinate length; x = width · coordinate / length. */
  length?: number;
  /** Draw 5′/3′ labels: the actor declares its nucleic geometry. */
  polarity?: boolean;
  /** Strand state (RFC 0004 §4), present only when the molecule is not intact. */
  missing?: SceneStrandRange[];
  nascent?: SceneStrandRange[];
  open?: SceneRange[];
}

export interface SceneActor extends Point {
  id: string;
  type: ActorType;
  label: string;
  description?: string;
  color: string;
  radius: number;
  compartment?: string;
  /** Declared small-molecule vocabulary key (molecule actors only); unknown keys fall back to the generic glyph. */
  molecule?: string;
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
export interface SceneLesion extends Point { target: string; type: LesionType; strand: SiteStrand }

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

/** Strand 0 is `top`, strand 1 is `bottom`. */
export const strandIndex = (strand: StrandId): 0 | 1 => strand === 'top' ? 0 : 1;

/** How far inside a range's edge a relaxed strand reaches its relaxed shape, in px. */
const RELAX = 16;
/**
 * 0 outside `[x0, x1]`, easing to 1 within `RELAX` of the edges. A stretch shorter than four
 * `RELAX` relaxes proportionally less, so a few-nucleotide gap does not kink the strand.
 */
function relaxation(x: number, ranges: readonly { x0: number; x1: number }[]): number {
  let weight = 0;
  for (const range of ranges) {
    const depth = Math.min(x - range.x0, range.x1 - x);
    if (depth <= 0) continue;
    const t = Math.min(1, depth / RELAX);
    weight = Math.max(weight, t * t * (3 - 2 * t) * Math.min(1, (range.x1 - range.x0) / (4 * RELAX)));
  }
  return weight;
}

/** True where `strand` has no nucleotides at `x`. */
export const strandMissingAt = (acid: Pick<SceneNucleicAcid, 'missing'>, strand: 0 | 1, x: number) =>
  (acid.missing ?? []).some(range => strandIndex(range.strand) === strand && x > range.x0 && x < range.x1);

/** Ranges where `strand` is single-stranded: its partner is missing there. */
export const singleStranded = (acid: Pick<SceneNucleicAcid, 'missing'>, strand: 0 | 1) =>
  (acid.missing ?? []).filter(range => strandIndex(range.strand) !== strand);

/**
 * Centre line of one strand at `x` (strand 0 crests at the first site). Renderer convention
 * (RFC 0004 §7): a single-stranded stretch relaxes into a shallow wave on its own side of the axis,
 * and in an unwound bubble both strands bow apart; an intact molecule is the plain double helix.
 */
export function helixY(acid: Pick<SceneNucleicAcid, 'y' | 'sites' | 'missing' | 'open'>, strand: 0 | 1, x: number, width: number): number {
  const phaseX = acid.sites[0]?.x ?? width / 2;
  const side = strand === 0 ? -1 : 1;
  const helical = acid.y + side * HELIX.amplitude * Math.cos(2 * Math.PI / HELIX.wavelength * (x - phaseX));
  if (!acid.missing && !acid.open) return helical;
  const single = relaxation(x, singleStranded(acid, strand));
  const open = relaxation(x, acid.open ?? []);
  if (!single && !open) return helical;
  const relaxed = open >= single
    ? acid.y + side * (HELIX.amplitude + 10)
    : acid.y + side * (HELIX.amplitude * .55 + 5 * Math.sin(2 * Math.PI * (x - phaseX) / 64));
  const weight = Math.max(single, open);
  return helical + (relaxed - helical) * weight;
}

/** True where a strand is drawn in front regardless of the helix phase: relaxed stretches lie flat. */
export const relaxedAt = (acid: Pick<SceneNucleicAcid, 'missing' | 'open'>, strand: 0 | 1, x: number) =>
  relaxation(x, [...singleStranded(acid, strand), ...acid.open ?? []]) > 0;

/** Upper visible surface of the helix at `x`: the top edge of whichever present backbone tube is higher. */
const helixTop = (acid: SceneNucleicAcid, x: number, width: number) => Math.min(
  ...([0, 1] as const).filter(strand => !strandMissingAt(acid, strand, x)).map(strand => helixY(acid, strand, x, width) - (strand === 0 ? HELIX.tube : HELIX.backTube) / 2),
  Infinity,
);

const RADIUS: Record<ActorType, number> = { dna: 0, rna: 0, protein: 62, complex: 70, molecule: 24 };
const PALETTE = ['#8b78d0', '#5aa9a0', '#d5839a', '#dca064', '#7c9cc4', '#8fae86', '#c58fc9', '#6fa3c9'];
const CHAIN_ANGLE = -0.45;
/** Docking directions for actors bound to another actor, in radians (SVG y grows downwards). */
const SLOTS = [-0.08, -2.2, -0.95, -3.05, 0.75];
const MOLECULE_SLOTS = [2.95, -2.6, 0.35];
/** Gap between neighbours resting on the same site: they share the site but do not touch. */
const SIDE_GAP = 8;

const isNucleic = (type: ActorType) => type === 'dna' || type === 'rna';

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

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

/** One scale for every declared molecule in the viewer, so atoms and bonds read alike across molecules. */
export const MOLECULE_ACTOR_SCALE = .6;

/** Topology of a declared molecule key, or undefined (unknown key or none): the renderer then uses the generic glyph. */
export function moleculeTopology(key: string | undefined): SmallMoleculeTopology | undefined {
  return key && Object.prototype.hasOwnProperty.call(SMALL_MOLECULE_TOPOLOGIES, key) ? SMALL_MOLECULE_TOPOLOGIES[key as keyof typeof SMALL_MOLECULE_TOPOLOGIES] : undefined;
}

/** Particles of an actor's body in local coordinates; the renderer draws exactly these. */
export function actorParticles(id: string, type: ActorType, radius: number, molecule?: string): ProteinSphere[] {
  if (type !== 'molecule') return proteinGeometry(id, radius, type === 'complex' ? 32 : 28);
  const topology = moleculeTopology(molecule);
  const atoms = topology ? smallMoleculeAtoms(topology, MOLECULE_ACTOR_SCALE) : moleculeAtoms(hashString(id), radius);
  return atoms.map(atom => ({ ...atom, rx: atom.r, ry: atom.r, rotation: 0, depth: 0 }));
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
type Shaped = Pick<SceneActor, 'id' | 'type' | 'radius' | 'chain' | 'molecule'>;
const shapeKey = (actor: Shaped) => `${actor.id}|${actor.type}|${actor.radius}|${actor.molecule ?? ''}|${actor.chain ? `${actor.chain.length}@${actor.chain.angle}` : ''}`;

/** Everything visible of an actor that a partner can touch: its body plus its chain, outlines included. */
export function actorContactShape(actor: Shaped): ContactShape {
  const key = shapeKey(actor);
  let shape = SHAPES.get(key);
  if (!shape) {
    const margin = actorOutline(actor.type, actor.radius);
    const body = actorParticles(actor.id, actor.type, actor.radius, actor.molecule).map(particle => ({ ...particle, rx: particle.rx + margin, ry: particle.ry + margin }));
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
    const body = actorContactShape({ id: actor.id, type: actor.type, radius: actor.radius, molecule: actor.molecule });
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
    const length = nucleicLength(definition);
    const x = (coordinate: number) => width * coordinate / length;
    const range = ({ from, to }: { from: number; to: number }): SceneRange => ({ from, to, x0: x(from), x1: x(to) });
    const strandState = snapshot.actors[definition.id]!.nucleic;
    return {
      id: definition.id,
      type: definition.type as 'dna' | 'rna',
      label: definition.label ?? definition.id,
      ...(definition.color && { color: definition.color }),
      y,
      sites: (definition.sites ?? []).map(site => {
        const reference = `${definition.id}.${site.id}`;
        const lesion = snapshot.sites[reference]?.lesion;
        return {
          reference, x: siteX(definition, site, width), y: y - HELIX.amplitude,
          ...(lesion && { lesion, lesionStrands: lesionStrands(definition, site, lesion) }),
          ...(site.strand && { strand: site.strand }),
        };
      }),
      length,
      ...(definition.nucleic && { polarity: true }),
      ...(strandState?.missing.length && { missing: strandState.missing.map(item => ({ strand: item.strand, ...range(item) })) }),
      ...(strandState?.nascent.length && { nascent: strandState.nascent.map(item => ({ strand: item.strand, ...range(item) })) }),
      ...(strandState?.open.length && { open: strandState.open.map(range) }),
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
      ...(definition.type === 'molecule' && definition.molecule && { molecule: definition.molecule }),
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
      const body = { id: definition.id, type: definition.type, radius: RADIUS[definition.type], molecule: definition.molecule };
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

  // A chain on an actor bound to a site next to single-stranded DNA (a filament on an overhang) runs
  // towards the middle of that stretch instead of leaving towards the free side. The nearest stretch wins; right on ties.
  for (const actor of placed.values()) {
    const reference = snapshot.actors[actor.id]!.boundTo;
    const acid = reference ? acidIndex.get(reference.split('.')[0]!) : undefined;
    const site = reference ? siteIndex.get(reference) : undefined;
    if (!actor.chain || !acid?.missing || !site) continue;
    const distance = (range: SceneRange) => Math.max(0, range.x0 - site.x, site.x - range.x1);
    const stretch = [...acid.missing].sort((a, b) => distance(a) - distance(b) || b.x1 - a.x1)[0]!;
    const strand = strandIndex(stretch.strand) === 0 ? 1 : 0;
    const x = (stretch.x0 + stretch.x1) / 2;
    const target = { x, y: helixY(acid, strand, x, width) };
    actor.chain.angle = Math.atan2(target.y - actor.y, target.x - actor.x);
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
  const lesions = nucleicAcids.flatMap(acid => acid.sites.flatMap((site): SceneLesion[] => site.lesion
    ? [{ target: site.reference, type: site.lesion, strand: site.lesionStrands!.length > 1 ? 'both' : site.lesionStrands![0]!, x: site.x, y: site.y }]
    : []));

  return {
    width, height,
    title: snapshot.step.title,
    description: snapshot.step.description ?? '',
    nucleicAcids, actors, connections, lesions,
  };
}

/**
 * Renderer convention (RFC 0004 §7): the molecule spans the canvas and coordinates grow left to right,
 * so `top` reads 5′→3′. A span anchors at its midpoint; a `Point` position is drawn where it says.
 */
function siteX(acid: ActorDefinition, site: ActorSite, width: number): number {
  if (site.position) return site.position.x;
  const interval = siteInterval(site);
  return interval ? width * ((interval.from + interval.to) / 2) / nucleicLength(acid) : width * .5;
}
