import type { ProteinArchitecture, ProteinDisorder, ProteinFold, ProteinVisualProfile } from '../protein-visual-profiles';
import { seededRandom, round, mix, esc, hashString } from './shared';

/** One overlapping ellipsoidal volume of a protein surface. `r` is the geometric mean radius; `domain` is its lobe. */
export interface ProteinSphere { x: number; y: number; r: number; rx: number; ry: number; rotation: number; depth: number; domain?: number; /** Position along a disordered region; absent on folded volumes. */ chain?: number }

/** Deterministic silhouette families. They are visual archetypes, never PDB structures. */
export type ProteinMorphology = 'compact' | 'elongated' | 'bilobed' | 'multidomain' | 'ring' | 'crescent';

export const PROTEIN_MORPHOLOGIES: readonly ProteinMorphology[] = ['compact', 'elongated', 'bilobed', 'multidomain', 'ring', 'crescent'];

/** The silhouette family is a pure function of the seed, independent of size, state or step. */
export function proteinMorphology(visualSeed: string): ProteinMorphology {
  return PROTEIN_MORPHOLOGIES[hashString(`${visualSeed}::morphology`) % PROTEIN_MORPHOLOGIES.length]!;
}

interface Domain { x: number; y: number; rx: number; ry: number; rotation: number }

/** Barrel layout in unit space: rim ellipse semi-axes, height of the top ring and its far-side unit count. */
const BARREL = { a: .52, b: .22, top: -.45, far: 5 } as const;
/** Architectures whose geometry keeps a fixed, upright orientation. */
const UPRIGHT: readonly GeometryFamily[] = ['barrel', 'multisubunit', 'y-shaped', 'dimer'];
/** Fold architectures whose domains are secondary-structure elements: even rods, not lumpy lobes. */
const ELEMENTS: readonly GeometryFamily[] = ['helical-bundle', 'beta-sandwich', 'beta-propeller', 'alpha-beta'];
/** Strands of the far sheet of a `beta-sandwich`, and of the sheet of an `alpha-beta` fold. */
const SHEET = 5;
/** Thickness of a disordered backbone in unit space. */
const IDR_WIDTH = .13;

/** Main lobes (2–4, or a ring of subunits) in unit space; concavities come from their arrangement. */
type GeometryFamily = ProteinMorphology | Exclude<ProteinArchitecture, 'surface'> | Exclude<ProteinFold, 'none'>;

