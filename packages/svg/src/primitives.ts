import { hashString } from './scene';

export type ProteinVisualState = 'normal' | 'active' | 'inactive' | 'inhibited' | 'degraded' | 'selected' | 'future';
export type ModificationVisualKind = 'phosphorylation' | 'acetylation' | 'methylation' | 'ubiquitination' | 'sumoylation' | 'glycosylation' | 'parylation';
export type DnaVisualState = 'normal' | 'damaged' | 'cleaved' | 'unwound' | 'resected' | 'elongating' | 'repaired';
export type VisualLesion = 'damaged-base' | 'ap-site' | 'mismatch' | 'nick' | 'ssb' | 'dsb' | 'crosslink' | 'adduct';
export type ActionVisualKind = 'bind' | 'unbind' | 'recruit' | 'dimerize' | 'activate' | 'inhibit' | 'modify' | 'cleave' | 'ligate' | 'synthesize' | 'degrade' | 'translocate' | 'polymerize' | 'unwind' | 'elongate' | 'conformational-change';

/** One overlapping ellipsoidal volume of a protein surface. `r` is the geometric mean radius; `domain` is its lobe. */
export interface ProteinSphere { x: number; y: number; r: number; rx: number; ry: number; rotation: number; depth: number; domain?: number }
/** Deterministic silhouette families. They are visual archetypes, never PDB structures. */
export type ProteinMorphology = 'compact' | 'elongated' | 'bilobed' | 'multidomain' | 'ring' | 'crescent';
export const PROTEIN_MORPHOLOGIES: readonly ProteinMorphology[] = ['compact', 'elongated', 'bilobed', 'multidomain', 'ring', 'crescent'];
export interface ProteinPrimitiveOptions {
  visualSeed: string;
  radius?: number;
  fill?: string;
  state?: ProteinVisualState;
  modifications?: readonly { kind: ModificationVisualKind; length?: number; branched?: boolean }[];
  /** Overrides the family derived from `visualSeed`. Intended for legends and catalogs only. */
  morphology?: ProteinMorphology;
}

const esc = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const round = (value: number) => Math.round(value * 10) / 10;

/** Mix two colours; hex values are mixed exactly, anything else falls back to CSS color-mix(). */
export function mix(color: string, other: string, amount: number): string {
  const parse = (hex: string) => {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) return undefined;
    const value = match[1]!.length === 3 ? match[1]!.split('').map(char => char + char).join('') : match[1]!;
    return [0, 2, 4].map(offset => parseInt(value.slice(offset, offset + 2), 16));
  };
  const a = parse(color);
  const b = parse(other);
  if (!a || !b) return `color-mix(in srgb, ${esc(color)} ${Math.round((1 - amount) * 100)}%, ${other})`;
  return `#${a.map((channel, index) => Math.round(channel + (b[index]! - channel) * amount).toString(16).padStart(2, '0')).join('')}`;
}

function seededRandom(seed: string) {
  let state = hashString(seed) || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507) ^ Math.imul(state ^ (state >>> 13), 3266489909);
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
}

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

