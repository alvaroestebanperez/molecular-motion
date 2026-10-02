import { seededRandom, round, mix, esc, hashString } from './shared';

/** One overlapping ellipsoidal volume of a protein surface. `r` is the geometric mean radius; `domain` is its lobe. */
export interface ProteinSphere { x: number; y: number; r: number; rx: number; ry: number; rotation: number; depth: number; domain?: number }

/** Deterministic silhouette families. They are visual archetypes, never PDB structures. */
export type ProteinMorphology = 'compact' | 'elongated' | 'bilobed' | 'multidomain' | 'ring' | 'crescent';

export const PROTEIN_MORPHOLOGIES: readonly ProteinMorphology[] = ['compact', 'elongated', 'bilobed', 'multidomain', 'ring', 'crescent'];

/** The silhouette family is a pure function of the seed, independent of size, state or step. */
export function proteinMorphology(visualSeed: string): ProteinMorphology {
  return PROTEIN_MORPHOLOGIES[hashString(`${visualSeed}::morphology`) % PROTEIN_MORPHOLOGIES.length]!;
}

interface Domain { x: number; y: number; rx: number; ry: number; rotation: number }

/** Main lobes (2–4, or a ring of subunits) in unit space; concavities come from their arrangement. */
function proteinDomains(family: ProteinMorphology, random: () => number): Domain[] {
  const jitter = (amount: number) => (random() - .5) * 2 * amount;
  switch (family) {
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
  const family = morphology ?? proteinMorphology(visualSeed);
  const random = seededRandom(`${visualSeed}::${family}`);
  const turn = family === 'ring' ? random() * Math.PI : random() * Math.PI * 2;
  const domains = proteinDomains(family, random);
  const area = domains.reduce((sum, domain) => sum + domain.rx * domain.ry, 0);
  const particles: Omit<ProteinSphere, 'r'>[] = [];
  domains.forEach((domain, domainIndex) => {
    const share = Math.max(3, Math.round(count * domain.rx * domain.ry / area));
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
    return { x: (particle.x - cx) * scale, y: (particle.y - cy) * scale, rx, ry, r: Math.sqrt(rx * ry), rotation: particle.rotation * 180 / Math.PI, depth: particle.depth, domain: particle.domain };
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