function proteinDomains(family: GeometryFamily, random: () => number): Domain[] {
  const jitter = (amount: number) => (random() - .5) * 2 * amount;
  switch (family) {
    case 'barrel': {
      // Stacked rings seen slightly from above. The first five units are the far side of the top
      // ring; the rest are four courses of near-side units that narrow towards the curved edges.
      const column = (angle: number, y: number, ry: number) => {
        const facing = Math.abs(Math.cos(angle));
        return { x: Math.sin(angle) * BARREL.a + jitter(.012), y: y + Math.cos(angle) * BARREL.b + jitter(.012), rx: .1 + .11 * facing + random() * .012, ry: ry + random() * .012, rotation: jitter(.18) };
      };
      const far = Array.from({ length: BARREL.far }, (_, i) => column(Math.PI + (i - 2) * Math.PI / 5, BARREL.top, .11));
      const near = Array.from({ length: 20 }, (_, i) => column((i % 5 - 2) * Math.PI / 5, BARREL.top + Math.floor(i / 5) * .3, .165));
      return [...far, ...near];
    }
    case 'helical-bundle': {
      // Four or five thick rods packed side by side, slightly splayed and staggered.
      const count = 4 + Math.floor(random() * 2);
      return Array.from({ length: count }, (_, index) => {
        const lane = index - (count - 1) / 2;
        return { x: lane * .27, y: jitter(.09), rx: .48 + jitter(.06), ry: .15, rotation: Math.PI / 2 + lane * .07 + jitter(.06) };
      });
    }
    case 'beta-sandwich': {
      // Two sheets of thin parallel strands; the far sheet is shifted so it shows behind the near one.
      const tilt = Math.PI / 2 + .14 + jitter(.08);
      const sheet = (dx: number, dy: number) => Array.from({ length: SHEET }, (_, index) => (
        { x: (index - (SHEET - 1) / 2) * .17 + dx, y: dy + jitter(.025), rx: .44 + jitter(.03), ry: .095, rotation: tilt }
      ));
      return [...sheet(.1, -.17), ...sheet(-.05, .06)];
    }
    case 'beta-propeller': {
      // Seven twisted blades around a narrow pore: a pinwheel, where `ring` is a chain of tangential subunits.
      const twist = .5 + jitter(.1);
      return Array.from({ length: 7 }, (_, index) => {
        const angle = index / 7 * Math.PI * 2;
        return { x: Math.cos(angle) * .5, y: Math.sin(angle) * .5, rx: .31, ry: .2, rotation: angle + twist };
      });
    }
    case 'alpha-beta': {
      // A central sheet of short strands capped by one helix across each end: three layers.
      const strands = Array.from({ length: SHEET }, (_, index) => (
        { x: (index - (SHEET - 1) / 2) * .17, y: jitter(.02), rx: .33, ry: .095, rotation: Math.PI / 2 }
      ));
      const helix = (side: number) => ({ x: jitter(.04), y: side * .43, rx: .5 + jitter(.04), ry: .16, rotation: jitter(.1) });
      return [...strands, helix(-1), helix(1)];
    }
    case 'y-shaped': {
      // Two arms and a stem meeting at a hinge; each limb is two stacked domains.
      const limb = (angle: number) => [.3, .68].map(distance => (
        { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, rx: .25 + random() * .03, ry: .17 + random() * .03, rotation: angle + jitter(.12) }
      ));
      const open = .78 + random() * .2;
      return [{ x: 0, y: 0, rx: .15, ry: .15, rotation: 0 }, ...limb(-Math.PI / 2 - open), ...limb(-Math.PI / 2 + open), ...limb(Math.PI / 2)];
    }
    case 'dimer': {
      // Two mirrored protomers sharing one interface on the vertical axis; domains 0–1 and 2–3 are the protomers.
      const rx = .3 + random() * .05; const ry = .44 + random() * .08;
      const lean = .18 + random() * .2;
      const cap = { x: .44 + random() * .1, y: -.4 - random() * .12, r: .2 + random() * .05 };
      return [-1, 1].flatMap(side => [
        { x: side * rx * .86, y: 0, rx, ry, rotation: side * lean },
        { x: side * cap.x, y: cap.y, rx: cap.r * 1.15, ry: cap.r, rotation: side * .6 },
      ]);
    }
    case 'fibrous': {
      // A long, thin rod of even segments with a gentle supercoil wave: a fibre, not a chain of domains.
      const wave = .02 + random() * .02;
      return Array.from({ length: 8 }, (_, index) => (
        { x: (index / 7 * 2 - 1) * .88, y: index % 2 ? wave : -wave, rx: .23, ry: .15 + random() * .015, rotation: (index % 2 ? -1 : 1) * .2 }
      ));
    }
    case 'multisubunit': {
      // A central unit and staggered neighbours form a compact asymmetric complex,
      // unlike a cyclic oligomer: separate unit contours remain visible at small scales.
      const jitter = () => (random() - .5) * .045;
      const centres = [[-.03, .035], [-.46, -.24], [.34, -.36], [-.31, .42], [.42, .28]];
      return centres.map(([x, y], index) => ({
        x: x! + jitter(), y: y! + jitter(),
        rx: (index === 0 ? .3 : .275) + random() * .025,
        ry: (index === 0 ? .275 : .255) + random() * .025,
        rotation: (random() - .5) * 1.2,
      }));
    }
    case 'compact': {
      // A squat core with 1–3 bulges gathered on one arc: the free side stays flat or notched,
      // so compact proteins differ in where their mass sits, not only in their outline noise.
      const core = { x: 0, y: 0, rx: .46 + random() * .14, ry: .32 + random() * .18, rotation: jitter(.4) };
      const lobes = 1 + Math.floor(random() * 3);
      const start = random() * Math.PI * 2;
      const spread = Math.PI * (.55 + random() * 1.05);
      return [core, ...Array.from({ length: lobes }, (_, index) => {
        const angle = start + (lobes > 1 ? index / (lobes - 1) : .5) * spread;
        const size = .16 + random() * .24;
        const distance = .36 + random() * .3;
        return { x: Math.cos(angle) * distance * 1.1, y: Math.sin(angle) * distance * .9, rx: size * (1 + random() * .3), ry: size, rotation: angle };
      })];
    }
    case 'elongated': {
      const count = 3 + Math.floor(random() * 3);
      const bend = jitter(.35);
      const half = .55 + random() * .17;
      const heavy = random() < .5 ? -1 : 1;
      return Array.from({ length: count }, (_, index) => {
        const t = index / (count - 1) * 2 - 1;
        // One end may carry a heavier domain, so elongated proteins are not all symmetric rods.
        const size = .21 + random() * .12 + Math.max(0, t * heavy) * random() * .12;
        return { x: t * half, y: bend * (1 - t * t) + jitter(.05), rx: size * 1.12, ry: size * (.75 + random() * .2), rotation: jitter(.5) };
      });
    }
    case 'bilobed': {
      const gap = .4 + random() * .18;
      const major = .38 + random() * .1;
      const minor = major * (.55 + random() * .45);
      const tilt = jitter(.45);
      const first = { x: -gap, y: 0, rx: major * (1 + random() * .25), ry: major, rotation: jitter(.6) };
      const second = { x: gap * (.8 + random() * .2), y: Math.sin(tilt) * gap, rx: minor * (1 + random() * .3), ry: minor, rotation: jitter(.6) };
      // The neck sits on the axis between the lobes and is thinner than both: a visible waist, never a gap.
      const neck = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, rx: Math.hypot(second.x - first.x, second.y - first.y) * .3, ry: minor * (.5 + random() * .2), rotation: Math.atan2(second.y - first.y, second.x - first.x) };
      const domains = [first, second, neck];
      if (random() < .45) {
        const angle = Math.PI + jitter(1.1);
        domains.push({ x: first.x + Math.cos(angle) * major * .9, y: first.y + Math.sin(angle) * major * .9, rx: major * .42, ry: major * .34, rotation: angle });
      }
      return domains;
    }
    case 'multidomain': {
      const count = 3 + Math.floor(random() * 2);
      const domains: Domain[] = [];
      let heading = random() * Math.PI * 2;
      let previous: Domain = { x: 0, y: 0, rx: .38 + jitter(.05), ry: .32 + jitter(.04), rotation: random() * Math.PI };
      domains.push(previous);
      for (let index = 1; index < count; index++) {
        const size = .22 + random() * .16;
        heading += (random() < .5 ? -1 : 1) * (.8 + random() * .8);
        const distance = (Math.max(previous.rx, previous.ry) + size) * .82;
        previous = { x: previous.x + Math.cos(heading) * distance, y: previous.y + Math.sin(heading) * distance, rx: size, ry: size * (.75 + random() * .2), rotation: heading };
        domains.push(previous);
      }
      return domains;
    }
    case 'ring': {
      const count = 5 + Math.floor(random() * 5);
      const squash = .68 + random() * .32;
      const thickness = .14 + random() * .12;
      const subunits = Array.from({ length: count }, (_, index) => {
        const angle = index / count * Math.PI * 2 + jitter(.06);
        // Subunits are sized from the chord between neighbours so the ring always closes.
        const chord = 2 * .62 * Math.sin(Math.PI / count);
        return { x: Math.cos(angle) * .62, y: Math.sin(angle) * .62 * squash, rx: chord * .66 + jitter(.02), ry: thickness, rotation: angle + Math.PI / 2 };
      });
      if (random() < .4) {
        // An outward cap on one subunit breaks the ring's rotational symmetry.
        const angle = random() * Math.PI * 2;
        subunits.push({ x: Math.cos(angle) * .86, y: Math.sin(angle) * .86 * squash, rx: .2, ry: .15, rotation: angle });
      }
      return subunits;
    }
    case 'crescent': {
      const count = 4 + Math.floor(random() * 3);
      const span = Math.PI * (.9 + random() * .6);
      const arc = .5 + random() * .12;
      const taper = random();
      return Array.from({ length: count }, (_, index) => {
        const t = index / (count - 1);
        const angle = -span / 2 + t * span;
        // Spacing-aware sizes keep neighbours overlapping; `taper` makes one horn heavier.
        const spacing = 2 * arc * Math.sin(span / (count - 1) / 2);
        const size = Math.max(spacing * .62, .2 + Math.sin(t * Math.PI) * .12 + (t - .5) * (taper - .5) * .16);
        return { x: Math.cos(angle) * arc, y: Math.sin(angle) * arc, rx: size * 1.12, ry: size, rotation: angle + Math.PI / 2 };
      });
    }
  }
}