const insideParticle = (particle: ProteinSphere, x: number, y: number, margin: number) => {
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

export function renderProteinPrimitive(options: ProteinPrimitiveOptions): string {
  const radius = options.radius ?? 52;
  const state = options.state ?? 'normal';
  const fill = options.fill ?? 'var(--mm-protein,#7d78d8)';
  const particles = proteinGeometry(options.visualSeed, radius, 28, options.morphology);
  // Degradation fragments the same geometry instead of generating a different protein.
  const shown = state === 'degraded'
    ? particles.filter((_, index) => index % 3 !== 1).map((particle, index, all) => {
      const scatter = 1.25 + index / all.length * .8;
      return { ...particle, x: particle.x * scatter, y: particle.y * scatter, rx: particle.rx * .82, ry: particle.ry * .82 };
    })
    : particles;
  const halo = state === 'active' || state === 'selected' ? `<circle class="mm-primitive__halo" r="${radius + 14}"/>` : '';
  const inhibit = state === 'inhibited' ? `<g class="mm-primitive__inhibition"><circle r="${radius + 8}"/><path d="M${-radius * .72} ${radius * .72}L${radius * .72} ${-radius * .72}"/></g>` : '';
  const modifications = (options.modifications ?? []).map((modification, index) => renderModificationPrimitive(modification, {
    x: Math.cos(-2.3 + index * .55) * radius * .92,
    y: Math.sin(-2.3 + index * .55) * radius * .92,
  })).join('');
  return `<g class="mm-primitive mm-primitive--protein mm-primitive--${state}" data-visual-seed="${esc(options.visualSeed)}" data-morphology="${options.morphology ?? proteinMorphology(options.visualSeed)}" style="--mm-protein:${esc(fill)}">${halo}${renderProteinSurface(shown, fill, radius)}${inhibit}${modifications}</g>`;
}

const MODIFICATION_LABELS: Record<ModificationVisualKind, string> = {
  phosphorylation: 'P', acetylation: 'Ac', methylation: 'Me', ubiquitination: 'Ub', sumoylation: 'SUMO', glycosylation: 'sugar', parylation: 'PAR',
};

export function renderModificationPrimitive(modification: { kind: ModificationVisualKind; length?: number; branched?: boolean }, at = { x: 0, y: 0 }): string {
  const { kind } = modification;
  if (kind === 'parylation' || (kind === 'ubiquitination' && (modification.length ?? 0) > 1)) {
    const count = Math.max(2, Math.min(modification.length ?? 6, 14));
    const links: string[] = [];
    const beads: string[] = [];
    let previous = at;
    for (let index = 0; index < count; index++) {
      const point = { x: at.x + 11 + index * 12, y: at.y - index * 7 + Math.sin(index * 1.2) * 6 };
      links.push(`M${round(previous.x)} ${round(previous.y)}L${round(point.x)} ${round(point.y)}`);
      beads.push(`<circle cx="${round(point.x)}" cy="${round(point.y)}" r="${kind === 'ubiquitination' ? 7 : 5.5}"/>`);
      if (modification.branched && index > 1 && index % 4 === 2) {
        links.push(`M${round(point.x)} ${round(point.y)}l-3 -15`);
        beads.push(`<circle cx="${round(point.x - 3)}" cy="${round(point.y - 15)}" r="5"/>`);
      }
      previous = point;
    }
    return `<g class="mm-modification mm-modification--chain mm-modification--${kind}"><path d="${links.join('')}"/>${beads.join('')}</g>`;
  }
  const label = MODIFICATION_LABELS[kind];
  const width = Math.max(18, label.length * 6 + 10);
  return `<g class="mm-modification mm-modification--${kind}" transform="translate(${round(at.x)} ${round(at.y)})"><rect x="${-width / 2}" y="-10" width="${width}" height="20" rx="10"/><text y="3.5">${label}</text></g>`;
}

export interface SmallMoleculeOptions { visualSeed: string; label?: string; x?: number; y?: number; scale?: number; ion?: boolean }
export function renderSmallMoleculePrimitive(options: SmallMoleculeOptions): string {
  const x = options.x ?? 0; const y = options.y ?? 0; const scale = options.scale ?? 1;
  const seed = hashString(options.visualSeed);
  const count = options.ion ? 1 : 5 + seed % 5;
  const points = Array.from({ length: count }, (_, index) => ({
    x: x + (index - (count - 1) / 2) * 10 * scale,
    y: y + Math.sin(index * (1.35 + seed % 3 * .2) + seed % 7) * 9 * scale,
    r: (options.ion ? 9 : 4.5 + (seed + index) % 3) * scale,
    atom: ['c', 'n', 'o', 'p'][(seed + index * 3) % 4]!,
  }));
  const bonds = points.slice(1).map((point, index) => `<path d="M${round(points[index]!.x)} ${round(points[index]!.y)}L${round(point.x)} ${round(point.y)}"/>`).join('');
  const atoms = points.map(point => `<circle class="mm-atom mm-atom--${point.atom}" cx="${round(point.x)}" cy="${round(point.y)}" r="${round(point.r)}"/>`).join('');
  return `<g class="mm-primitive mm-primitive--molecule" data-visual-seed="${esc(options.visualSeed)}"><g class="mm-molecule__bonds">${bonds}</g>${atoms}${options.label ? `<text class="mm-molecule__label" x="${round(x)}" y="${round(y - 20 * scale)}">${esc(options.label)}</text>` : ''}</g>`;
}

export interface NucleicAcidOptions {
  kind?: 'dsdna' | 'ssdna' | 'rna' | 'mrna'; state?: DnaVisualState; lesion?: VisualLesion; x?: number; y?: number; width?: number;
  /** Elongating state: requested 5′ start and 3′ end of the nascent strand, as fractions of `width`. */
  nascent?: { start?: number; end?: number };
  /** Elongating state: grow the nascent strand from its 3′ end (5′ fixed). Static under reduced motion. Default true. */
  animate?: boolean;
  /** Elongating state: label 5′/3′ polarity of the template and nascent strands. */
  showDirectionality?: boolean;
}

const HELIX_AMPLITUDE = 13;
const HELIX_SCALE = 25;
const HALF_TURN = Math.PI * HELIX_SCALE;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface NascentStrandGeometry {
  phase: number;
  /** Absolute x where the nascent strand starts growing when animated. */
  growFromX: number;
  /** Attributes for a group that should travel with the 3′ end (class `mm-nucleic__follow`). */
  follow: string;
  fivePrime: { x: number; y: number };
  threePrime: { x: number; y: number };
  templateY(x: number): number;
  nascentY(x: number): number;
}

/**
 * Geometry of a template strand partially copied by a complementary nascent strand. The nascent
 * strand is the template's partner backbone, so it can never cross between backbones. Its 5′ and 3′
 * ends sit at points of maximal strand separation, where no helix crossing can hide them.
 */
export function nascentStrandGeometry(options: NucleicAcidOptions = {}): NascentStrandGeometry {
  const x0 = options.x ?? 0; const y0 = options.y ?? 0; const width = options.width ?? 220;
  const start = clamp(options.nascent?.start ?? .05, 0, .9) * width;
  const requested = Math.round(((options.nascent?.end ?? .7) * width - start) / HALF_TURN);
  const halfTurns = clamp(requested, 1, Math.max(1, Math.floor((width - start) / HALF_TURN)));
  const end = Math.min(width, start + halfTurns * HALF_TURN);
  const phase = Math.PI / 2 - start / HELIX_SCALE;
  const templateY = (x: number) => y0 + Math.sin((x - x0) / HELIX_SCALE + phase) * HELIX_AMPLITUDE;
  const nascentY = (x: number) => 2 * y0 - templateY(x);
  const point = (px: number) => ({ x: round(x0 + px), y: round(nascentY(x0 + px)) });
  const growFromX = round(x0 + start + (end - start) * .35);
  const follow = `class="mm-nucleic__follow" style="--mm-follow-from:${round(growFromX - x0 - end)}px"`;
  return { phase, growFromX, follow, fivePrime: point(start), threePrime: point(end), templateY, nascentY };
}

/** Template + partial nascent strand. Final geometry is static; CSS only reveals it from 5′ to 3′. */
function renderElongatingNucleicAcid(options: NucleicAcidOptions): string {
  const x0 = options.x ?? 0; const y0 = options.y ?? 0; const width = options.width ?? 220;
  const animate = options.animate ?? true;
  const geometry = nascentStrandGeometry(options);
  const { fivePrime, threePrime, templateY, nascentY } = geometry;
  const xs = (from: number, to: number) => {
    const values = [from];
    for (let x = Math.ceil(from / 4) * 4; x < to; x += 4) if (x > from) values.push(x);
    return [...values, to];
  };
  const template = xs(x0, x0 + width).map((x, index) => `${index ? 'L' : 'M'}${round(x)} ${round(templateY(x))}`).join('');
  const nascentXs = xs(fivePrime.x, threePrime.x);
  const nascent = nascentXs.map((x, index) => `${index ? 'L' : 'M'}${round(x)} ${round(nascentY(x))}`).join('');
  // Cumulative arc length of the nascent polyline, so CSS dash fractions map to positions on it.
  const arc = [0];
  for (let index = 1; index < nascentXs.length; index++) {
    const [a, b] = [nascentXs[index - 1]!, nascentXs[index]!];
    arc.push(arc[index - 1]! + Math.hypot(b - a, nascentY(b) - nascentY(a)));
  }
  const total = arc[arc.length - 1]!;
  const fractionAt = (x: number) => {
    const index = Math.max(1, nascentXs.findIndex(value => value >= x));
    const [a, b] = [nascentXs[index - 1]!, nascentXs[index]!];
    return (arc[index - 1]! + (arc[index]! - arc[index - 1]!) * (b > a ? (x - a) / (b - a) : 0)) / total;
  };
  const grownFrom = fractionAt(geometry.growFromX);
  const grow = (className: string, from: number, to: number) => animate
    ? ` class="${`${className} mm-nucleic__grow`.trim()}" style="--mm-grow-from:${Math.round(from * 1000) / 1000};--mm-grow-to:${Math.round(to * 1000) / 1000}"`
    : className ? ` class="${className}"` : '';

  const templateBases: string[] = [];
  const newBases: string[] = [];
  for (let px = 5; px <= width; px += 16) {
    const x = x0 + px;
    if (Math.abs(templateY(x) - y0) < 2.5) continue;
    templateBases.push(`<path d="M${round(x)} ${round(templateY(x))}L${round(x)} ${y0}"/>`);
    if (x < fivePrime.x || x > threePrime.x) continue;
    const at = fractionAt(x);
    // With a 1000/1000 dash, offsets above 1000 hide the base and offsets up to 999 show it fully:
    // the offset falls linearly with the 3′ end's progress, so each base appears as the end reaches it.
    const offset = (progress: number) => 999 + 40 * (at - progress);
    const attributes = at > grownFrom ? grow('', offset(grownFrom), offset(1)) : '';
    newBases.push(`<path${attributes} pathLength="1" stroke-dasharray="1000 1000" stroke-dashoffset="${round(offset(1))}" d="M${round(x)} ${round(nascentY(x))}L${round(x)} ${y0}"/>`);
  }

  const polarity = options.showDirectionality ? (() => {
    const outward = (point: { x: number; y: number }) => point.y + Math.sign(point.y - y0 || -1) * 14 + 3;
    const text = (value: string, x: number, y: number, extra = '') => `<text class="mm-nucleic__polarity${extra}" x="${round(x)}" y="${round(y)}">${value}</text>`;
    return `<g class="mm-nucleic__polarities">`
      + text('3′', x0 - 9, templateY(x0) + 3) + text('5′', x0 + width + 9, templateY(x0 + width) + 3)
      + text('5′', fivePrime.x - 2, outward(fivePrime))
      + text('3′', threePrime.x + 4, outward(threePrime), animate ? ' mm-nucleic__polarity--grow' : '')
      + `</g>`;
  })() : '';

  return `<g class="mm-primitive mm-primitive--nucleic mm-primitive--${options.kind ?? 'dsdna'} mm-primitive--elongating" data-five-prime="${fivePrime.x} ${fivePrime.y}" data-three-prime="${threePrime.x} ${threePrime.y}">`
    + `<g class="mm-nucleic__bases">${templateBases.join('')}</g>`
    + `<g class="mm-nucleic__bases mm-nucleic__bases--new">${newBases.join('')}</g>`
    + `<g class="mm-nucleic__nascent"><path${grow('mm-nucleic__new', 1 - grownFrom, 0)} pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0" d="${nascent}"/></g>`
    + `<path class="mm-nucleic__strand mm-nucleic__strand--template" d="${template}"/>`
    + `<g class="mm-nucleic__nascent"><path${grow('mm-nucleic__terminus', -grownFrom, -.999)} pathLength="1" stroke-dasharray=".001 3" stroke-dashoffset="-.999" d="${nascent}"/></g>`
    + polarity + `</g>`;
}

export function renderNucleicAcidPrimitive(options: NucleicAcidOptions = {}): string {
  if (options.state === 'elongating') return renderElongatingNucleicAcid(options);
  const kind = options.kind ?? 'dsdna'; const x0 = options.x ?? 0; const y0 = options.y ?? 0; const width = options.width ?? 220;
  const single = kind !== 'dsdna' || options.state === 'unwound' || options.state === 'resected';
  const phase = (x: number, offset = 0) => y0 + Math.sin(x / 25 + offset) * 13;
  const gap = options.lesion === 'nick' ? 5 : options.lesion === 'ssb' ? 15 : options.lesion === 'dsb' || options.state === 'cleaved' ? 18 : 0;
  const path = (offset: number, broken: boolean) => {
    const segments: string[] = []; let drawing = false;
    for (let px = 0; px <= width; px += 4) {
      const absent = broken && Math.abs(px - width / 2) < gap;
      if (absent) { drawing = false; continue; }
      segments.push(`${drawing ? 'L' : 'M'}${round(x0 + px)} ${round(phase(px, offset))}`); drawing = true;
    }
    return segments.join('');
  };
  const frontBroken = Boolean(gap); const backBroken = options.lesion === 'dsb' || options.state === 'cleaved';
  const rungs = single ? '' : Array.from({ length: Math.floor(width / 16) }, (_, index) => {
    const px = index * 16 + 5;
    if (Math.abs(px - width / 2) < gap + 4 || options.lesion === 'ap-site' && Math.abs(px - width / 2) < 9) return '';
    const mismatch = options.lesion === 'mismatch' && Math.abs(px - width / 2) < 9;
    return `<path class="${mismatch ? 'mm-nucleic__rung--mismatch' : ''}" d="M${round(x0 + px)} ${round(phase(px))}L${round(x0 + px + (mismatch ? 7 : 0))} ${round(phase(px, Math.PI))}"/>`;
  }).join('');
  const lesion = renderLesionPrimitive(options.lesion, { x: x0 + width / 2, y: y0 }, width);
  const second = single ? '' : `<path class="mm-nucleic__strand mm-nucleic__strand--back" d="${path(Math.PI, backBroken)}"/>`;
  const unwound = options.state === 'unwound' ? `<path class="mm-nucleic__strand mm-nucleic__strand--back" d="M${x0 + width * .48} ${y0}Q${x0 + width * .72} ${y0 - 62} ${x0 + width} ${y0 - 38}"/>` : '';
  return `<g class="mm-primitive mm-primitive--nucleic mm-primitive--${kind} mm-primitive--${options.state ?? 'normal'}">${rungs}${second}<path class="mm-nucleic__strand mm-nucleic__strand--front" d="${path(0, frontBroken)}"/>${unwound}${lesion}</g>`;
}

export function renderLesionPrimitive(lesion: VisualLesion | undefined, at: { x: number; y: number }, width = 220): string {
  if (!lesion || lesion === 'nick' || lesion === 'ssb' || lesion === 'dsb') return '';
  const x = round(at.x); const y = round(at.y);
  switch (lesion) {
    case 'damaged-base': return `<g class="mm-lesion mm-lesion--damaged-base"><path d="M${x - 7} ${y - 8}l14 16m0-16-14 16"/></g>`;
    case 'ap-site': return `<circle class="mm-lesion mm-lesion--ap-site" cx="${x}" cy="${y}" r="7"/>`;
    case 'mismatch': return `<g class="mm-lesion mm-lesion--mismatch"><circle cx="${x - 5}" cy="${y - 7}" r="4"/><circle cx="${x + 7}" cy="${y + 7}" r="4"/></g>`;
    case 'crosslink': return `<path class="mm-lesion mm-lesion--crosslink" d="M${x - 11} ${y - 18}Q${x} ${y} ${x + 11} ${y + 18}M${x + 11} ${y - 18}Q${x} ${y} ${x - 11} ${y + 18}"/>`;
    case 'adduct': return `<g class="mm-lesion mm-lesion--adduct"><circle cx="${x}" cy="${y - 4}" r="6"/><circle cx="${x + 9}" cy="${y - 13}" r="5"/><circle cx="${x - 8}" cy="${y - 15}" r="4"/></g>`;
    default: return `<path class="mm-lesion" d="M${x - width * .03} ${y}h${width * .06}"/>`;
  }
}

export interface MembranePoint { x: number; y: number }
/**
 * An arbitrary bilayer centreline. `ellipse` and closed `path`s give the bilayer an inside and an
 * outside; path `points` are joined in order and smoothed (Catmull-Rom) unless `smooth` is false.
 */
export type MembraneShape =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'path'; points: readonly MembranePoint[]; closed?: boolean; smooth?: boolean };
export interface MembraneOptions {
  x?: number; y?: number; length?: number; orientation?: 'horizontal' | 'vertical' | 'curved';
  /** Draws the bilayer along this centreline instead of `x`/`y`/`length`/`orientation`. */
  shape?: MembraneShape;
  /** Distance between neighbouring polar heads along a leaflet. Defaults to 9. */
  spacing?: number;
}
/** One lipid: polar head centre, unit normal pointing away from the hydrophobic core, and its two tails. */
export interface MembraneLipid { head: MembranePoint; normal: MembranePoint; tails: readonly (readonly [MembranePoint, MembranePoint])[] }
/**
 * `outer` faces the outside of a closed shape. On open membranes it is the leaflet on the left of the
 * direction of travel: the top of a horizontal or curved membrane, the right of a vertical one.
 */
