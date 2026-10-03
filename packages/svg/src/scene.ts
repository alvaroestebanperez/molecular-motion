import { hashString } from './primitives/shared';
import {
  actorInstances, anonymousAttachment, lesionStrands, partnerOf, partnersOf, primaryPartner, nucleicLength, siteInterval, type Activity, type ActorDefinition, type ActorSite, type ActorType, type LesionType, type MechanismSnapshot,
  type Modification, type Point, type SiteStrand, type StrandId,
} from '@molecular-motion/core';
import { contactOutline, firstContact, proteinGeometry, proteinOutlineWidth, smallMoleculeAtoms, type ContactShape, type FirstContact, type ProteinSphere, type SmallMoleculeTopology } from './primitives';
import { SMALL_MOLECULE_TOPOLOGIES } from './vocabulary';

/** An actor definition seen as one instance: `id` is the instance id, `visual` the definition id. */
type InstanceView = ActorDefinition & { visual: string };

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
  /**
   * Stretches of this molecule's strands drawn beside another molecule's strand instead (RFC 0006 §10).
   * `continues` says, for the lower and the higher end, whether the strand goes on along this molecule.
   */
  away?: Array<SceneStrandRange & { continues: [boolean, boolean] }>;
}

export interface SceneStrandSpan { acid: string; strand: StrandId; from: number; to: number }

/**
 * One stretch of base pairing between two molecules. The `traveller` strand leaves its own molecule's
 * axis and runs beside the `host` strand, which stays where it is. Which is which is a drawing choice
 * derived from strand state; the pairing itself has no direction.
 */
export interface ScenePairingSegment {
  traveller: SceneStrandSpan;
  host: SceneStrandSpan;
  /** Stretches of the host molecule's other strand left without a partner opposite the pairing. */
  unpaired: SceneStrandSpan[];
}

/** Every stretch between one pair of strands; `key` is the state's key, stable while the pairing grows. */
export interface ScenePairing { key: string; segments: ScenePairingSegment[] }

export interface SceneActor extends Point {
  /** Instance id (`rad51#3`); the actor id for single-copy actors. Keys the DOM. */
  id: string;
  /** Definition id: the visual identity every copy shares (silhouette seed, default colour). */
  actor: string;
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
  /** Extra height of the callout above its usual place, when both sides were taken. */
  labelLift?: number;
  /** Modification with a length (PAR chain, filament), drawn as beads along `angle` (radians). */
  chain?: { label: string; length: number; angle: number };
  /** Modifications without a length, drawn as small badges. */
  badges: Modification[];
  /** Occupies its span in reverse orientation (relative to top 5′→3′): the shape is drawn mirrored. */
  mirrored?: true;
  /** Visible copies of one definition share a callout: `lead` carries "label ×size", the others none. */
  group?: { size: number; lead: boolean };
  /**
   * Copies of one definition that are equivalent in this snapshot: same state, same occupancy and the
   * same interactions. `first` is true on the one that stands for them, and `size` is how many there
   * are. Absent when a copy differs from every other in any of those.
   */
  identical?: { size: number; first: boolean };
}

/**
 * A `boundTo` relation. `contact` (the default layout): the actor touches its partner, or the
 * backbone at the bound site, and `from`/`to` are the point where the outlines meet; the renderer
 * draws no line, only a soft contact shadow. `relation`: the layout could not honour contact
 * (an author-fixed `position`), so `from`/`to` run centre to target and a dotted link is drawn.
 */
export interface SceneConnection { source: string; target: string; from: Point; to: Point; kind?: 'contact' | 'relation' }
export interface SceneLesion extends Point { target: string; type: LesionType; strand: SiteStrand }

/**
 * Nucleotides an instance covers on a molecule other than the one it is drawn on (RFC 0005 §5: one
 * instance may occupy several nucleic acids). The body is drawn once; this marks the other place it
 * holds, so the occupancy is visible there too.
 */
export interface SceneFootprint {
  /** Occupancy id, `<instance>@<acid>`. Keys the DOM. */
  id: string;
  instance: string;
  /** Definition id, for the label of the description. */
  actor: string;
  label: string;
  color: string;
  acid: string;
  from: number; to: number;
  /** Box around the covered strand(s). */
  x: number; y: number; width: number; height: number;
}