/**
 * Stable pseudo-3D surface geometry: overlapping ellipsoids grouped into the lobes of a silhouette
 * family. It is a pure function of (visualSeed, radius, count[, morphology]) and never reads
 * biological role or global randomness. The result is centred and fits within `radius`.
 */
export function proteinGeometry(visualSeed: string, radius = 52, count = 28, morphology?: ProteinMorphology): ProteinSphere[] {
  return generateProteinGeometry(visualSeed, radius, count, morphology ?? proteinMorphology(visualSeed));
}

/** Architecture never reads secondary structure or activity: both reuse the exact same surface. */
export function proteinProfileGeometry(visualSeed: string, radius = 52, count = 28, profile: ProteinVisualProfile): ProteinSphere[] {
  if (profile.disorder === 'extended') return generateProteinGeometry(visualSeed, radius, count, undefined, 'extended');
  const family = profile.fold !== 'none' ? profile.fold : profile.architecture === 'surface' ? proteinMorphology(visualSeed) : profile.architecture;
  return generateProteinGeometry(visualSeed, radius, count, family, profile.disorder);
}

/**
 * A disordered region as one continuous, irregular backbone: a persistent random walk sampled
 * densely enough that its volumes merge into a cord. `from` is where it leaves a folded body.
 */
function disorderedChain(visualSeed: string, length: number, from?: { x: number; y: number; heading: number }): { x: number; y: number }[] {
  const random = seededRandom(`${visualSeed}::disorder`);
  const step = .05;
  let { x, y, heading } = from ?? { x: 0, y: 0, heading: random() * Math.PI * 2 };
  let curl = (random() - .5) * .4;
  const points = [{ x, y }];
  for (let travelled = 0; travelled < length; travelled += step) {
    // Curvature drifts and reverts to zero: the path wanders in loose bends, never zigzags or closes a ring.
    curl = Math.max(-.26, Math.min(.26, curl * .72 + (random() - .5) * .3));
    // A tail keeps to the direction it left the body in; a free coil stays loosely gathered.
    const target = from ? from.heading : Math.atan2(-y, -x);
    const pull = from ? .09 : .2 * Math.max(0, Math.hypot(x, y) - .7);
    heading += curl + pull * Math.sin(target - heading);
    x += Math.cos(heading) * step; y += Math.sin(heading) * step;
    points.push({ x, y });
  }
  return points;
}