export interface MembraneLeaflet { name: 'outer' | 'inner'; lipids: readonly MembraneLipid[] }
export interface MembraneGeometry {
  closed: boolean;
  /** Polyline of the bilayer midplane, the centre of the hydrophobic core. Closed shapes run clockwise. */
  centerline: readonly MembranePoint[];
  leaflets: readonly [MembraneLeaflet, MembraneLeaflet];
  headRadius: number;
  /** Distance from the midplane to each head centre. */
  halfThickness: number;
}

const MEMBRANE_HEAD_RADIUS = 4;
const MEMBRANE_HALF_THICKNESS = 11.5;
/** Gap left between the tails of opposite leaflets at the midplane. */
const MEMBRANE_MIDPLANE_GAP = 1.2;

function membraneCenterline(options: MembraneOptions): { points: MembranePoint[]; closed: boolean } {
  const densify = (points: readonly MembranePoint[], closed: boolean) => {
    const out: MembranePoint[] = [];
    const count = closed ? points.length : points.length - 1;
    for (let i = 0; i < count; i++) {
      const a = points[i]!; const b = points[(i + 1) % points.length]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
      for (let s = 0; s < steps; s++) out.push({ x: a.x + (b.x - a.x) * s / steps, y: a.y + (b.y - a.y) * s / steps });
    }
    if (!closed) out.push(points[points.length - 1]!);
    return out;
  };
  const shape = options.shape;
  if (shape?.kind === 'ellipse') {
    const steps = Math.max(48, Math.ceil(Math.PI * (shape.rx + shape.ry) / 2));
    return { closed: true, points: Array.from({ length: steps }, (_, i) => { const a = i / steps * Math.PI * 2; return { x: shape.cx + shape.rx * Math.cos(a), y: shape.cy + shape.ry * Math.sin(a) }; }) };
  }
  if (shape?.kind === 'path') {
    const closed = shape.closed ?? false; const source = shape.points;
    if (source.length < 2) throw new Error('A membrane path needs at least two points');
    if (shape.smooth === false || source.length < 3) return { closed, points: densify(source, closed) };
    const at = (i: number) => closed ? source[(i + source.length) % source.length]! : source[Math.min(source.length - 1, Math.max(0, i))]!;
    const smooth: MembranePoint[] = [];
    for (let i = 0; i < (closed ? source.length : source.length - 1); i++) {
      const p0 = at(i - 1); const p1 = at(i); const p2 = at(i + 1); const p3 = at(i + 2);
      for (let s = 0; s < 8; s++) {
        const t = s / 8; const t2 = t * t; const t3 = t2 * t;
        const f = (a: number, b: number, c: number, d: number) => .5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
        smooth.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
      }
    }
    if (!closed) smooth.push(source[source.length - 1]!);
    return { closed, points: densify(smooth, closed) };
  }
  const x = options.x ?? 0; const y = options.y ?? 0; const length = options.length ?? 240; const orientation = options.orientation ?? 'horizontal';
  const steps = Math.max(2, Math.ceil(length / 2));
  return {
    closed: false,
    points: Array.from({ length: steps + 1 }, (_, i) => {
      const along = length * i / steps;
      if (orientation === 'vertical') return { x, y: y + along };
      return { x: x + along, y: orientation === 'curved' ? y - Math.sin(along / length * Math.PI) * 18 : y };
    }),
  };
}