export interface SvgScene {
  width: number;
  height: number;
  title: string;
  description: string;
  nucleicAcids: SceneNucleicAcid[];
  actors: SceneActor[];
  connections: SceneConnection[];
  lesions: SceneLesion[];
  /** Base pairing between molecules; empty for a document without pairings. */
  pairings: ScenePairing[];
  /** Occupancies held away from where their instance is drawn; empty for most documents. */
  footprints: SceneFootprint[];
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
function relaxation(x: number, ranges: readonly { x0: number; x1: number; abrupt?: readonly [boolean, boolean] }[]): number {
  let weight = 0;
  for (const range of ranges) {
    if (x <= range.x0 || x >= range.x1) continue;
    // An abrupt edge does not ease back: the strand ends there, at its relaxed level.
    const depth = Math.min(range.abrupt?.[0] ? Infinity : x - range.x0, range.abrupt?.[1] ? Infinity : range.x1 - x);
    if (depth <= 0) continue;
    const t = Math.min(1, depth / RELAX);
    weight = Math.max(weight, t * t * (3 - 2 * t) * Math.min(1, (range.x1 - range.x0) / (4 * RELAX)));
  }
  return weight;
}

/**
 * Free 3′ ends of newly synthesised stretches inside an unwound region, as `[strand, x]`. The new strand
 * is paired with nothing there, so it is not joined to what lies past its end: it is drawn as an end
 * until the region is annealed (RFC 0006 §10). Past the end the strand must be there, on this molecule.
 */
export function freeStrandEnds(acid: Pick<SceneNucleicAcid, 'missing' | 'nascent' | 'open' | 'away'>, width: number): [0 | 1, number][] {
  if (!acid.nascent || !acid.open) return [];
  const within = (list: readonly SceneStrandRange[] | undefined, strand: 0 | 1, x: number) => (list ?? []).some(range => strandIndex(range.strand) === strand && x > range.x0 && x < range.x1);
  return acid.nascent.flatMap((range): [0 | 1, number][] => {
    const strand = strandIndex(range.strand);
    const x = strand === 0 ? range.x1 : range.x0;
    const [inside, beyond] = strand === 0 ? [x - 1, x + 1] : [x + 1, x - 1];
    const unwound = acid.open!.some(region => x >= region.x0 && x <= region.x1);
    return unwound && beyond > 0 && beyond < width && !within(acid.missing, strand, beyond) && !within(acid.away, strand, beyond) && !within(acid.away, strand, inside) ? [[strand, x]] : [];
  });
}

/** True where `strand` is not drawn on this molecule at `x`: no nucleotides, or drawn beside another molecule. */
export const strandMissingAt = (acid: Pick<SceneNucleicAcid, 'missing' | 'away'>, strand: 0 | 1, x: number) =>
  [...acid.missing ?? [], ...acid.away ?? []].some(range => strandIndex(range.strand) === strand && x > range.x0 && x < range.x1);

/** Ranges where `strand` is single-stranded: its partner is missing there. */
export const singleStranded = (acid: Pick<SceneNucleicAcid, 'missing'>, strand: 0 | 1) =>
  (acid.missing ?? []).filter(range => strandIndex(range.strand) !== strand);

/**
 * Centre line of one strand at `x` (strand 0 crests at the first site). Renderer convention
 * (RFC 0004 §7): a single-stranded stretch relaxes into a shallow wave on its own side of the axis,
 * and in an unwound bubble both strands bow apart; an intact molecule is the plain double helix.
 */
export function helixY(acid: Pick<SceneNucleicAcid, 'y' | 'sites' | 'missing' | 'open' | 'nascent' | 'away'>, strand: 0 | 1, x: number, width: number): number {
  const phaseX = acid.sites[0]?.x ?? width / 2;
  const side = strand === 0 ? -1 : 1;
  const helical = acid.y + side * HELIX.amplitude * Math.cos(2 * Math.PI / HELIX.wavelength * (x - phaseX));
  if (!acid.missing && !acid.open) return helical;
  const single = relaxation(x, singleStranded(acid, strand));
  // Where this strand has a free end at the edge of an unwound region it keeps its unwound level up to
  // the end, so it is seen apart from the strand that lies past it instead of running into it.
  const ends = freeStrandEnds(acid, width).filter(([index]) => index === strand).map(([, at]) => at);
  const abrupt = (edge: number) => ends.some(at => Math.abs(at - edge) < .5);
  const open = relaxation(x, ends.length ? (acid.open ?? []).map(range => ({ ...range, abrupt: [abrupt(range.x0), abrupt(range.x1)] as const })) : acid.open ?? []);
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

/** Pairing between molecules: how far inside its partner the travelling strand runs, and how it gets there. */
export const PAIRING = { inset: 26, ramp: 72, rung: 18 } as const;

const smooth = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

export interface PairingGeometry {
  /** Centre line of the travelling strand, from its lower coordinate to its higher one. */
  points: Point[];
  /** Base pairs: from the travelling strand to its partner. */
  rungs: [Point, Point][];
  /** Newly synthesised stretches of the travelling strand. */
  nascent: Point[][];
  /** Free ends of the travelling strand, to be labelled with their polarity. */
  ends: Array<Point & { label: '5′' | '3′' }>;
}

/**
 * Geometry of one stretch of pairing (RFC 0006 §10), from strand state and coordinates alone. The
 * travelling strand runs beside its partner, on the partner's inner side. Where it continues on its
 * own molecule it eases back onto that molecule's axis, so entry and exit are one smooth curve; a free
 * end simply ends beside the partner.
 */
export function pairingGeometry(scene: Pick<SvgScene, 'width' | 'nucleicAcids'>, { traveller, host }: Pick<ScenePairingSegment, 'traveller' | 'host'>, travel = 1): PairingGeometry | undefined {
  const own = scene.nucleicAcids.find(acid => acid.id === traveller.acid);
  const other = scene.nucleicAcids.find(acid => acid.id === host.acid);
  if (!own || !other) return undefined;
  const { width } = scene;
  const [ownScale, otherScale] = [width / (own.length ?? 100), width / (other.length ?? 100)];
  const [strand, partner] = [strandIndex(traveller.strand), strandIndex(host.strand)];
  const mirrored = traveller.strand === host.strand;
  const side = partner === 0 ? -1 : 1;
  const reach = (traveller.to - traveller.from) * ownScale;
  const ramp = Math.min(PAIRING.ramp, reach * .4);
  const stretch = own.away?.find(range => range.strand === traveller.strand && range.from === traveller.from && range.to === traveller.to);
  const continues = { from: stretch?.continues[0] ?? false, to: stretch?.continues[1] ?? false };
  // Beside the partner the strand keeps one level: it does not follow the partner's own easing at the
  // edges of its bubble, so a free end stays straight and clearly inside.
  const [hostFrom, hostTo] = [host.from * otherScale, host.to * otherScale];
  const settle = Math.min(RELAX, (hostTo - hostFrom) / 2);
  const level = (x: number) => helixY(other, partner, Math.max(hostFrom + settle, Math.min(hostTo - settle, x)), width);
  // `travel` is how far the stretch has come from its own molecule's line (0) to its place here (1).
  // A settled step is always 1; frames of a transition pass through the values in between (ADR 0001 §4.3).
  const weight = (p: number) => travel * Math.min(
    continues.from ? smooth((p - traveller.from) * ownScale / ramp) : 1,
    continues.to ? smooth((traveller.to - p) * ownScale / ramp) : 1,
  );
  const partnerAt = (p: number): Point => {
    const q = mirrored ? host.to - (p - traveller.from) : host.from + (p - traveller.from);
    return { x: q * otherScale, y: helixY(other, partner, q * otherScale, width) };
  };
  const at = (p: number): Point => {
    const w = weight(p);
    const beside = partnerAt(p);
    const home = { x: p * ownScale, y: helixY(own, strand, p * ownScale, width) };
    return { x: home.x + (beside.x - home.x) * w, y: home.y + (level(beside.x) - side * PAIRING.inset - home.y) * w };
  };
  const trace = (from: number, to: number): Point[] => {
    const steps = Math.max(2, Math.ceil((to - from) * ownScale / 3));
    return Array.from({ length: steps + 1 }, (_, index) => at(from + (to - from) * index / steps));
  };
  const rungs: [Point, Point][] = [];
  for (let offset = PAIRING.rung / 2; offset < reach; offset += PAIRING.rung) {
    const p = traveller.from + offset / ownScale;
    // A base pair is drawn only where both strands have settled side by side.
    if (weight(p) >= .999 && Math.abs(partnerAt(p).y - level(partnerAt(p).x)) < 1) rungs.push([at(p), partnerAt(p)]);
  }
  const nascent = (own.nascent ?? []).filter(range => range.strand === traveller.strand && range.from < traveller.to && range.to > traveller.from)
    .map(range => trace(Math.max(range.from, traveller.from), Math.min(range.to, traveller.to)));
  // top runs 5′→3′ with the coordinate, bottom against it.
  const labels = traveller.strand === 'top' ? { from: '5′', to: '3′' } as const : { from: '3′', to: '5′' } as const;
  const points = trace(traveller.from, traveller.to);
  // A free end is labelled just inside it, on the side away from the partner, where nothing else is drawn.
  const end = (tip: Point, inner: Point, label: '5′' | '3′') => {
    const length = Math.hypot(tip.x - inner.x, tip.y - inner.y) || 1;
    return { x: tip.x - (tip.x - inner.x) / length * 26, y: tip.y - side * 18, label };
  };
  const ends = own.polarity ? [
    ...(continues.from ? [] : [end(points[0]!, points[1]!, labels.from)]),
    ...(continues.to ? [] : [end(points.at(-1)!, points.at(-2)!, labels.to)]),
  ] : [];
  return { points, rungs, nascent, ends };
}

/**
 * Record on each molecule the stretches of its strands that are drawn beside another molecule, and
 * whether the strand goes on along its own molecule past each end of them. Past an end it goes on when
 * the next nucleotide is there, on this molecule's line, and is not where synthesis stopped: the 3′ end
 * of a new stretch is a free end. Read from strand ranges only, so it serves frames as well as steps.
 */
export function markAway(acids: SceneNucleicAcid[], travellers: readonly SceneStrandSpan[], width: number): void {
  const NEAR = 1e-3;
  for (const acid of acids) delete acid.away;
  for (const traveller of travellers) {
    const acid = acids.find(item => item.id === traveller.acid);
    if (!acid) continue;
    const length = acid.length ?? 100;
    const scale = width / length;
    const on = (list: readonly { strand: StrandId; from: number; to: number }[] | undefined, at: number) =>
      (list ?? []).some(range => range.strand === traveller.strand && range.from <= at && at < range.to);
    const others = travellers.filter(other => other.acid === traveller.acid);
    const top = traveller.strand === 'top';
    const goesOn = (inside: number, outside: number, threePrime: boolean) => outside >= 0 && outside < length
      && !on(acid.missing, outside) && !on(others, outside)
      && !(threePrime && on(acid.nascent, inside) && !on(acid.nascent, outside));
    acid.away = [...acid.away ?? [], {
      strand: traveller.strand, from: traveller.from, to: traveller.to, x0: traveller.from * scale, x1: traveller.to * scale,
      continues: [goesOn(traveller.from + NEAR, traveller.from - NEAR, !top), goesOn(traveller.to - NEAR, traveller.to + NEAR, top)],
    }];
  }
}

/** Callout text: the label, with the number of visible copies when it speaks for a group. */
export const calloutText = (actor: Pick<SceneActor, 'label' | 'group'>) => actor.group && actor.group.size > 1 ? `${actor.label} ×${actor.group.size}` : actor.label;

/** Where an actor's callout pill is drawn, as `[x0, y0, x1, y1]`, for a side and lift (its own by default). */
export function labelBox(actor: SceneActor, side: -1 | 1 = actor.labelSide, lift = actor.labelLift ?? 0): [number, number, number, number] {
  const small = actor.type === 'molecule';
  const width = Math.max(48, calloutText(actor).length * 8.4 + 24);
  const anchor = actor.x + side * (actor.radius + (small ? 14 : 22));
  // The callout is already lifted clear of a chain leaving on the same side.
  const chainLift = actor.chain && Math.sign(Math.cos(actor.chain.angle)) === side ? 44 : 0;
  const y = actor.y + (small ? -actor.radius - 20 : -actor.radius - 18) - chainLift - lift;
  const left = side === 1 ? anchor : anchor - width;
  return [left, y - 14, left + width, y + 14];
}

const RADIUS: Record<ActorType, number> = { dna: 0, rna: 0, protein: 62, complex: 70, molecule: 24 };
const PALETTE = ['#8b78d0', '#5aa9a0', '#d5839a', '#dca064', '#7c9cc4', '#8fae86', '#c58fc9', '#6fa3c9'];
const CHAIN_ANGLE = -0.45;
/** Docking directions for actors bound to another actor, in radians (SVG y grows downwards). */
const SLOTS = [-0.08, -2.2, -0.95, -3.05, 0.75];
const MOLECULE_SLOTS = [2.95, -2.6, 0.35];
/** Gap between neighbours resting on the same site: they share the site but do not touch. */
const SIDE_GAP = 8;
/** Clear space kept between an actor's body and the side edges of the canvas, in px. */
const CANVAS_MARGIN = 6;

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
/** Geometry depends on the definition, never on which copy it is (RFC 0005 §3.3). */
type Shaped = Pick<SceneActor, 'actor' | 'type' | 'radius' | 'chain' | 'molecule'>;
const shapeKey = (actor: Shaped) => `${actor.actor}|${actor.type}|${actor.radius}|${actor.molecule ?? ''}|${actor.chain ? `${actor.chain.length}@${actor.chain.angle}` : ''}`;

/** Everything visible of an actor that a partner can touch: its body plus its chain, outlines included. */
export function actorContactShape(actor: Shaped): ContactShape {
  const key = shapeKey(actor);
  let shape = SHAPES.get(key);
  if (!shape) {
    const margin = actorOutline(actor.type, actor.radius);
    const body = actorParticles(actor.actor, actor.type, actor.radius, actor.molecule).map(particle => ({ ...particle, rx: particle.rx + margin, ry: particle.ry + margin }));
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
    const body = actorContactShape({ actor: actor.actor, type: actor.type, radius: actor.radius, molecule: actor.molecule });
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

/** True when two actors' bodies would interpenetrate (particles closer than 90% of their radii). */
function bodiesOverlap(actor: SceneActor, x: number, y: number, other: SceneActor): boolean {
  const own = actorContactShape(actor).particles; const theirs = actorContactShape(other).particles;
  return own.some(a => theirs.some(b => Math.hypot(x + a.x - other.x - b.x, y + a.y - other.y - b.y) < (Math.max(a.rx, a.ry) + Math.max(b.rx, b.ry)) * .9));
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
  // One view per instance: the definition, with the instance id as `id` and the definition id kept as
  // `visual`, so copies are laid out and keyed separately but share one silhouette and colour.
  const views: InstanceView[] = actorInstances(snapshot.definition).map(({ id, actor }) => ({ ...actor, id, visual: actor.id }));
  // Layout docks each instance against one parent, derived from the interaction graph and occupancy
  // (RFC 0005 D5): its legacy attachment, else the nucleic acid it occupies, else the first instance it
  // binds. A symmetric edge only docks the higher id onto the lower, so a dimer has one anchor, not a cycle.
  const attachedTo = (instance: string): string | undefined => {
    if (anonymousAttachment(snapshot, instance)) return primaryPartner(snapshot, instance);
    const resting = Object.values(snapshot.occupancy).find(item => item.instance === instance);
    if (resting) return resting.site ? `${resting.acid}.${resting.site}` : resting.acid;
    const edges = Object.values(snapshot.interactions).sort((a, b) => a.id < b.id ? -1 : 1);
    const outgoing = edges.find(edge => !edge.symmetric && edge.ends[0].instance === instance);
    if (outgoing) return outgoing.ends[1].site ? `${outgoing.ends[1].instance}.${outgoing.ends[1].site}` : outgoing.ends[1].instance;
    const pair = edges.find(edge => edge.symmetric && edge.ends.some(end => end.instance === instance) && edge.ends.some(end => end.instance < instance));
    return pair?.ends.find(end => end.instance !== instance)!.instance;
  };
  /** The span an instance covers on a nucleic acid, if it occupies one by span (RFC 0005 §5). */
  const spanOf = (instance: string) => Object.values(snapshot.occupancy).find(item => item.instance === instance && item.span);
  const shown = views.filter(definition => {
    const state = snapshot.actors[definition.id]!;
    return state.present && state.visible;
  });

  const acidViews = shown.filter(definition => isNucleic(definition.type));
  // One molecule keeps its place near the bottom. Several are stacked in declaration order, with room
  // between them for strands that pair across (RFC 0006 §10); the renderer gives them no roles.
  const stack = acidViews.length > 1 ? { top: height * .56, gap: Math.min(150, height * .34 / (acidViews.length - 1)) } : { top: height * .74, gap: 120 };
  const nucleicAcids = acidViews.map((definition, index): SceneNucleicAcid => {
    const y = definition.position?.y ?? stack.top + index * stack.gap;
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

  // Pairing between molecules, from `state.pairings` and strand state only. Of the two paired strands,
  // the one whose molecule is less unwound there travels to the other; on a tie the molecule declared
  // first travels. A strand paired within its own molecule is not drawn (RFC 0004 keeps RNA and DNA linear).
  const order = new Map(nucleicAcids.map((acid, index) => [acid.id, index]));
  const openShare = (span: SceneStrandSpan) => (snapshot.actors[span.acid]?.nucleic?.open ?? [])
    .reduce((sum, region) => sum + Math.max(0, Math.min(region.to, span.to) - Math.max(region.from, span.from)), 0) / (span.to - span.from);
  const pairings: ScenePairing[] = Object.entries(snapshot.pairings).flatMap(([key, list]) => {
    const segments = list.flatMap(({ ends: [a, b] }): ScenePairingSegment[] => {
      if (a.acid === b.acid || !order.has(a.acid) || !order.has(b.acid)) return [];
      const [shareA, shareB] = [openShare(a), openShare(b)];
      const aTravels = shareA === shareB ? order.get(a.acid)! < order.get(b.acid)! : shareA < shareB;
      const [traveller, host] = aTravels ? [a, b] : [b, a];
      const facing: SceneStrandSpan = { ...host, strand: host.strand === 'top' ? 'bottom' : 'top' };
      const unpaired = partnerOf(snapshot, snapshot.definition, facing).filter(item => item.partner === 'unpaired')
        .map(item => ({ acid: facing.acid, strand: facing.strand, from: item.from, to: item.to }));
      return [{ traveller: { ...traveller }, host: { ...host }, unpaired }];
    });
    return segments.length ? [{ key, segments }] : [];
  });
  markAway(nucleicAcids, pairings.flatMap(pairing => pairing.segments.map(segment => segment.traveller)), width);
  /** Where a strand stretch is drawn when it travels to another molecule: the point at coordinate `p`. */
  const travelling = (acid: string, strand: SiteStrand | undefined, p: number): Point | undefined => {
    for (const segment of pairings.flatMap(pairing => pairing.segments)) {
      const { traveller } = segment;
      if (traveller.acid !== acid || (strand && strand !== 'both' && strand !== traveller.strand) || p < traveller.from || p > traveller.to) continue;
      const geometry = pairingGeometry({ width, nucleicAcids }, segment)!;
      return geometry.points[Math.round((p - traveller.from) / (traveller.to - traveller.from) * (geometry.points.length - 1))];
    }
    return undefined;
  };

  // A definition with a footprint is drawn at the size of the nucleotides it covers, on the scale of the
  // first molecule shown, so adjacent copies abut. It is one scale per definition: every copy keeps the
  // same silhouette and size whether it is on the DNA or not (RFC 0005 §3.3).
  const scaleAcid = nucleicAcids[0];
  const radii = new Map<string, number>();
  const radiusOf = (definition: InstanceView): number => {
    const base = RADIUS[definition.type];
    if (!definition.footprint || !scaleAcid) return base;
    let radius = radii.get(definition.visual);
    if (radius === undefined) {
      const [minX, maxX] = extentX({ actor: definition.visual, type: definition.type, radius: base, molecule: definition.molecule });
      const covered = width * definition.footprint.length / (scaleAcid.length ?? 100);
      radius = Math.max(12, Math.min(base, Math.round(base * covered / (maxX - minX) * 10) / 10));
      radii.set(definition.visual, radius);
    }
    return radius;
  };

  const proteins = shown.filter(definition => !isNucleic(definition.type));
  const byId = new Map(proteins.map(definition => [definition.id, definition]));
  const placed = new Map<string, SceneActor>();
  const children = new Map<string, InstanceView[]>();
  for (const definition of proteins) {
    const partner = attachedTo(definition.id)?.split('.')[0];
    if (partner && byId.has(partner)) children.set(partner, [...(children.get(partner) ?? []), definition]);
  }

  const make = (definition: InstanceView, point: Point, labelSide: -1 | 1, ghost = false): SceneActor => {
    const state = snapshot.actors[definition.id]!;
    const chain = state.modifications.find(modification => modification.length);
    return {
      id: definition.id,
      actor: definition.visual,
      type: definition.type,
      label: definition.label ?? definition.visual,
      ...(definition.description && { description: definition.description }),
      color: definition.color ?? defaultColor(definition.visual),
      radius: radiusOf(definition),
      ...(definition.type === 'molecule' && definition.molecule && { molecule: definition.molecule }),
      ...(!ghost && spanOf(definition.id)?.orientation === 'reverse' && { mirrored: true }),
      ...(state.compartment && { compartment: state.compartment }),
      ...(state.activity && { activity: state.activity.state }),
      ...(attachedTo(definition.id) && !ghost && { boundTo: attachedTo(definition.id) }),
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

  // 0. Span occupants sit at the middle of their span, resting on the strand that is present there.
  for (const definition of proteins) {
    const occupancy = spanOf(definition.id);
    const acid = occupancy && acidIndex.get(occupancy.acid);
    if (!occupancy || !acid || definition.position) continue;
    const x = width * ((occupancy.span!.from + occupancy.span!.to) / 2) / (acid.length ?? 100);
    const body = { actor: definition.visual, type: definition.type, radius: radiusOf(definition), molecule: definition.molecule };
    // An occupant follows its strand: on a stretch drawn beside another molecule it rests there.
    const moved = travelling(occupancy.acid, occupancy.strand, (occupancy.span!.from + occupancy.span!.to) / 2);
    if (moved) {
      const bottom = Math.max(...contactOutline(actorContactShape(body)).map(point => point.y));
      const contact = { x: Math.round(moved.x * 10) / 10, y: Math.round((moved.y - HELIX.tube / 2) * 10) / 10 };
      placed.set(definition.id, make(definition, { x: moved.x, y: contact.y - bottom + 1.5 }, -1));
      contacts.set(definition.id, contact);
      continue;
    }
    const rest = restOnHelix(body, x, acid, width);
    placed.set(definition.id, make(definition, { x, y: rest.y }, -1));
    contacts.set(definition.id, rest.contact);
  }

  // 1. Actors bound to a nucleic acid rest on the helix at their site: first centred, then left, right, left…
  const onAcid = new Map<string, InstanceView[]>();
  for (const definition of proteins) {
    const boundTo = attachedTo(definition.id);
    if (boundTo && !placed.has(definition.id) && acidIndex.has(boundTo.split('.')[0]!)) onAcid.set(boundTo, [...(onAcid.get(boundTo) ?? []), definition]);
  }
  for (const [reference, group] of onAcid) {
    const acid = acidIndex.get(reference.split('.')[0]!)!;
    const anchor = siteIndex.get(reference) ?? { x: width / 2, y: acid.y - HELIX.amplitude };
    let left = anchor.x;
    let right = anchor.x;
    group.forEach((definition, index) => {
      // Neighbours on the same site are spaced by their visible outlines, not by bounding circles.
      const body = { actor: definition.visual, type: definition.type, radius: radiusOf(definition), molecule: definition.molecule };
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
  // along that stretch instead of leaving towards the free side: it takes the stretch under or nearest
  // the actor (right on ties) and heads for its distal end, away from the crowded site.
  for (const actor of placed.values()) {
    const reference = attachedTo(actor.id);
    const acid = reference ? acidIndex.get(reference.split('.')[0]!) : undefined;
    const site = reference ? siteIndex.get(reference) : undefined;
    if (!actor.chain || !acid?.missing || !site) continue;
    const distance = (range: SceneRange) => Math.max(0, range.x0 - actor.x, actor.x - range.x1);
    const stretch = [...acid.missing].sort((a, b) => distance(a) - distance(b) || b.x1 - a.x1)[0]!;
    const distal = Math.abs(stretch.x0 - site.x) > Math.abs(stretch.x1 - site.x) ? stretch.x0 : stretch.x1;
    // Aim where the chain's own reach meets the backbone surface on the way to the distal end, so the
    // filament comes to rest on the strand instead of running on through it.
    const reach = chainBase(actor) + chainReach(actor.chain.length);
    const rest = (x: number) => ({ x, y: helixTop(acid, x, width) - 14 });
    const direction = Math.sign(distal - actor.x) || 1;
    let target = rest(distal);
    for (let x = actor.x; direction * (distal - x) >= 0; x += direction * 3) {
      const point = rest(x);
      if (Math.hypot(point.x - actor.x, point.y - actor.y) >= reach) { target = point; break; }
    }
    let angle = Math.atan2(target.y - actor.y, target.x - actor.x);
    // Like docked actors, tilt towards "up" until no bead dips into the backbone.
    const sinks = (candidate: number) => chainGeometry(actor.radius, candidate, actor.chain!.length, chainBase({ ...actor, chain: { ...actor.chain!, angle: candidate } })).beads
      .some(bead => actor.y + bead.y + bead.r + BEAD_OUTLINE > helixTop(acid, actor.x + bead.x, width) + 1);
    for (let step = 0; step < 30 && sinks(angle); step++) {
      angle += Math.sign(Math.atan2(Math.sin(-Math.PI / 2 - angle), Math.cos(-Math.PI / 2 - angle))) * .05;
    }
    actor.chain.angle = angle;
  }

  // 2. Free actors (visible, unbound) line up across the top.
  // Each free definition reserves one slot per declared copy, and a copy keeps its own slot, so a copy
  // does not slide across the row when a sibling docks elsewhere. Single-copy actors take one slot each.
  const free = proteins.filter(definition => !placed.has(definition.id) && !attachedTo(definition.id));
  // Above the DNA when there is one; with no nucleic acid the assemblies get the middle of the canvas,
  // so partners docked above them stay on screen.
  const freeRowY = nucleicAcids.length ? height * .26 : height * .5;
  const freeDefinitions = [...new Set(free.map(definition => definition.visual))];
  const slotsOf = (visual: string) => snapshot.definition.actors.find(actor => actor.id === visual)!.copies ?? 1;
  const slotCount = freeDefinitions.reduce((sum, visual) => sum + slotsOf(visual), 0);
  free.forEach(definition => {
    const block = freeDefinitions.slice(0, freeDefinitions.indexOf(definition.visual)).reduce((sum, visual) => sum + slotsOf(visual), 0);
    const copy = definition.id === definition.visual ? 0 : Number(definition.id.slice(definition.visual.length + 1)) - 1;
    const slot = block + copy;
    const x = slotCount === 1 ? width * .5 : width * (.22 + .56 * slot / (slotCount - 1));
    placed.set(definition.id, make(definition, definition.position ?? { x, y: freeRowY }, -1));
  });

  // 3. Actors bound to other actors dock against their partner (body or chain) by first contact along a
  //    slot direction; the first one docks at the tip of a chain.
  const resolving = new Set<string>();
  const place = (definition: InstanceView): SceneActor => {
    const existing = placed.get(definition.id);
    if (existing) return existing;
    const partnerId = attachedTo(definition.id)?.split('.')[0];
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
    // A span occupant's neighbours lie along the DNA, so whatever docks onto it starts from straight up.
    if (spanOf(partner.id)) angle = -Math.PI / 2;
    const actor = make(definition, { x: partner.x, y: partner.y }, Math.cos(angle) >= 0 ? 1 : -1);
    if (definition.position) Object.assign(actor, { x: definition.position.x, y: definition.position.y });
    else {
      // A docked actor must not sink into a nucleic acid nor into an actor already placed (other than its
      // partner), nor leave the canvas sideways: tilt its slot towards "up" until it clears.
      const [reachLeft, reachRight] = extentX(actor);
      const onCanvas = (fit: FirstContact) => partner.x + fit.offset.x + reachLeft >= CANVAS_MARGIN && partner.x + fit.offset.x + reachRight <= width - CANVAS_MARGIN;
      const clears = (fit: FirstContact) => onCanvas(fit) && nucleicAcids.every(acid => clearance(actor, partner.x + fit.offset.x, partner.y + fit.offset.y, acid, width) >= 0)
        && [...placed.values()].every(other => other === partner || other.ghost || !bodiesOverlap(actor, partner.x + fit.offset.x, partner.y + fit.offset.y, other));
      let fit = contactAlong(partner, actor, angle);
      for (let step = 0; step < 10 && !clears(fit); step++) {
        angle += Math.sign(Math.atan2(Math.sin(-Math.PI / 2 - angle), Math.cos(-Math.PI / 2 - angle))) * .15;
        fit = contactAlong(partner, actor, angle);
      }
      actor.x = Math.round((partner.x + fit.offset.x) * 10) / 10;
      actor.y = Math.round((partner.y + fit.offset.y) * 10) / 10;
      contacts.set(actor.id, { x: Math.round((partner.x + fit.point.x) * 10) / 10, y: Math.round((partner.y + fit.point.y) * 10) / 10 });
      // An instance that binds several placed partners (cGAMP bridging two STING protomers) sits above
      // them, between the positions it would take docking straight up onto each one.
      const bridged = Object.values(snapshot.interactions).filter(edge => !edge.symmetric && edge.ends[0].instance === definition.id)
        .map(edge => placed.get(edge.ends[1].instance)).filter((other): other is SceneActor => Boolean(other) && !other!.ghost);
      if (bridged.length > 1) {
        // Dock exactly onto the first partner, heading for the point above the middle of all of them, and
        // tilt up only if it would clip another: it touches its partners rather than floating over them.
        const [first, ...rest] = bridged as [SceneActor, ...SceneActor[]];
        const middle = bridged.reduce((sum, other) => sum + other.x, 0) / bridged.length;
        let bridgeAngle = Math.atan2(-first.radius, middle - first.x);
        let bridgeFit = contactAlong(first, actor, bridgeAngle);
        for (let step = 0; step < 12 && rest.some(other => bodiesOverlap(actor, first.x + bridgeFit.offset.x, first.y + bridgeFit.offset.y, other)); step++) {
          bridgeAngle += Math.sign(Math.atan2(Math.sin(-Math.PI / 2 - bridgeAngle), Math.cos(-Math.PI / 2 - bridgeAngle))) * .1;
          bridgeFit = contactAlong(first, actor, bridgeAngle);
        }
        actor.x = Math.round((first.x + bridgeFit.offset.x) * 10) / 10;
        actor.y = Math.round((first.y + bridgeFit.offset.y) * 10) / 10;
        contacts.set(actor.id, { x: Math.round((first.x + bridgeFit.point.x) * 10) / 10, y: Math.round((first.y + bridgeFit.point.y) * 10) / 10 });
      }
    }
    placed.set(definition.id, actor);
    resolving.delete(definition.id);
    return actor;
  };
  proteins.forEach(place);

  // An assembly that floats free (nothing in it rests on a nucleic acid) is moved as a whole to keep
  // every member on the canvas. One anchored to a molecule stays where its anchor is.
  for (const root of free) {
    if (root.position) continue;
    const members: SceneActor[] = [];
    const collect = (id: string) => { const actor = placed.get(id); if (!actor || members.includes(actor)) return; members.push(actor); for (const child of children.get(id) ?? []) collect(child.id); };
    collect(root.id);
    const spans = members.map(member => { const [left, right] = extentX(member); return [member.x + left, member.x + right] as const; });
    const [left, right] = [Math.min(...spans.map(span => span[0])), Math.max(...spans.map(span => span[1]))];
    const shift = left < CANVAS_MARGIN ? CANVAS_MARGIN - left : right > width - CANVAS_MARGIN ? width - CANVAS_MARGIN - right : 0;
    if (!shift || right - left > width - 2 * CANVAS_MARGIN) continue;
    const moved = Math.round(shift * 10) / 10;
    for (const member of members) {
      member.x = Math.round((member.x + moved) * 10) / 10;
      const contact = contacts.get(member.id);
      if (contact) contacts.set(member.id, { x: Math.round((contact.x + moved) * 10) / 10, y: contact.y });
    }
  }

  // 4. Upcoming actors wait out of focus in the upper background, away from the action.
  const upcoming = views.filter(definition => ghosts.has(definition.id) && !placed.has(definition.id) && !isNucleic(definition.type));
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

  const actors = views.flatMap(definition => placed.get(definition.id) ?? []);
  // Copies are one molecule species on screen: one callout for all visible copies (renderer decision).
  for (const definition of snapshot.definition.actors) {
    if (definition.copies === undefined) continue;
    const copies = actors.filter(actor => actor.actor === definition.id && !actor.ghost);
    copies.forEach((actor, index) => { actor.group = { size: copies.length, lead: index === 0 }; });
  }
  // Copies are interchangeable only when nothing tells them apart in this snapshot: the same state, the
  // same occupancy and the same interactions, partner for partner. A copy that sits on other nucleotides
  // or binds another instance is its own thing, whatever its definition.
  const signature = (actor: SceneActor) => {
    const { id: _id, ...state } = snapshot.actors[actor.id]!;
    const held = Object.values(snapshot.occupancy).filter(item => item.instance === actor.id).map(({ id: _key, instance: _instance, ...where }) => where);
    const bound = partnersOf(snapshot, actor.id).map(({ id: _key, ...partner }) => partner);
    return JSON.stringify([actor.actor, state, held, bound]);
  };
  const alike = new Map<string, SceneActor[]>();
  for (const actor of actors.filter(item => !item.ghost && item.id !== item.actor)) alike.set(signature(actor), [...alike.get(signature(actor)) ?? [], actor]);
  for (const copies of alike.values()) if (copies.length > 1) copies.forEach((actor, index) => { actor.identical = { size: copies.length, first: index === 0 }; });

  // A callout that still lies on another body or callout, or off the canvas, looks for a free place: the
  // other side, then higher on either side. One that is already clear is left exactly where it was.
  const bodies = actors.filter(actor => !actor.ghost).map(actor => {
    const outline = contactOutline(actorContactShape(actor));
    const [xs, ys] = [outline.map(point => actor.x + point.x), outline.map(point => actor.y + point.y)];
    return { actor, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [number, number, number, number] };
  });
  // Chains and their own callouts are in the way too.
  const chains = actors.filter(actor => !actor.ghost && actor.chain).flatMap(actor => {
    const { beads } = chainGeometry(actor.radius, actor.chain!.angle, actor.chain!.length, chainBase(actor));
    const reach = (chainBase(actor) + chainReach(actor.chain!.length)) * .72;
    const tip = { x: actor.x + Math.cos(actor.chain!.angle) * reach, y: actor.y + Math.sin(actor.chain!.angle) * reach };
    return [
      ...beads.map(bead => [actor.x + bead.x - bead.r, actor.y + bead.y - bead.r, actor.x + bead.x + bead.r, actor.y + bead.y + bead.r]),
      [tip.x - 64, tip.y - 40, tip.x - 64 + (actor.chain!.label.length + 6) * 6.8, tip.y - 22],
    ];
  });
  const meets = (a: readonly number[], b: readonly number[]) => Math.min(a[2]!, b[2]!) - Math.max(a[0]!, b[0]!) > 4 && Math.min(a[3]!, b[3]!) - Math.max(a[1]!, b[1]!) > 4;
  const settledLabels: [number, number, number, number][] = [];
  for (const actor of actors.filter(item => !item.ghost && item.group?.lead !== false)) {
    const cost = (side: -1 | 1, lift: number) => {
      const box = labelBox(actor, side, lift);
      return bodies.filter(body => body.actor !== actor && meets(box, body.box)).length + settledLabels.filter(other => meets([box[0] - 10, box[1] - 6, box[2] + 10, box[3] + 6], other)).length
        + (chains.some(other => meets(box, other)) ? 1 : 0)
        + (box[0] < 4 || box[2] > width - 4 || box[1] < 4 ? 3 : 0);
    };
    if (cost(actor.labelSide, 0) > 0) {
      const other = -actor.labelSide as -1 | 1;
      const options = [0, 40, 80, 120].flatMap(lift => [[actor.labelSide, lift], [other, lift]] as [-1 | 1, number][]);
      const best = options.reduce((chosen, option) => (cost(...option) < cost(...chosen) ? option : chosen));
      actor.labelSide = best[0];
      if (best[1]) actor.labelLift = best[1];
    }
    settledLabels.push(labelBox(actor));
  }
  const actorIndex = new Map(actors.map(actor => [actor.id, actor]));
  const connections = actors.filter(actor => !actor.ghost && actor.boundTo).flatMap((actor): SceneConnection[] => {
    const reference = actor.boundTo!;
    const contact = contacts.get(actor.id);
    if (contact) return [{ source: actor.id, target: reference, from: contact, to: contact, kind: 'contact' }];
    const acid = acidIndex.get(reference);
    const to = siteIndex.get(reference) ?? actorIndex.get(reference.split('.')[0]!) ?? (acid && { x: actor.x, y: acid.y - HELIX.amplitude });
    return to ? [{ source: actor.id, target: reference, from: { x: actor.x, y: actor.y }, to: { x: to.x, y: to.y }, kind: 'relation' }] : [];
  });
  // An instance is drawn on the first molecule it occupies. Any other span it holds is marked there.
  const footprints: SceneFootprint[] = Object.values(snapshot.occupancy).flatMap((occupancy): SceneFootprint[] => {
    const actor = actorIndex.get(occupancy.instance);
    const acid = acidIndex.get(occupancy.acid);
    if (!actor || actor.ghost || !acid || !occupancy.span || spanOf(occupancy.instance) === occupancy) return [];
    const scale = width / (acid.length ?? 100);
    const [x0, x1] = [occupancy.span.from * scale, occupancy.span.to * scale];
    const strands = occupancy.strand === 'top' ? [0] as const : occupancy.strand === 'bottom' ? [1] as const : [0, 1] as const;
    const ys = strands.flatMap(strand => [0, .25, .5, .75, 1].map(part => helixY(acid, strand, x0 + (x1 - x0) * part, width)));
    const [top, bottom] = [Math.min(...ys) - HELIX.tube / 2 - 4, Math.max(...ys) + HELIX.tube / 2 + 4];
    const tenth = (value: number) => Math.round(value * 10) / 10;
    return [{
      id: occupancy.id, instance: occupancy.instance, actor: actor.actor, label: actor.label, color: actor.color, acid: acid.id,
      from: occupancy.span.from, to: occupancy.span.to, x: tenth(x0 + 1), y: tenth(top), width: tenth(x1 - x0 - 2), height: tenth(bottom - top),
    }];
  });
  const lesions = nucleicAcids.flatMap(acid => acid.sites.flatMap((site): SceneLesion[] => site.lesion
    ? [{ target: site.reference, type: site.lesion, strand: site.lesionStrands!.length > 1 ? 'both' : site.lesionStrands![0]!, x: site.x, y: site.y }]
    : []));

  return {
    width, height,
    title: snapshot.step.title,
    description: snapshot.step.description ?? '',
    nucleicAcids, actors, connections, lesions, pairings, footprints,
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