function generateProteinGeometry(visualSeed: string, radius: number, count: number, family: GeometryFamily | undefined, disorder: ProteinDisorder = 'none'): ProteinSphere[] {
  const random = seededRandom(`${visualSeed}::${family ?? 'extended'}`);
  const turn = !family || UPRIGHT.includes(family) ? 0 : family === 'ring' ? random() * Math.PI : random() * Math.PI * 2;
  const domains = family ? proteinDomains(family, random) : [];
  const area = domains.reduce((sum, domain) => sum + domain.rx * domain.ry, 0);
  const particles: Omit<ProteinSphere, 'r'>[] = [];
  domains.forEach((domain, domainIndex) => {
    const element = !!family && ELEMENTS.includes(family);
    const share = element ? 3 : Math.max(3, Math.round(count * domain.rx * domain.ry / area));
    const cos = Math.cos(domain.rotation); const sin = Math.sin(domain.rotation);
    const minor = Math.min(domain.rx, domain.ry);
    for (let index = 0; index < share; index++) {
      const core = index === 0;
      const theta = random() * Math.PI * 2;
      const reach = core ? 0 : .42 + random() * .42;
      const lx = Math.cos(theta) * domain.rx * reach;
      const ly = Math.sin(theta) * domain.ry * reach;
      const size = core ? 1 : .42 + random() * .4;
      const ellipticity = .7 + random() * .3;
      if (element && !core) {
        // Two volumes along the axis even out the thickness: a rod with rounded ends, not an ellipse.
        const along = (index === 1 ? -1 : 1) * domain.rx * (.4 + random() * .08);
        particles.push({ x: domain.x + along * cos, y: domain.y + along * sin, rx: domain.rx * .5, ry: domain.ry * (.84 + random() * .1), rotation: domain.rotation, depth: random(), domain: domainIndex });
        continue;
      }
      particles.push({
        x: domain.x + lx * cos - ly * sin,
        y: domain.y + lx * sin + ly * cos,
        rx: core ? domain.rx * .9 : minor * size,
        ry: core ? domain.ry * .9 : minor * size * ellipticity,
        rotation: core ? domain.rotation : random() * Math.PI,
        depth: core ? .5 + domainIndex * .01 : random(),
        domain: domainIndex,
      });
    }
  });
  if (disorder !== 'none') {
    // The region leaves the folded body from its outermost volume along a seeded direction.
    const exit = seededRandom(`${visualSeed}::disorder-exit`)() * Math.PI * 2;
    const anchor = particles.length ? particles.reduce((best, p) => p.x * Math.cos(exit) + p.y * Math.sin(exit) > best.x * Math.cos(exit) + best.y * Math.sin(exit) ? p : best) : undefined;
    const chain = disorderedChain(visualSeed, anchor ? 1.15 : 5.2, anchor && { x: anchor.x, y: anchor.y, heading: exit });
    chain.forEach((point, index) => particles.push({ ...point, rx: IDR_WIDTH / 2, ry: IDR_WIDTH / 2, rotation: 0, depth: 0, domain: domains.length, chain: index }));
  }
  // Rotate the whole silhouette, centre it on its area-weighted centroid and fit it to `radius`.
  const rotated = particles.map(particle => ({
    ...particle,
    x: particle.x * Math.cos(turn) - particle.y * Math.sin(turn),
    y: particle.x * Math.sin(turn) + particle.y * Math.cos(turn),
    rotation: particle.rotation + turn,
  }));
  const weight = rotated.reduce((sum, particle) => sum + particle.rx * particle.ry, 0);
  const cx = rotated.reduce((sum, particle) => sum + particle.x * particle.rx * particle.ry, 0) / weight;
  const cy = rotated.reduce((sum, particle) => sum + particle.y * particle.rx * particle.ry, 0) / weight;
  const extent = Math.max(...rotated.map(particle => Math.hypot(particle.x - cx, particle.y - cy) + Math.max(particle.rx, particle.ry)));
  const scale = radius * .98 / extent;
  return rotated.map(particle => {
    const rx = particle.rx * scale; const ry = particle.ry * scale;
    return { x: (particle.x - cx) * scale, y: (particle.y - cy) * scale, rx, ry, r: Math.sqrt(rx * ry), rotation: particle.rotation * 180 / Math.PI, depth: particle.depth, domain: particle.domain, ...(particle.chain !== undefined && { chain: particle.chain }) };
  }).sort((a, b) => a.depth - b.depth);
}