/**
 * Deterministic lipid-bilayer geometry: two leaflets whose polar heads face away from a shared
 * hydrophobic core. Each leaflet is spaced along its own offset curve, so the concave side of a curved
 * or closed membrane packs fewer lipids, and a closed shape wraps with uniform spacing (no seam).
 */
export function membraneGeometry(options: MembraneOptions = {}): MembraneGeometry {
  const spacing = Math.max(4, options.spacing ?? 9);
  const centerline = membraneCenterline(options); const closed = centerline.closed; let points = centerline.points;
  if (closed) {
    // Clockwise on screen (positive shoelace with y down) makes the left-hand normal point outwards.
    const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]!; return sum + p.x * q.y - q.x * p.y; }, 0);
    if (area < 0) points = [...points].reverse();
  }
  const n = points.length;
  const normals = points.map((_, i) => {
    const prev = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!; const next = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
    const tx = next.x - prev.x; const ty = next.y - prev.y; const len = Math.hypot(tx, ty) || 1;
    return { x: ty / len, y: -tx / len };
  });
  const h = MEMBRANE_HALF_THICKNESS; const r = MEMBRANE_HEAD_RADIUS;
  const leaflet = (name: 'outer' | 'inner'): MembraneLeaflet => {
    const side = name === 'outer' ? 1 : -1;
    const curve = points.map((p, i) => ({ x: p.x + normals[i]!.x * h * side, y: p.y + normals[i]!.y * h * side }));
    const segments = closed ? n : n - 1;
    const cumulative = [0];
    for (let i = 0; i < segments; i++) { const a = curve[i]!; const b = curve[(i + 1) % n]!; cumulative.push(cumulative[i]! + Math.hypot(b.x - a.x, b.y - a.y)); }
    const length = cumulative[segments]!;
    const count = closed ? Math.max(3, Math.round(length / spacing)) : Math.max(1, Math.floor(length / spacing));
    // Closed: spread evenly over the whole loop. Open: keep the nominal spacing and centre the row.
    const pitch = closed ? length / count : spacing; const start = closed ? pitch / 2 : (length - (count - 1) * spacing) / 2;
    const lipids: MembraneLipid[] = []; let segment = 0;
    for (let k = 0; k < count; k++) {
      const target = start + k * pitch;
      while (segment < segments - 1 && cumulative[segment + 1]! < target) segment++;
      const t = (target - cumulative[segment]!) / ((cumulative[segment + 1]! - cumulative[segment]!) || 1);
      const a = curve[segment]!; const b = curve[(segment + 1) % n]!; const na = normals[segment]!; const nb = normals[(segment + 1) % n]!;
      const nx = na.x + (nb.x - na.x) * t; const ny = na.y + (nb.y - na.y) * t; const nl = Math.hypot(nx, ny) || 1;
      const normal = { x: Math.round(nx / nl * side * 1000) / 1000, y: Math.round(ny / nl * side * 1000) / 1000 };
      const head = { x: round(a.x + (b.x - a.x) * t), y: round(a.y + (b.y - a.y) * t) };
      // Two acyl chains per lipid, from under the head towards (never across) the midplane.
      const tails = [-1.5, 1.5].map(offset => [
        { x: round(head.x - normal.x * (r - .5) - normal.y * offset), y: round(head.y - normal.y * (r - .5) + normal.x * offset) },
        { x: round(head.x - normal.x * (h - MEMBRANE_MIDPLANE_GAP) - normal.y * offset * .7), y: round(head.y - normal.y * (h - MEMBRANE_MIDPLANE_GAP) + normal.x * offset * .7) },
      ] as const);
      lipids.push({ head, normal, tails });
    }
    return { name, lipids };
  };
  return { closed, centerline: points.map(p => ({ x: round(p.x), y: round(p.y) })), leaflets: [leaflet('outer'), leaflet('inner')], headRadius: r, halfThickness: h };
}

/** Shortens an open midplane so the hydrophobic core ends flush with the outermost heads. */
function trimMembraneCore(geometry: MembraneGeometry): MembranePoint[] {
  const ends = geometry.leaflets.flatMap(leaflet => [leaflet.lipids[0], leaflet.lipids[leaflet.lipids.length - 1]]).filter((lipid): lipid is MembraneLipid => !!lipid);
  const line = geometry.centerline; const reach = Math.hypot(geometry.halfThickness, geometry.headRadius) + .5;
  // Keep midplane points that lie within the lipid span: close enough to some head along the line.
  const nearest = (point: MembranePoint) => Math.min(...ends.map(({ head }) => Math.hypot(head.x - point.x, head.y - point.y)));
  const first = line.findIndex(point => nearest(point) <= reach);
  let last = line.length - 1; while (last > first && nearest(line[last]!) > reach) last--;
  return line.slice(Math.max(0, first), last + 1);
}

/**
 * Lipid bilayer: a hydrophobic core band, two rows of tails and two rows of polar heads facing outwards.
 * Every layer is a single path, so the markup stays small however long the membrane is.
 */
export function renderMembranePrimitive(options: MembraneOptions = {}): string {
  const geometry = membraneGeometry(options); const r = geometry.headRadius;
  const variant = options.shape ? (geometry.closed ? 'closed' : 'path') : options.orientation ?? 'horizontal';
  const core = `M${(geometry.closed ? geometry.centerline : trimMembraneCore(geometry)).map(p => `${p.x} ${p.y}`).join('L')}${geometry.closed ? 'Z' : ''}`;
  const leaflets = geometry.leaflets.map(({ name, lipids }) => {
    const tails = lipids.flatMap(lipid => lipid.tails.map(([a, b]) => `M${a.x} ${a.y}L${b.x} ${b.y}`)).join('');
    const heads = lipids.map(({ head }) => `M${round(head.x - r)} ${head.y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`).join('');
    return `<g class="mm-membrane__leaflet mm-membrane__leaflet--${name}" data-heads="${lipids.length}"><path class="mm-membrane__tails" d="${tails}"/><path class="mm-membrane__heads" d="${heads}"/></g>`;
  }).join('');
  return `<g class="mm-primitive mm-primitive--membrane mm-membrane--${variant}"><path class="mm-membrane__core" d="${core}" stroke-width="${round((geometry.halfThickness - r) * 2 + 2)}"/>${leaflets}</g>`;
}

export function renderCompartmentPrimitive(kind: 'extracellular' | 'cytoplasm' | 'nucleus' | 'organelle' | 'er' | 'golgi' | 'mitochondrion' | 'lysosome' | 'endosome', at = { x: 0, y: 0 }): string {
  if (kind === 'extracellular' || kind === 'cytoplasm') return `<g class="mm-primitive mm-compartment mm-compartment--${kind}">${Array.from({ length: 12 }, (_, i) => `<ellipse cx="${at.x + (i * 37) % 180}" cy="${at.y + (i * 23) % 80}" rx="${5 + i % 3 * 2}" ry="${3 + i % 2}"/>`).join('')}</g>`;
  if (kind === 'er' || kind === 'golgi') return `<g class="mm-primitive mm-compartment mm-compartment--${kind}">${Array.from({ length: 5 }, (_, i) => `<path d="M${at.x + 10 + i * 7} ${at.y + 12 + i * 14}C${at.x + 50} ${at.y + i * 14} ${at.x + 130} ${at.y + 28 + i * 10} ${at.x + 180 - i * 8} ${at.y + 12 + i * 14}"/>`).join('')}</g>`;
  const inner = kind === 'mitochondrion' ? `<path d="M${at.x + 25} ${at.y + 48}c22-36 42 36 66 0s42 36 68 0"/>` : '';
  return `<g class="mm-primitive mm-compartment mm-compartment--${kind}"><ellipse cx="${at.x + 95}" cy="${at.y + 48}" rx="88" ry="44"/>${inner}</g>`;
}

export type ContactSide = 'left' | 'right' | 'top' | 'bottom';
const OPPOSITE_SIDE: Record<ContactSide, ContactSide> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
const SIDE_NORMAL: Record<ContactSide, ProteinPoint> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

/**
 * Where to put a partner so that it touches an anchor shape: returns the translation of the
 * partner's local origin, relative to the anchor shape's local origin, that brings
 * `partner[opposite(side)]` onto `anchor[side]`, pressed `overlap` px further along the contact
 * normal so the two outlines merge instead of leaving a hairline gap. Pure visual geometry built
 * on contact anchors (never on bounding radii), with no biological meaning; it composes, e.g.
 * B relative to A, then C relative to B, for chains and assemblies.
 */
export function contactOffset(anchor: ProteinAnchors, partner: ProteinAnchors, side: ContactSide = 'right', overlap = 1.5): ProteinPoint {
  const from = anchor[side]; const to = partner[OPPOSITE_SIDE[side]]; const normal = SIDE_NORMAL[side];
  return { x: round(from.x - to.x - normal.x * overlap), y: round(from.y - to.y - normal.y * overlap) };
}

/**
 * How two or more actors are related, which decides how (and whether) a link is drawn:
 * - `relation` (default): a dotted link, for associations that are not physical contact;
 * - `directed`: the same dotted link with an arrowhead on the last point (A ·····→ B), e.g. recruitment;
 * - `contact`: the actors physically touch (place them with `contactOffset`). No line is drawn,
 *   because a line must never stand in for molecular contact; only a soft contact shadow is
 *   painted at the midpoint of each pair of facing anchors. Render it *before* the actors so it
 *   only shows in the crevice between the touching surfaces.
 */
export type InteractionKind = 'relation' | 'directed' | 'contact';
export interface InteractionOptions { kind?: InteractionKind }

export function renderInteractionPrimitive(points: readonly { id: string; x: number; y: number }[], options: InteractionOptions = {}): string {
  if (points.length < 2) return '';
  const kind = options.kind ?? 'relation';
  const pairs = points.slice(1).map((point, index) => [points[index]!, point] as const);
  const id = (a: { id: string }, b: { id: string }) => `${esc(a.id)}:${esc(b.id)}`;
  if (kind === 'contact') {
    const shadows = pairs.map(([a, b]) => `<ellipse class="mm-interaction__contact" data-interaction="${id(a, b)}" cx="${round((a.x + b.x) / 2)}" cy="${round((a.y + b.y) / 2)}" rx="7" ry="7"/>`).join('');
    return `<g class="mm-primitive mm-primitive--interaction mm-interaction--contact" aria-hidden="true">${shadows}</g>`;
  }
  const links = pairs.map(([a, b]) => `<path data-interaction="${id(a, b)}" d="M${a.x} ${a.y}L${b.x} ${b.y}"/>`).join('');
  if (kind === 'relation') return `<g class="mm-primitive mm-primitive--interaction">${links}</g>`;
  const [tail, tip] = pairs[pairs.length - 1]!;
  const angle = Math.atan2(tip.y - tail.y, tip.x - tail.x);
  const wing = (turn: number) => `${round(tip.x - Math.cos(angle + turn) * 7)} ${round(tip.y - Math.sin(angle + turn) * 7)}`;
  const head = `<path class="mm-interaction__head" d="M${wing(-.55)}L${round(tip.x)} ${round(tip.y)}L${wing(.55)}"/>`;
  return `<g class="mm-primitive mm-primitive--interaction mm-interaction--directed">${links}${head}</g>`;
}

export function renderActionVisual(kind: ActionVisualKind, from: { x: number; y: number }, to: { x: number; y: number }): string {
  const path = `M${from.x} ${from.y}Q${round((from.x + to.x) / 2)} ${round(Math.min(from.y, to.y) - 16)} ${to.x} ${to.y}`;
  if (kind === 'inhibit') return `<g class="mm-action mm-action--inhibit"><path d="${path}"/><path d="M${to.x - 7} ${to.y - 7}l14 14m0-14-14 14"/></g>`;
  if (kind === 'cleave') return `<g class="mm-action mm-action--cleave"><path d="${path}"/><path d="m${to.x - 7} ${to.y - 8} 14 16m0-16-14 16"/></g>`;
  return `<g class="mm-action mm-action--${kind}"><path d="${path}"/><path d="M${to.x - 8} ${to.y - 5}L${to.x} ${to.y}l-8 5"/></g>`;
}