/**
 * One continuous volume built from overlapping particles. The silhouette outline is the dominant
 * line; shading is computed per lobe (each lobe's particles scaled towards one top-left light), so
 * the eye reads lobes as volumes first and the particles only as a faint surface texture.
 */
export function renderProteinSurface(particles: readonly ProteinSphere[], fill: string, radius: number): string {
  const light = { x: -.6, y: -.8 };
  const lobes = new Map<number, ProteinSphere[]>();
  for (const particle of particles) lobes.set(particle.domain ?? 0, [...(lobes.get(particle.domain ?? 0) ?? []), particle]);
  const centres = new Map([...lobes].map(([domain, members]) => {
    const weight = members.reduce((sum, particle) => sum + particle.r * particle.r, 0);
    const x = members.reduce((sum, particle) => sum + particle.x * particle.r * particle.r, 0) / weight;
    const y = members.reduce((sum, particle) => sum + particle.y * particle.r * particle.r, 0) / weight;
    // The lobe's thinnest dimension bounds every offset, so light never leaves a narrow lobe.
    const unit = Math.max(...members.map(particle => Math.min(particle.rx, particle.ry)));
    return [domain, { x, y, unit, largest: Math.max(...members.map(particle => particle.r)) }];
  }));
  const ellipse = (x: number, y: number, rx: number, ry: number, rotation: number) => rx < .6 || ry < .6 ? ''
    : `<ellipse cx="${round(x)}" cy="${round(y)}" rx="${round(rx)}" ry="${round(ry)}" transform="rotate(${round(rotation)} ${round(x)} ${round(y)})"/>`;
  const all = (grow: number) => particles.map(particle => ellipse(particle.x, particle.y, particle.rx + grow, particle.ry + grow, particle.rotation)).join('');
  // Each lobe scaled about its own centre and nudged towards the light: a lit core with a shaded rim.
  // Every lit ellipse is clamped inside its own particle, so no layer can leave the silhouette.
  const lit = (scale: number, shift: number, major = 0) => particles.map(particle => {
    const centre = centres.get(particle.domain ?? 0)!;
    if (particle.r < centre.largest * major) return '';
    const offset = shift * centre.unit;
    let dx = centre.x + (particle.x - centre.x) * scale + light.x * offset - particle.x;
    let dy = centre.y + (particle.y - centre.y) * scale + light.y * offset - particle.y;
    const room = Math.min(particle.rx, particle.ry) * (1 - scale);
    const distance = Math.hypot(dx, dy);
    if (distance > room) { dx *= room / distance; dy *= room / distance; }
    return ellipse(particle.x + dx, particle.y + dy, particle.rx * scale, particle.ry * scale, particle.rotation);
  }).join('');
  // Texture: a faint highlight per particle, offset towards the same light.
  const sheen = particles.map(particle => ellipse(particle.x + light.x * particle.r * .32, particle.y + light.y * particle.r * .32, particle.rx * .42, particle.ry * .42, particle.rotation)).join('');
  const outline = proteinOutlineWidth(radius);
  return `<g class="mm-surface">`
    + `<g class="mm-surface__outline" fill="${mix(fill, '#17213b', .45)}">${all(outline)}</g>`
    + `<g class="mm-surface__shade" fill="${mix(fill, '#1b2340', .28)}">${all(0)}</g>`
    + `<g class="mm-surface__body" fill="${esc(fill)}">${lit(.93, .1)}</g>`
    + `<g class="mm-surface__light" fill="${mix(fill, '#ffffff', .45)}" opacity=".45">${lit(.58, .3, .7)}</g>`
    + `<g class="mm-surface__sheen" fill="#ffffff" opacity=".1">${sheen}</g>`
    + `</g>`;
}