/** A globular domain carried at one end of a membrane-spanning chain. */
export interface TransmembraneDomain { radius: number }
export interface TransmembraneOptions {
  visualSeed: string;
  /** The membrane the chain crosses; only its geometry is read, the bilayer itself is not drawn. */
  membrane: MembraneOptions;
  /** Arc-length position along the membrane midplane, in px from its start. Defaults to the middle. */
  along?: number;
  /** Number of times the chain crosses the bilayer. Defaults to 1. */
  passes?: number;
  /** Splits the passes into two walls around an open, aqueous pore that spans the bilayer. */
  pore?: boolean;
  /** Centre-to-centre distance between neighbouring passes. Defaults to 16. */
  spacing?: number;
  /** Clear width of the pore. Defaults to 14. */
  poreWidth?: number;
  fill?: string;
  /** Presentation state, applied as the shared `mm-primitive--<state>` class (no halo). */
  state?: ProteinVisualState;
  /** Mirrors the unit along the membrane (same silhouette, facing the other way), e.g. for symmetric pairs. */
  mirror?: boolean;
  /** Globular domain on the outer side, joined to the outer end of the first pass. Ignored with `pore`. */
  outside?: TransmembraneDomain;
  /** Globular domain on the inner side, joined to the inner end of the last pass. Ignored with `pore`. */
  inside?: TransmembraneDomain;
  /**
   * Markers attached to the domain (or the chain end) on one side of the membrane. `angle` (radians in the
   * membrane frame: 0 along the membrane, π/2 inwards) overrides the default fan facing away from it.
   */
  modifications?: readonly { kind: ModificationVisualKind; side: 'outside' | 'inside'; angle?: number; length?: number; branched?: boolean }[];
}
/** A segment crossing the bilayer, from its outer end to its inner end (screen coordinates). */
export interface TransmembraneSpan { outside: MembranePoint; inside: MembranePoint }
export interface TransmembraneGeometry {
  /** Point on the midplane where the unit sits, the tangent along the membrane and the normal pointing inwards. */
  origin: MembranePoint; tangent: MembranePoint; normal: MembranePoint;
  /** Distance from the midplane to each end of a span; always beyond the polar heads of both leaflets. */
  reach: number;
  spans: readonly TransmembraneSpan[];
  /** Axis of the pore, outer mouth to inner mouth, and its clear width (screen coordinates). */
  pore?: { outside: MembranePoint; inside: MembranePoint; width: number };
  /**
   * Contact anchors of the domains in screen coordinates. Sides follow the membrane frame: `top` faces
   * outwards and `bottom` inwards, so a partner on the outer side binds `outsideAnchors.top`.
   */
  outsideAnchors?: ProteinAnchors; insideAnchors?: ProteinAnchors;
  /** Surface particles in the local frame (x along the membrane, y inwards). */
  particles: readonly ProteinSphere[];
  /** Local attachment centre and radius for markers on each side. */
  attach: Record<'outside' | 'inside', { point: MembranePoint; radius: number }>;
}

const TM_SPAN_RADIUS = 5;
const TM_LOOP_RADIUS = 2.6;
const TM_LOOP_DEPTH = 9;
/** A domain hanging off a chain end is a globule: its seed picks among the globular families only. */
const TM_DOMAIN_MORPHOLOGIES: readonly ProteinMorphology[] = ['compact', 'bilobed', 'multidomain'];

/**
 * Geometry of a chain that crosses a membrane `passes` times: straight spans through the bilayer,
 * thin loops alternating on both sides, optional globular domains (shaped by `visualSeed`) at its
 * ends and an optional pore. Built in the membrane's local frame from `membraneGeometry`, so spans
 * always reach past both leaflets. Pure function of the options, with no biological meaning.
 */
export function transmembraneGeometry(options: TransmembraneOptions): TransmembraneGeometry {
  const membrane = membraneGeometry(options.membrane); const line = membrane.centerline;
  const passes = Math.max(1, Math.round(options.passes ?? 1)); const spacing = options.spacing ?? 16;
  const pore = !!options.pore && passes >= 2; const poreWidth = options.poreWidth ?? 14;
  // Locate the unit on the midplane by arc length.
  const lengths = [0];
  for (let i = 1; i < line.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y));
  const total = lengths[lengths.length - 1]!; const along = clamp(options.along ?? total / 2, 0, total);
  let index = 1; while (index < line.length - 1 && lengths[index]! < along) index++;
  const a = line[index - 1]!; const b = line[index]!; const t = (along - lengths[index - 1]!) / ((lengths[index]! - lengths[index - 1]!) || 1);
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const tangent = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  // The outer leaflet lies on the left of travel (see membraneGeometry), so inwards is the right-hand normal.
  const normal = { x: -tangent.y, y: tangent.x };
  const origin = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  // A mirrored unit is built as usual and flipped along the membrane: same silhouette, facing the other way.
  const flip = options.mirror ? -1 : 1;
  const screen = (p: MembranePoint) => ({ x: round(origin.x + tangent.x * p.x * flip + normal.x * p.y), y: round(origin.y + tangent.y * p.x * flip + normal.y * p.y) });
  const reach = membrane.halfThickness + membrane.headRadius + 4;

  const particles: ProteinSphere[] = []; let lobe = 0;
  const tube = (points: readonly MembranePoint[], r: number) => {
    const domain = lobe++;
    for (const p of points) particles.push({ x: round(p.x), y: round(p.y), rx: r, ry: r, r, rotation: 0, depth: .5, domain });
  };
  const bezier = (p0: MembranePoint, p1: MembranePoint, p2: MembranePoint, p3: MembranePoint, steps: number) => Array.from({ length: steps + 1 }, (_, i) => {
    const s = i / steps; const u = 1 - s;
    return { x: u * u * u * p0.x + 3 * u * u * s * p1.x + 3 * u * s * s * p2.x + s * s * s * p3.x, y: u * u * u * p0.y + 3 * u * u * s * p1.y + 3 * u * s * s * p2.y + s * s * s * p3.y };
  });
  /** A short free terminus leaving a span end and curling towards `direction` along the membrane. */
  const tail = (x: number, y: number, direction: number) => {
    const sign = Math.sign(y);
    tube(bezier({ x, y }, { x, y: y + sign * 8 }, { x: x + direction * 6, y: y + sign * 10 }, { x: x + direction * 12, y: y + sign * 14 }, 8), TM_LOOP_RADIUS);
  };
  const spans: number[] = [];
  /** One chain entering from the outer side at xs[0] and crossing at each x in turn; returns its two ends. */
  const chain = (xs: readonly number[], firstTail?: number, lastTail?: number) => {
    xs.forEach((x, i) => {
      const from = i % 2 === 0 ? -reach : reach;
      if (i > 0) {
        const previous = xs[i - 1]!; const bulge = Math.sign(from) * TM_LOOP_DEPTH * 1.33;
        tube(bezier({ x: previous, y: from }, { x: previous, y: from + bulge }, { x, y: from + bulge }, { x, y: from }, 14), TM_LOOP_RADIUS);
      }
      const steps = Math.ceil(2 * (reach - TM_SPAN_RADIUS) / 3);
      tube(Array.from({ length: steps + 1 }, (_, k) => ({ x, y: -Math.sign(from) * (k * 2 * (reach - TM_SPAN_RADIUS) / steps - (reach - TM_SPAN_RADIUS)) })), TM_SPAN_RADIUS);
      spans.push(x);
    });
    const end = { x: xs[xs.length - 1]!, y: xs.length % 2 === 1 ? reach : -reach };
    if (firstTail !== undefined) tail(xs[0]!, -reach, firstTail);
    if (lastTail !== undefined) tail(end.x, end.y, lastTail);
    return { first: { x: xs[0]!, y: -reach }, last: end };
  };

  let outsideAnchors: ProteinAnchors | undefined; let insideAnchors: ProteinAnchors | undefined;
  const attach: TransmembraneGeometry['attach'] = { outside: { point: { x: 0, y: -reach }, radius: 6 }, inside: { point: { x: 0, y: reach }, radius: 6 } };
  if (pore) {
    // Two walls flank the pore; each is its own chain entering at the wall's far side, with free ends
    // curling away from the pore so its mouths stay clear.
    const left = Math.ceil(passes / 2); const right = passes - left; const inner = poreWidth / 2 + TM_SPAN_RADIUS;
    chain(Array.from({ length: left }, (_, i) => -(inner + (left - 1 - i) * spacing)), -1, -1);
    chain(Array.from({ length: right }, (_, i) => inner + (right - 1 - i) * spacing), 1, 1);
  } else {
    const xs = Array.from({ length: passes }, (_, i) => (i - (passes - 1) / 2) * spacing);
    const endsInside = passes % 2 === 1;
    const { first, last } = chain(xs, options.outside ? undefined : -1, options.inside && endsInside ? undefined : 1);
    // Domains join the chain ends anchor-to-anchor, pressed in slightly so the outlines merge.
    const domain = (side: 'outside' | 'inside', spec: TransmembraneDomain, end: MembranePoint): ProteinAnchors => {
      const seed = `${options.visualSeed}::${side}`;
      const shape = proteinGeometry(seed, spec.radius, 28, TM_DOMAIN_MORPHOLOGIES[hashString(`${seed}::morphology`) % TM_DOMAIN_MORPHOLOGIES.length]);
      const local = proteinAnchors(shape, spec.radius);
      const joint = side === 'outside' ? local.bottom : local.top;
      const dx = end.x - joint.x; const dy = end.y - joint.y + (side === 'outside' ? 3 : -3);
      const base = lobe;
      for (const p of shape) particles.push({ ...p, x: p.x + dx, y: p.y + dy, domain: base + (p.domain ?? 0) });
      lobe = base + Math.max(...shape.map(p => p.domain ?? 0)) + 1;
      attach[side] = { point: { x: local.center.x + dx, y: local.center.y + dy }, radius: spec.radius };
      const move = (p: ProteinPoint) => screen({ x: p.x + dx, y: p.y + dy });
      const c0 = move({ x: local.bounds.x, y: local.bounds.y }); const c1 = move({ x: local.bounds.x + local.bounds.width, y: local.bounds.y + local.bounds.height });
      return {
        center: move(local.center), left: move(flip === 1 ? local.left : local.right), right: move(flip === 1 ? local.right : local.left), top: move(local.top), bottom: move(local.bottom),
        bounds: { x: Math.min(c0.x, c1.x), y: Math.min(c0.y, c1.y), width: round(Math.abs(c1.x - c0.x)), height: round(Math.abs(c1.y - c0.y)) },
      };
    };
    if (options.outside) outsideAnchors = domain('outside', options.outside, first);
    else attach.outside.point = first;
    const innerEnd = { x: endsInside ? last.x : xs[xs.length - 1]!, y: reach };
    if (options.inside) insideAnchors = domain('inside', options.inside, innerEnd);
    else attach.inside.point = innerEnd;
  }
  return {
    origin: { x: round(origin.x), y: round(origin.y) }, tangent, normal, reach,
    spans: spans.map(x => ({ outside: screen({ x, y: -reach }), inside: screen({ x, y: reach }) })),
    pore: pore ? { outside: screen({ x: 0, y: -reach }), inside: screen({ x: 0, y: reach }), width: poreWidth } : undefined,
    outsideAnchors, insideAnchors,
    particles: flip === 1 ? particles : particles.map(p => ({ ...p, x: -p.x, rotation: -p.rotation })),
    attach: flip === 1 ? attach : {
      outside: { ...attach.outside, point: { x: -attach.outside.point.x, y: attach.outside.point.y } },
      inside: { ...attach.inside, point: { x: -attach.inside.point.x, y: attach.inside.point.y } },
    },
  };
}

/**
 * A protein chain spanning a membrane (see `transmembraneGeometry`), drawn with the shared protein
 * surface so spans, loops and domains read as one continuous volume. Compose it over
 * `renderMembranePrimitive` with the same membrane options. `data-spans` and `data-pore` expose the
 * crossing geometry in screen coordinates; `data-outside`/`data-inside` the domain anchors
 * (left, right, top, bottom).
 */
export function renderTransmembranePrimitive(options: TransmembraneOptions): string {
  const geometry = transmembraneGeometry(options);
  const fill = options.fill ?? 'var(--mm-protein,#7d78d8)'; const state = options.state ?? 'normal';
  const { origin, tangent, normal, reach } = geometry;
  const unit = (value: number) => Math.round(value * 1000) / 1000;
  const transform = tangent.x === 1 && tangent.y === 0 ? `translate(${origin.x} ${origin.y})` : `matrix(${unit(tangent.x)} ${unit(tangent.y)} ${unit(normal.x)} ${unit(normal.y)} ${origin.x} ${origin.y})`;
  const pore = geometry.pore ? `<rect class="mm-transmembrane__pore" x="${round(-geometry.pore.width / 2 - 1)}" y="${round(-reach)}" width="${round(geometry.pore.width + 2)}" height="${round(reach * 2)}"/>` : '';
  const counts = { outside: 0, inside: 0 };
  const slots = (options.modifications ?? []).map(modification => ({ modification, slot: counts[modification.side]++ }));
  const markers = slots.map(({ modification, slot }) => {
    const { point, radius } = geometry.attach[modification.side]; const count = counts[modification.side];
    const fan = modification.angle ?? ((modification.side === 'inside' ? Math.PI / 2 : -Math.PI / 2) + (slot - (count - 1) / 2) * 1.5);
    const angle = options.mirror ? Math.PI - fan : fan;
    return renderModificationPrimitive(modification, { x: point.x + Math.cos(angle) * radius * .92, y: point.y + Math.sin(angle) * radius * .92 });
  }).join('');
  const pair = (p: MembranePoint) => `${p.x} ${p.y}`;
  const anchors = (name: string, a?: ProteinAnchors) => a ? ` data-${name}="${[a.left, a.right, a.top, a.bottom].map(pair).join(' ')}"` : '';
  return `<g class="mm-primitive mm-primitive--transmembrane mm-primitive--${state}" data-visual-seed="${esc(options.visualSeed)}" data-passes="${geometry.spans.length}"`
    + ` data-spans="${geometry.spans.map(span => `${pair(span.outside)} ${pair(span.inside)}`).join(';')}"`
    + (geometry.pore ? ` data-pore="${pair(geometry.pore.outside)} ${pair(geometry.pore.inside)} ${geometry.pore.width}"` : '')
    + `${anchors('outside', geometry.outsideAnchors)}${anchors('inside', geometry.insideAnchors)} style="--mm-protein:${esc(fill)}">`
    + `<g transform="${transform}">${pore}${renderProteinSurface(geometry.particles, fill, Math.max(options.outside?.radius ?? 0, options.inside?.radius ?? 0, 20))}${markers}</g></g>`;
}

// One CSS constant per primitive, so independent changes to different primitives do not collide.