/** Width of the silhouette outline drawn by `renderProteinSurface`; part of the visible surface. */
export const proteinOutlineWidth = (radius: number) => Math.max(1.6, radius * .038);

export interface ProteinPoint { x: number; y: number }

/** Visual contact geometry of a protein surface. It carries no biological meaning. */
export interface ProteinAnchors {
  center: ProteinPoint;
  bounds: { x: number; y: number; width: number; height: number };
  left: ProteinPoint; right: ProteinPoint; top: ProteinPoint; bottom: ProteinPoint;
}

export const insideParticle = (particle: ProteinSphere, x: number, y: number, margin: number) => {
  const theta = particle.rotation * Math.PI / 180;
  const dx = x - particle.x; const dy = y - particle.y;
  const u = dx * Math.cos(theta) + dy * Math.sin(theta);
  const v = -dx * Math.sin(theta) + dy * Math.cos(theta);
  return (u / (particle.rx + margin)) ** 2 + (v / (particle.ry + margin)) ** 2 <= 1;
};

/**
 * Contact anchors on the visible surface (outline included when `radius` is given), in the
 * protein's local coordinates. Each anchor is the outermost surface point along a ray from the
 * centre, so concave and ring-shaped proteins get real contact points, not bounding-circle points.
 * Compositions place partners anchor-to-anchor, e.g. `A.right ↔ B.left`.
 */
export function proteinAnchors(particles: readonly ProteinSphere[], radius?: number): ProteinAnchors {
  const margin = radius === undefined ? 0 : proteinOutlineWidth(radius);
  const weight = particles.reduce((sum, particle) => sum + particle.rx * particle.ry, 0);
  const center = {
    x: particles.reduce((sum, particle) => sum + particle.x * particle.rx * particle.ry, 0) / weight,
    y: particles.reduce((sum, particle) => sum + particle.y * particle.rx * particle.ry, 0) / weight,
  };
  const boxes = particles.map(particle => {
    const theta = particle.rotation * Math.PI / 180;
    const rx = particle.rx + margin; const ry = particle.ry + margin;
    const hx = Math.hypot(rx * Math.cos(theta), ry * Math.sin(theta));
    const hy = Math.hypot(rx * Math.sin(theta), ry * Math.cos(theta));
    return [particle.x - hx, particle.y - hy, particle.x + hx, particle.y + hy] as const;
  });
  const x0 = Math.min(...boxes.map(box => box[0])); const y0 = Math.min(...boxes.map(box => box[1]));
  const x1 = Math.max(...boxes.map(box => box[2])); const y1 = Math.max(...boxes.map(box => box[3]));
  const reach = Math.hypot(Math.max(Math.abs(x0 - center.x), Math.abs(x1 - center.x)), Math.max(Math.abs(y0 - center.y), Math.abs(y1 - center.y)));
  const along = (dx: number, dy: number): ProteinPoint => {
    for (let t = reach; t >= 0; t -= .25) {
      const x = center.x + dx * t; const y = center.y + dy * t;
      if (particles.some(particle => insideParticle(particle, x, y, margin))) return { x: round(x), y: round(y) };
    }
    return { x: round(center.x), y: round(center.y) };
  };
  return {
    center: { x: round(center.x), y: round(center.y) },
    bounds: { x: round(x0), y: round(y0), width: round(x1 - x0), height: round(y1 - y0) },
    left: along(-1, 0), right: along(1, 0), top: along(0, -1), bottom: along(0, 1),
  };
}

/** Contour-following state halo: three stacked layers, strongest at the outline, readable at small radii. */
export function renderProteinInhibition(particles: readonly ProteinSphere[], radius: number): string {
  const ellipses = (grow: number) => particles.map(p => `<ellipse cx="${round(p.x)}" cy="${round(p.y)}" rx="${round(p.rx + grow)}" ry="${round(p.ry + grow)}" transform="rotate(${round(p.rotation)} ${round(p.x)} ${round(p.y)})"/>`).join('');
  // A minimum width in pixels keeps the halo visible on small glyphs, where a proportional one vanishes.
  const step = Math.max(1.6, radius * .05);
  return `<g class="mm-primitive__inhibition" aria-hidden="true" fill="var(--mm-alert,#e5484d)">${[.3, .16, .08].map((opacity, i) => `<g opacity="${opacity}">${ellipses(proteinOutlineWidth(radius) + step * (i + 1))}</g>`).reverse().join('')}</g>`;
}

const byDomain = (particles: readonly ProteinSphere[], key = (domain: number) => domain) => {
  const units = new Map<number, ProteinSphere[]>();
  for (const p of particles) units.set(key(p.domain ?? 0), [...(units.get(key(p.domain ?? 0)) ?? []), p]);
  return units;
};