/** Protein surfaces, states, halo and inhibition. */
export const proteinCss = `.mm-primitive .mm-surface{filter:drop-shadow(0 4px 4px #17213b24)}
.mm-primitive--inactive{opacity:.48;filter:saturate(.45)}.mm-primitive--future{opacity:.26;filter:blur(2.2px);pointer-events:none}.mm-primitive--degraded{opacity:.55}.mm-primitive__halo{fill:var(--mm-protein);opacity:.16;animation:mm-primitive-breathe 3s ease-in-out infinite}.mm-primitive--selected .mm-primitive__halo{stroke:var(--mm-accent,#2563eb);stroke-width:2}
.mm-primitive__inhibition circle{fill:none;stroke:var(--mm-alert,#e5484d);stroke-width:3}.mm-primitive__inhibition path{stroke:var(--mm-alert,#e5484d);stroke-width:4;stroke-linecap:round}`;

/** Post-translational modification markers and chains. */
export const modificationCss = `.mm-modification rect{fill:#fff;stroke:#334155;stroke-width:1}.mm-modification text{text-anchor:middle;fill:#17213b;font:700 9px Inter,system-ui}.mm-modification--phosphorylation rect,.mm-modification--acetylation rect{fill:#f7c85c}.mm-modification--methylation rect{fill:#e9829b}.mm-modification--sumoylation rect{fill:#82b7e8}.mm-modification--glycosylation rect{fill:#ec8bad}.mm-modification--chain path{fill:none;stroke:#c354bd;stroke-width:2}.mm-modification--chain circle{fill:#ce65c6;stroke:#fff;stroke-width:1}`;

/** Small molecules. */
export const moleculeCss = `.mm-molecule__bonds{fill:none;stroke:#718096;stroke-width:3;stroke-linecap:round}.mm-atom{stroke:#fff;stroke-width:1}.mm-atom--c{fill:#9aa7bb}.mm-atom--n{fill:#4f84d4}.mm-atom--o{fill:#e75d67}.mm-atom--p{fill:#eaaa38}.mm-molecule__label{text-anchor:middle;fill:currentColor;font:600 10px Inter,system-ui}`;

/** Nucleic acids, including the elongating strand. */
export const nucleicCss = `.mm-primitive--nucleic path{fill:none;stroke-linecap:round;stroke-linejoin:round}.mm-nucleic__strand{stroke:#477fd8;stroke-width:7}.mm-nucleic__strand--back{stroke:#9bb5e3;stroke-width:6}.mm-primitive--nucleic>path:not(.mm-nucleic__strand):not(.mm-nucleic__new){stroke:#819ed7;stroke-width:2.8}.mm-nucleic__new{stroke:#ed6680;stroke-width:5}.mm-nucleic__terminus{stroke:#e04b67;stroke-width:11}.mm-nucleic__bases path{stroke:#819ed7;stroke-width:2.8}.mm-nucleic__bases--new path{stroke:#f09aac}
.mm-nucleic__polarity{fill:currentColor;font:700 10px Inter,system-ui;text-anchor:middle}.mm-nucleic__grow{animation:mm-nucleic-grow 6s cubic-bezier(.45,0,.35,1) infinite}.mm-nucleic__polarity--grow{animation:mm-nucleic-reveal 6s linear infinite}.mm-nucleic__follow{animation:mm-nucleic-follow 6s cubic-bezier(.45,0,.35,1) infinite}.mm-nucleic__rung--mismatch{stroke:#e5484d!important;stroke-width:4!important}`;

/** DNA lesions. */
export const lesionCss = `.mm-lesion{stroke:#e5484d;stroke-width:3;fill:none}.mm-lesion--ap-site{fill:#fff}.mm-lesion--mismatch circle,.mm-lesion--adduct circle{fill:#e5484d;stroke:#fff;stroke-width:1}.mm-lesion--crosslink{stroke-width:4}`;

/** Lipid membranes. */
export const membraneCss = `.mm-primitive--membrane{--mm-membrane-head:#e58f78;--mm-membrane-head-edge:#b4614f;--mm-membrane-tail:#c58c63;--mm-membrane-core:#f6d9a8}.mm-primitive--membrane path{stroke-linecap:round;stroke-linejoin:round}.mm-primitive--membrane .mm-membrane__core{fill:none;stroke-linecap:butt;stroke:var(--mm-membrane-core);stroke-opacity:.6}.mm-membrane__tails{fill:none;stroke:var(--mm-membrane-tail);stroke-width:1.2}.mm-membrane__heads{fill:var(--mm-membrane-head);stroke:var(--mm-membrane-head-edge);stroke-width:.9}
:root[data-theme=dark] .mm-primitive--membrane,.mm-theme-dark .mm-primitive--membrane{--mm-membrane-head:#e4927c;--mm-membrane-head-edge:#8a4a3d;--mm-membrane-tail:#cfa07a;--mm-membrane-core:#6a5038}@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .mm-primitive--membrane{--mm-membrane-head:#e4927c;--mm-membrane-head-edge:#8a4a3d;--mm-membrane-tail:#cfa07a;--mm-membrane-core:#6a5038}}`;

/** Compartments and organelles. */
export const compartmentCss = `.mm-compartment{fill:#8aa7d5;opacity:.72}.mm-compartment path{fill:none;stroke:#5d86cc;stroke-width:6;stroke-linecap:round}.mm-compartment--mitochondrion{fill:#e57443}.mm-compartment--mitochondrion path{stroke:#fff}.mm-compartment--lysosome{fill:#8268bd}.mm-compartment--endosome{fill:#5b8fd8}`;

/** Interactions between actors. */
export const interactionCss = `.mm-primitive--interaction path{fill:none;stroke:#64748b;stroke-width:2;stroke-dasharray:3 3}.mm-primitive--interaction .mm-interaction__head{stroke-dasharray:none;stroke-linecap:round;stroke-linejoin:round}.mm-interaction__contact{fill:#17213b;opacity:.3;filter:blur(2.5px)}`;

/** Action arrows. */
export const actionCss = `.mm-action{color:var(--mm-action,currentColor)}.mm-action path{fill:none;stroke:currentColor;stroke-opacity:.82;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.mm-action--inhibit path{stroke:#e5484d;stroke-opacity:1}.mm-action--cleave path:last-child{stroke-opacity:1;stroke-width:3}`;

/** Membrane-spanning chains: the aqueous lumen of a pore masks the lipids behind it. */
export const transmembraneCss = `.mm-transmembrane__pore{fill:var(--mm-transmembrane-pore,#d2e5f6);stroke:none}:root[data-theme=dark] .mm-transmembrane__pore,.mm-theme-dark .mm-transmembrane__pore{--mm-transmembrane-pore:#24425f}@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .mm-transmembrane__pore{--mm-transmembrane-pore:#24425f}}`;

/** Shared keyframes and the reduced-motion guard. Primitive-specific keyframes may also live in their own constant. */
export const motionCss = `@keyframes mm-primitive-breathe{50%{transform:scale(1.05);opacity:.23}}@keyframes mm-nucleic-grow{0%,12%{stroke-dashoffset:var(--mm-grow-from)}70%,100%{stroke-dashoffset:var(--mm-grow-to)}}@keyframes mm-nucleic-reveal{0%,68%{opacity:0}74%,100%{opacity:1}}@keyframes mm-nucleic-follow{0%,12%{transform:translateX(var(--mm-follow-from))}70%,100%{transform:none}}@media(prefers-reduced-motion:reduce){.mm-primitive *,.mm-action *,.mm-nucleic__follow{animation:none!important;transition:none!important}}`;

export const primitiveCss = `
${proteinCss}
${modificationCss}
${moleculeCss}
${nucleicCss}
${lesionCss}
${membraneCss}${compartmentCss}
${transmembraneCss}
${interactionCss}${actionCss}
${motionCss}
`;