/** The folded body of a profile: its fold when it has one, otherwise its architecture. */
function renderFoldedSurface(particles: readonly ProteinSphere[], fill: string, radius: number, profile: ProteinVisualProfile): string {
  const architecture = profile.fold !== 'none' ? profile.fold : profile.architecture;
  // Every unit keeps its own contour, including shared seams at small display sizes.
  const unit = (members: readonly ProteinSphere[], colour: string, scale: number) => renderProteinSurface(members, colour, radius * scale).replaceAll('mm-surface', 'mm-subunit-surface');
  if (architecture === 'multisubunit' || architecture === 'ring') {
    return `<g class="mm-surface mm-surface--${architecture}">${[...byDomain(particles).values()].map(members => unit(members, fill, .58)).join('')}</g>`;
  }
  if (profile.fold !== 'none') {
    // Each helix or strand is its own volume. Far elements are drawn first and darker.
    const far = (domain: number) => (architecture === 'beta-sandwich' || architecture === 'alpha-beta') && domain < SHEET;
    return `<g class="mm-surface mm-surface--${architecture}">${[...byDomain(particles).entries()].sort(([a], [b]) => a - b).map(([domain, members]) => unit(members, far(domain) ? mix(fill, '#1b2340', .2) : fill, .58)).join('')}</g>`;
  }
  if (architecture === 'dimer') {
    return `<g class="mm-surface mm-surface--dimer">${[...byDomain(particles, domain => Math.floor(domain / 2)).values()].map(members => unit(members, fill, .8)).join('')}</g>`;
  }
  if (architecture !== 'barrel') return renderProteinSurface(particles, fill, radius);
  // Same organic volumes as every other protein: far rim, lumen, then the near wall, darkened towards its curved edges.
  const units = [...byDomain(particles).entries()].sort(([a], [b]) => a - b);
  const centre = (members: readonly ProteinSphere[]) => members.reduce((best, p) => p.rx * p.ry > best.rx * best.ry ? p : best);
  const rim = units.slice(0, BARREL.far * 2).map(([, members]) => centre(members));
  const xs = rim.map(p => p.x); const ys = rim.map(p => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2; const half = (Math.max(...xs) - Math.min(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const ry = half * BARREL.b / BARREL.a;
  const wall = (domain: number, members: readonly ProteinSphere[]) => {
    const edge = Math.min(1, Math.abs(centre(members).x - cx) / half);
    return unit(members, mix(fill, '#1b2340', (domain < BARREL.far ? .2 : 0) + edge * edge * .22), .5);
  };
  const lumen = `<ellipse cx="${round(cx)}" cy="${round(cy)}" rx="${round(half * .86)}" ry="${round(ry * .95)}" fill="${mix(fill, '#1b2340', .42)}"/>`
    + `<ellipse cx="${round(cx)}" cy="${round(cy + ry * .1)}" rx="${round(half * .46)}" ry="${round(ry * .5)}" fill="${mix(fill, '#0b1020', .78)}"/>`;
  return `<g class="mm-surface mm-surface--barrel">`
    + units.filter(([domain]) => domain < BARREL.far).map(([domain, members]) => wall(domain, members)).join('')
    + lumen
    + units.filter(([domain]) => domain >= BARREL.far).map(([domain, members]) => wall(domain, members)).join('')
    + `</g>`;
}

/**
 * A disordered region drawn as one continuous cord in the protein's own colour: a smooth path
 * through its volumes, with the same outline and light as a folded surface. No beads, links or labels.
 */
function renderDisorderedRegion(chain: readonly ProteinSphere[], fill: string, radius: number): string {
  if (chain.length < 2) return '';
  const points = [...chain].sort((a, b) => a.chain! - b.chain!);
  const width = points[0]!.rx * 2;
  // Catmull-Rom through every volume centre, so the drawn cord follows the contact geometry exactly.
  const d = points.map((p, i) => {
    if (i === 0) return `M${round(p.x)} ${round(p.y)}`;
    const p0 = points[Math.max(0, i - 2)]!; const p1 = points[i - 1]!; const p3 = points[Math.min(points.length - 1, i + 1)]!;
    return `C${round(p1.x + (p.x - p0.x) / 6)} ${round(p1.y + (p.y - p0.y) / 6)} ${round(p.x - (p3.x - p1.x) / 6)} ${round(p.y - (p3.y - p1.y) / 6)} ${round(p.x)} ${round(p.y)}`;
  }).join('');
  const stroke = (colour: string, size: number, extra = '') => `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${round(size)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
  return `<g class="mm-surface__disorder">`
    + stroke(mix(fill, '#17213b', .45), width + proteinOutlineWidth(radius) * 2)
    + stroke(esc(fill), width)
    + stroke(mix(fill, '#ffffff', .45), width * .32, ` opacity=".5" transform="translate(${round(-width * .14)} ${round(-width * .18)})"`)
    + `</g>`;
}

/** Profile detail uses only a resolved visual profile, never biological identity. */
export function renderProteinArchitectureSurface(particles: readonly ProteinSphere[], fill: string, radius: number, profile: ProteinVisualProfile): string {
  const chain = particles.filter(p => p.chain !== undefined);
  if (!chain.length) return renderFoldedSurface(particles, fill, radius, profile);
  const body = particles.filter(p => p.chain === undefined);
  // The cord is drawn first, so it emerges from under the folded body without a visible joint.
  return `<g class="mm-surface mm-surface--${profile.disorder}">${renderDisorderedRegion(chain, fill, radius)}${body.length ? renderFoldedSurface(body, fill, radius, profile).replaceAll('mm-surface', 'mm-subunit-surface') : ''}</g>`;
}
