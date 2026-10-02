import type { LesionType } from '@molecular-motion/core';
import {
  actorParticles, chainBase, chainGeometry, chainReach, hashString, helixY, HELIX, MOLECULE_ACTOR_SCALE, moleculeAtoms, moleculeTopology, relaxedAt, strandIndex, strandMissingAt,
  type SceneActor, type SceneConnection, type SceneNucleicAcid, type SvgScene,
} from './scene';
import { mix, primitiveCss, renderSmallMoleculePrimitive, renderInteractionPrimitive, renderModificationPrimitive, renderProteinSurface, type ModificationVisualKind } from './primitives';

export { mix };

export interface RenderOptions {
  /** Unique per SVG in the document: gradient and filter ids are derived from it. */
  idPrefix?: string;
  selectedActor?: string | null;
  /** Thumbnail mode: no labels, no out-of-focus actors, not interactive. */
  compact?: boolean;
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));
const round = (value: number) => Math.round(value * 10) / 10;

/** Text shown next to a lesion. Lesion types are schema vocabulary, so the renderer may name them. */
export const LESION_LABELS: Record<LesionType, string> = {
  'base-damage': 'Damaged base',
  'abasic-site': 'AP site',
  'single-strand-break': 'Single-strand break (SSB)',
  nick: 'Nick',
  'double-strand-break': 'Double-strand break (DSB)',
  adduct: 'DNA adduct',
};

/**
 * Serialise a scene to SVG. Every element that persists between steps carries a stable `data-key`
 * inside a `data-layer` group, so hosts can patch the DOM and let CSS transitions animate movement.
 */
export function renderSvg(scene: SvgScene, options: RenderOptions = {}): string {
  const prefix = escape(options.idPrefix ?? 'mm');
  const compact = options.compact ?? false;
  const actors = compact ? scene.actors.filter(actor => !actor.ghost) : scene.actors;
  const colors = [...new Set(actors.map(actor => actor.color))];

  const defs = `<defs>${colors.map((color, index) => sphereGradient(`${prefix}-g${index}`, color) + haloGradient(`${prefix}-halo-${index}`, color)).join('')}`
    + `<radialGradient id="${prefix}-alert"><stop offset="0" stop-color="var(--mm-alert)" stop-opacity=".55"/><stop offset="1" stop-color="var(--mm-alert)" stop-opacity="0"/></radialGradient>`
    + `<filter id="${prefix}-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>`;
  const acids = scene.nucleicAcids.map(acid => `<g class="mm-dna" data-key="acid:${escape(acid.id)}" aria-hidden="true">${helix(acid, scene.width, prefix)}</g>`).join('');
  const connections = scene.connections.map(bindingConnection).join('');
  const actorMarkup = actors.map(actor => actorGroup(actor, `${prefix}-g${colors.indexOf(actor.color)}`, `${prefix}-halo-${colors.indexOf(actor.color)}`, prefix, options.selectedActor === actor.id, compact)).join('');
  const labels = compact ? '' : [
    ...actors.filter(actor => actor.group?.lead !== false).map(actor => actorLabel(actor)),
    ...actors.filter(actor => actor.chain).map(actor => chainLabel(actor)),
    ...scene.lesions.map(lesion => lesionLabel(lesion, actors)),
  ].join('');

  const summary = describeScene(scene);
  const viewBox = compact ? focusViewBox(scene, actors) : `0 0 ${scene.width} ${scene.height}`;
  return `<svg class="mm-svg${compact ? ' mm-svg--compact' : ''}" viewBox="${viewBox}" role="img" aria-labelledby="${prefix}-title ${prefix}-description" xmlns="http://www.w3.org/2000/svg">`
    + `<title id="${prefix}-title">${escape(scene.title)}</title><desc id="${prefix}-description">${escape([scene.description, summary].filter(Boolean).join(' '))}</desc>`
    + `<g data-layer="defs">${defs}</g>`
    + `<g class="mm-layer" data-layer="acids">${acids}</g>`
    + `<g class="mm-layer" data-layer="connections">${connections}</g>`
    + `<g class="mm-layer" data-layer="actors">${actorMarkup}</g>`
    + `<g class="mm-layer" data-layer="labels">${labels}</g></svg>`;
}

/**
 * A `boundTo` relation. Contact (the default) draws no line, because a line must never stand in
 * for molecular contact: only the shared `contact` interaction (a soft shadow in the crevice, under
 * the actors) keyed and positioned by transform, so it follows the actors between steps. A dotted
 * `relation` remains only when the layout could not put the actors in contact.
 */
function bindingConnection(connection: SceneConnection): string {
  const key = `connection:${escape(connection.source)}:${escape(connection.target)}`;
  const ends = (from: { x: number; y: number }, to: { x: number; y: number }) => [{ id: connection.source, ...from }, { id: connection.target, ...to }];
  if ((connection.kind ?? 'relation') === 'contact') {
    const x = (connection.from.x + connection.to.x) / 2; const y = (connection.from.y + connection.to.y) / 2;
    const half = { x: round((connection.from.x - connection.to.x) / 2), y: round((connection.from.y - connection.to.y) / 2) };
    return `<g class="mm-binding mm-binding--contact" data-key="${key}" style="transform:translate(${round(x)}px,${round(y)}px)" aria-hidden="true">`
      + `${renderInteractionPrimitive(ends(half, { x: -half.x, y: -half.y }), { kind: 'contact' })}</g>`;
  }
  const from = { x: round(connection.from.x), y: round(connection.from.y) }; const to = { x: round(connection.to.x), y: round(connection.to.y) };
  return `<g class="mm-binding mm-binding--relation" data-key="${key}" aria-hidden="true">${renderInteractionPrimitive(ends(from, to), { kind: 'relation' })}</g>`;
}

/**
 * Crop around the action for thumbnails: the bounding box of actors, chains, and lesions (or the
 * middle of the helix when nothing else is shown), widened to a 2:1 frame.
 */
function focusViewBox(scene: SvgScene, actors: SceneActor[]): string {
  const acid = scene.nucleicAcids[0];
  const boxes = actors.map(actor => {
    const reach = actor.chain ? Math.max(actor.radius, chainBase(actor) + chainReach(actor.chain.length)) : actor.radius;
    const tip = actor.chain ? { x: actor.x + Math.cos(actor.chain.angle) * reach, y: actor.y + Math.sin(actor.chain.angle) * reach } : actor;
    return [Math.min(actor.x - actor.radius, tip.x - 8), Math.min(actor.y - actor.radius, tip.y - 8), Math.max(actor.x + actor.radius, tip.x + 8), Math.max(actor.y + actor.radius, tip.y + 8)];
  });
  for (const lesion of scene.lesions) boxes.push([lesion.x - 60, lesion.y - 40, lesion.x + 60, lesion.y + 40]);
  if (acid) {
    const center = acid.sites[0]?.x ?? scene.width / 2;
    boxes.push([center - 150, acid.y - HELIX.amplitude - 30, center + 150, acid.y + HELIX.amplitude + 16]);
  }
  if (!boxes.length) return `0 0 ${scene.width} ${scene.height}`;
  let [x0, y0, x1, y1] = [Math.min(...boxes.map(b => b[0]!)), Math.min(...boxes.map(b => b[1]!)), Math.max(...boxes.map(b => b[2]!)), Math.max(...boxes.map(b => b[3]!))];
  const padding = 18;
  x0 -= padding; y0 -= padding; x1 += padding; y1 += padding;
  let width = x1 - x0;
  let height = y1 - y0;
  if (width < height * 2) { x0 -= (height * 2 - width) / 2; width = height * 2; }
  else { y0 -= (width / 2 - height) / 2; height = width / 2; }
  return `${round(x0)} ${round(y0)} ${round(width)} ${round(height)}`;
}

/** Plain-language summary of what is on screen, for the SVG description. */
export function describeScene(scene: SvgScene): string {
  const labels = new Map([...scene.nucleicAcids, ...scene.actors].map(item => [item.id, item.label]));
  const target = (reference: string) => {
    const [actor, site] = reference.split('.');
    return site ? `${labels.get(actor!) ?? actor} (${site})` : labels.get(actor!) ?? reference;
  };
  // Copies are described once, by their lead, with a count.
  const parts = scene.actors.filter(actor => !actor.ghost && actor.group?.lead !== false).map(actor => {
    const facts = [actor.activity, actor.boundTo && `bound to ${target(actor.boundTo)}`, actor.chain && `carrying ${actor.chain.label}`].filter(Boolean);
    const name = calloutText(actor);
    return facts.length ? `${name} (${facts.join(', ')})` : name;
  });
  const lesions = scene.lesions.map(lesion => `${LESION_LABELS[lesion.type]} at ${target(lesion.target)}${lesion.strand === 'bottom' ? ' on the bottom strand' : ''}`);
  const strands = scene.nucleicAcids.flatMap(acid => {
    const facts = [
      ...(acid.missing ?? []).map(range => `${range.strand} strand missing ${range.from}–${range.to} (${range.strand === 'top' ? 'bottom' : 'top'} strand single-stranded)`),
      ...(acid.nascent ?? []).map(range => `${range.strand} strand newly synthesised ${range.from}–${range.to}`),
      ...(acid.open ?? []).map(range => `unwound ${range.from}–${range.to}`),
    ];
    return facts.length ? [`${acid.label}: ${facts.join('; ')}`] : [];
  });
  return [parts.length && `Shown: ${parts.join('; ')}.`, lesions.length && `Lesions: ${lesions.join('; ')}.`, strands.length && `Strands: ${strands.join('. ')}.`].filter(Boolean).join(' ');
}

// ---- Nucleic acids ----

function helix(acid: SceneNucleicAcid, width: number, prefix: string): string {
  const { wavelength } = HELIX;
  const k = (2 * Math.PI) / wavelength;
  const phaseX = acid.sites[0]?.x ?? width / 2;
  const theta = (x: number) => k * (x - phaseX);
  const strandY = (strand: 0 | 1, x: number) => helixY(acid, strand, x, width);
  const strandState = Boolean(acid.missing || acid.open);
  const isFront = (strand: 0 | 1, x: number) => (strand === 0 ? 1 : -1) * Math.sin(theta(x)) >= 0 || (strandState && relaxedAt(acid, strand, x));

  // Strand state on a single broken strand at the site (resected, re-synthesised) already shows the real
  // discontinuity there, so the lesion's fixed-width gap is not drawn on top of it. A DSB keeps its gap:
  // its two fragments stay apart whatever their overhangs.
  const touched = (strand: 0 | 1, x: number) => [...acid.missing ?? [], ...acid.nascent ?? []]
    .some(range => strandIndex(range.strand) === strand && x >= range.x0 - 1 && x <= range.x1 + 1);
  const gaps: [0 | 1, number, number][] = [];
  for (const site of acid.sites) {
    const strands = (site.lesionStrands ?? ['top']).map(strandIndex).filter(strand => site.lesion === 'double-strand-break' || !touched(strand, site.x));
    if (site.lesion === 'single-strand-break') for (const strand of strands) gaps.push([strand, site.x - 12, site.x + 12]);
    if (site.lesion === 'nick') for (const strand of strands) gaps.push([strand, site.x - 3, site.x + 3]);
    if (site.lesion === 'double-strand-break') for (const strand of strands) gaps.push([strand, site.x - 15, site.x + 15]);
  }
  for (const range of acid.missing ?? []) gaps.push([strandIndex(range.strand), range.x0, range.x1]);
  // Polarity is labelled where it tells the story: the molecule's ends, resected ends and the two sides
  // of a DSB. A nick or SSB keeps its strand continuous for labelling, so no 5′/3′ crowds the lesion.
  const polarityCuts: [0 | 1, number, number][] = [
    ...acid.sites.filter(site => site.lesion === 'double-strand-break').flatMap(site => [[0, site.x - 15, site.x + 15], [1, site.x - 15, site.x + 15]] as [0 | 1, number, number][]),
    ...(acid.missing ?? []).map((range): [0 | 1, number, number] => [strandIndex(range.strand), range.x0, range.x1]),
  ];
  const inGap = (strand: 0 | 1, x: number) => gaps.some(([s, from, to]) => s === strand && x > from && x < to);
  // Base pairs need both strands, paired: none across a gap in either strand or inside a bubble.
  const unpaired = (x: number) => strandState && (strandMissingAt(acid, 0, x) || strandMissingAt(acid, 1, x) || (acid.open ?? []).some(range => x > range.x0 && x < range.x1));

  const segments = { back: [] as string[], front: [] as string[] };
  for (const strand of [0, 1] as const) {
    let current: string[] = [];
    let currentFront = isFront(strand, -20);
    const flush = () => { if (current.length > 1) segments[currentFront ? 'front' : 'back'].push(`M${current.join('L')}`); current = []; };
    for (let x = -20; x <= width + 20; x += 3) {
      const front = isFront(strand, x);
      if (inGap(strand, x)) { flush(); currentFront = front; continue; }
      if (front !== currentFront) {
        current.push(`${round(x)} ${round(strandY(strand, x))}`);
        flush();
        currentFront = front;
      }
      current.push(`${round(x)} ${round(strandY(strand, x))}`);
    }
    flush();
  }

  const rungs: string[] = [];
  const damaged: string[] = [];
  const lesionSites = new Map(acid.sites.filter(site => site.lesion).map(site => [Math.round(site.x), site.lesion!]));
  const spacing = 18;
  for (let x = phaseX - Math.ceil((phaseX + 20) / spacing) * spacing; x <= width + 20; x += spacing) {
    const y0 = strandY(0, x);
    const y1 = strandY(1, x);
    if (Math.abs(y0 - y1) < 5 || unpaired(x)) continue;
    const lesion = lesionSites.get(Math.round(x));
    if (lesion === 'abasic-site' || lesion === 'single-strand-break' || lesion === 'double-strand-break') continue;
    const path = `M${round(x)} ${round(y0)}L${round(x)} ${round(y1)}`;
    (lesion === 'base-damage' || lesion === 'adduct' ? damaged : rungs).push(path);
  }

  const markers = acid.sites.filter(site => site.lesion)
    .map(site => lesionMarker(site.lesion!, site.x, strandY(strandIndex(site.lesionStrands?.[0] ?? 'top'), site.x), prefix)).join('');
  // Newly synthesised nucleotides are traced over their backbone, in front or behind like the backbone.
  const nascent = { back: [] as string[], front: [] as string[] };
  for (const range of acid.nascent ?? []) {
    const strand = strandIndex(range.strand);
    let current: string[] = [];
    let currentFront = isFront(strand, range.x0);
    const flush = () => { if (current.length > 1) nascent[currentFront ? 'front' : 'back'].push(`M${current.join('L')}`); current = []; };
    for (let x = range.x0; ; x = Math.min(x + 3, range.x1)) {
      const front = isFront(strand, x);
      current.push(`${round(x)} ${round(strandY(strand, x))}`);
      if (front !== currentFront) { flush(); current.push(`${round(x)} ${round(strandY(strand, x))}`); currentFront = front; }
      if (x >= range.x1) break;
    }
    flush();
  }
  const nascentPath = (layer: 'back' | 'front') => nascent[layer].length ? `<path class="mm-dna__nascent mm-dna__nascent--${layer}" d="${nascent[layer].join('')}"/>` : '';
  return `<g class="mm-dna__back"><path d="${segments.back.join('')}"/></g>`
    + nascentPath('back')
    + `<path class="mm-dna__rungs" d="${rungs.join('')}"/>`
    + (damaged.length ? `<path class="mm-dna__rungs mm-dna__rungs--damaged" d="${damaged.join('')}"/>` : '')
    + `<g class="mm-dna__front"><path class="mm-dna__tube" d="${segments.front.join('')}"/><path class="mm-dna__shine" d="${segments.front.join('')}"/></g>`
    + nascentPath('front') + markers + (acid.polarity ? polarityLabels(acid, width, polarityCuts) : '');
}

/**
 * 5′/3′ at both ends of every strand fragment. Top runs 5′→3′ left to right and bottom the other way,
 * so a fragment of top reads 5′ … 3′ and a fragment of bottom 3′ … 5′. Fragments are delimited by
 * `cuts` (DSBs and missing nucleotides), so overhang ends are labelled too.
 */
function polarityLabels(acid: SceneNucleicAcid, width: number, cuts: [0 | 1, number, number][]): string {
  const edge = 14;
  const labels: string[] = [];
  for (const strand of [0, 1] as const) {
    const strandCuts = cuts.filter(([s]) => s === strand).map(([, from, to]) => [Math.max(0, from), Math.min(width, to)] as const).filter(([from, to]) => to > from).sort((a, b) => a[0] - b[0]);
    const fragments: [number, number][] = [];
    let start = 0;
    for (const [from, to] of strandCuts) { if (from > start) fragments.push([start, from]); start = Math.max(start, to); }
    if (start < width) fragments.push([start, width]);
    // One lane per strand, outside the helix envelope, so the two strands' labels never collide.
    const lane = acid.y + (strand === 0 ? -(HELIX.amplitude + 16) : HELIX.amplitude + 24);
    for (const [from, to] of fragments) {
      const left = from === 0 ? edge : from + 7; const right = to === width ? width - edge : to - 7;
      if (right - left < 18) continue;
      const [leftEnd, rightEnd] = strand === 0 ? ['5′', '3′'] : ['3′', '5′'];
      labels.push(`<text class="mm-dna__polarity" x="${round(left)}" y="${round(lane)}">${leftEnd}</text>`);
      labels.push(`<text class="mm-dna__polarity" x="${round(right)}" y="${round(lane)}">${rightEnd}</text>`);
    }
  }
  return `<g class="mm-dna__polarities" data-acid="${escape(acid.id)}">${labels.join('')}</g>`;
}

function lesionMarker(lesion: LesionType, x: number, y: number, prefix: string): string {
  const glow = (radius: number) => `<ellipse class="mm-lesion__glow" cx="${round(x)}" cy="${round(y)}" rx="${radius * 1.4}" ry="${radius}" fill="url(#${prefix}-alert)"/>`;
  const at = `data-lesion="${lesion}"`;
  switch (lesion) {
    case 'base-damage':
    case 'adduct':
      return `<g class="mm-lesion" ${at}>${glow(18)}<circle class="mm-lesion__dot" cx="${round(x)}" cy="${round(y + 13)}" r="6"/></g>`;
    case 'abasic-site':
      return `<g class="mm-lesion" ${at}>${glow(14)}<circle class="mm-lesion__ring" cx="${round(x)}" cy="${round(y + 13)}" r="5.5"/></g>`;
    case 'nick':
      return `<g class="mm-lesion" ${at}>${glow(10)}<circle class="mm-lesion__dot" cx="${round(x)}" cy="${round(y)}" r="3"/></g>`;
    case 'single-strand-break':
      return `<g class="mm-lesion" ${at}>${glow(26)}<circle class="mm-lesion__dot" cx="${round(x - 12)}" cy="${round(y)}" r="4.5"/><circle class="mm-lesion__dot" cx="${round(x + 12)}" cy="${round(y)}" r="4.5"/></g>`;
    case 'double-strand-break':
      return `<g class="mm-lesion" ${at}>${glow(40)}</g>`;
  }
}

// ---- Actors ----

function actorGroup(actor: SceneActor, gradient: string, halo: string, prefix: string, selected: boolean, compact: boolean): string {
  // Small molecules stay ball-and-stick; proteins and complexes share the catalog's unified surface.
  let shape: string;
  const topology = actor.type === 'molecule' ? moleculeTopology(actor.molecule) : undefined;
  if (topology) {
    // A declared molecule is drawn with the catalog's topology glyph; an invisible outline group keeps the
    // selection/focus hooks, sized from the same atoms the layout uses for contact.
    const atoms = actorParticles(actor.actor, actor.type, actor.radius, actor.molecule);
    shape = `<g class="mm-shape__outline mm-shape__outline--molecule">${atoms.map(a => `<circle cx="${round(a.x)}" cy="${round(a.y)}" r="${round(a.r + 1.6)}"/>`).join('')}</g>`
      + renderSmallMoleculePrimitive({ visualSeed: actor.actor, topology, scale: MOLECULE_ACTOR_SCALE, fill: actor.color });
  } else if (actor.type === 'molecule') {
    const atoms = moleculeAtoms(hashString(actor.actor), actor.radius);
    const circles = (grow: number) => atoms.map(s => `<circle cx="${round(s.x)}" cy="${round(s.y)}" r="${round(s.r + grow)}"/>`).join('');
    shape = `<path class="mm-bonds" d="M${atoms.map(s => `${round(s.x)} ${round(s.y)}`).join('L')}"/><g class="mm-shape__outline">${circles(1.6)}</g><g class="mm-shape__body" fill="url(#${gradient})">${circles(0)}</g>`;
  } else {
    shape = renderProteinSurface(actorParticles(actor.actor, actor.type, actor.radius), actor.color, actor.radius);
  }
  const glow = actor.activity === 'active' && !actor.ghost ? `<circle class="mm-halo" r="${actor.radius + 18}" fill="url(#${halo})"/>` : '';
  const inhibition = actor.activity === 'inhibited' ? `<g class="mm-inhibition" aria-hidden="true"><circle r="${actor.radius + 7}"/><path d="M${round(-actor.radius * .72)} ${round(actor.radius * .72)}L${round(actor.radius * .72)} ${round(-actor.radius * .72)}"/></g>` : '';
  const chain = actor.chain ? parChain(actor) : '';
  const badges = actor.badges.map((badge, index) => {
    const angle = -2.4 + index * .5;
    const x = round(Math.cos(angle) * actor.radius * .95);
    const y = round(Math.sin(angle) * actor.radius * .95);
    const kind = badge.kind.toLowerCase() as ModificationVisualKind;
    if (['phosphorylation', 'acetylation', 'methylation', 'ubiquitination', 'sumoylation', 'glycosylation', 'parylation'].includes(kind)) {
      return renderModificationPrimitive({ kind }, { x, y });
    }
    return `<g class="mm-badge"><circle cx="${x}" cy="${y}" r="9"/><text x="${x}" y="${y + 3.5}" text-anchor="middle">${escape(badge.label)}</text></g>`;
  }).join('');
  const classes = ['mm-actor', `mm-actor--${actor.type}`, actor.ghost && 'mm-actor--ghost', actor.activity && `mm-actor--${actor.activity}`].filter(Boolean).join(' ');
  const scale = actor.ghost ? ' scale(.62)' : '';
  const interactive = actor.ghost || compact
    ? 'aria-hidden="true"'
    : `role="button" tabindex="0" aria-pressed="${selected}" aria-label="${escape([actor.label, actor.activity].filter(Boolean).join(', '))}"`;
  return `<g class="${classes}" data-key="actor:${escape(actor.id)}" data-actor="${escape(actor.id)}"${actor.activity ? ` data-activity="${actor.activity}"` : ''} ${interactive} style="transform:translate(${round(actor.x)}px,${round(actor.y)}px)${scale};--mm-actor:${escape(actor.color)}">`
    + `<g class="mm-actor__inner"${actor.ghost ? ` filter="url(#${prefix}-blur)"` : ''}>${glow}${chain}${actor.mirrored ? `<g transform="scale(-1 1)">${shape}</g>` : shape}${inhibition}${badges}</g></g>`;
}

/** Branched bead chain leaving the actor's surface along `chain.angle`. */
function parChain(actor: SceneActor): string {
  const { beads, links } = chainGeometry(actor.radius, actor.chain!.angle, actor.chain!.length, chainBase(actor));
  const path = links.map(([from, to]) => `M${round(from.x)} ${round(from.y)}L${round(to.x)} ${round(to.y)}`).join('');
  return `<g class="mm-chain"><path d="${path}"/>${beads.map(bead => `<circle cx="${round(bead.x)}" cy="${round(bead.y)}" r="${bead.r}" style="--i:${bead.index}"/>`).join('')}</g>`;
}

// ---- Labels ----

/** Pill label with a thin leader ending in a small arrowhead at (tx, ty). Coordinates are relative. */
function pill(x: number, y: number, tx: number, ty: number, text: string, side: -1 | 1): string {
  const width = Math.max(48, text.length * 8.4 + 24);
  const left = side === 1 ? x : x - width;
  const startX = side === 1 ? left + 10 : left + width - 10;
  const startY = y + 12;
  const midX = (startX + tx) / 2 + side * 6;
  const midY = Math.max(startY, ty) - 4;
  return `<path class="mm-leader" d="M${round(startX)} ${round(startY)}Q${round(midX)} ${round(midY)} ${round(tx)} ${round(ty)}"/>${arrowhead(midX, midY, tx, ty)}`
    + `<rect class="mm-pill" x="${round(left)}" y="${round(y - 14)}" width="${round(width)}" height="28" rx="14"/>`
    + `<text class="mm-pill__text" x="${round(left + width / 2)}" y="${round(y + 5)}" text-anchor="middle">${escape(text)}</text>`;
}

function arrowhead(fromX: number, fromY: number, x: number, y: number): string {
  const angle = Math.atan2(y - fromY, x - fromX);
  const wing = (offset: number) => `${round(x - Math.cos(angle + offset) * 6)} ${round(y - Math.sin(angle + offset) * 6)}`;
  return `<path class="mm-leader mm-leader--head" d="M${wing(.5)}L${round(x)} ${round(y)}L${wing(-.5)}"/>`;
}

/** Plain text callout (no pill) with a straight leader; used for DNA features. */
function callout(x: number, y: number, tx: number, ty: number, text: string, anchor: 'start' | 'end' = 'start'): string {
  const from = anchor === 'start' ? x - 4 : x + 4;
  return `<path class="mm-leader" d="M${from} ${y + 6}L${tx} ${ty}"/><text class="mm-callout" x="${x}" y="${y}"${anchor === 'end' ? ' text-anchor="end"' : ''}>${escape(text)}</text>`;
}

/** Lesion callout above the helix on whichever side is free of actors; below the helix otherwise. */
function lesionLabel(lesion: SvgScene['lesions'][number], actors: SceneActor[]): string {
  const text = LESION_LABELS[lesion.type];
  const width = text.length * 7.4;
  // Chains count as obstacles too: a callout must not sit on top of the beads.
  const beads = actors.filter(actor => !actor.ghost && actor.chain).flatMap(actor => chainGeometry(actor.radius, actor.chain!.angle, actor.chain!.length, chainBase(actor)).beads
    .map(bead => ({ x: actor.x + bead.x, y: actor.y + bead.y, radius: bead.r + 2, ghost: false })));
  const blocked = (x0: number, x1: number) => [...actors, ...beads].some(actor => !actor.ghost
    && actor.x + actor.radius > lesion.x + x0 && actor.x - actor.radius < lesion.x + x1
    && actor.y + actor.radius > lesion.y - 52 && actor.y - actor.radius < lesion.y - 20);
  let markup: string;
  if (!blocked(84, 92 + width)) markup = callout(92, -34, 12, -6, text);
  else if (!blocked(-92 - width, -84)) markup = callout(-92, -34, -12, -6, text, 'end');
  else markup = callout(40, HELIX.amplitude * 2 + 44, 6, HELIX.amplitude * 2 + 4, text);
  return `<g class="mm-label mm-label--alert" data-key="lesion:${escape(lesion.target)}" style="transform:translate(${round(lesion.x)}px,${round(lesion.y)}px)" aria-hidden="true">${markup}</g>`;
}

/** Callout text: the label, with the number of visible copies when it speaks for a group. */
const calloutText = (actor: SceneActor) => actor.group && actor.group.size > 1 ? `${actor.label} ×${actor.group.size}` : actor.label;

function actorLabel(actor: SceneActor): string {
  const side = actor.labelSide;
  const r = actor.radius;
  const small = actor.type === 'molecule';
  const x = side * (r + (small ? 14 : 22));
  // Lift the callout clear of a chain leaving on the same side.
  const chainSide = actor.chain ? Math.sign(Math.cos(actor.chain.angle)) : 0;
  const y = (small ? -r - 20 : -r - 18) - (chainSide === side ? 44 : 0);
  const tx = side * r * (small ? .5 : .55);
  const ty = -r * (small ? .6 : .72);
  const classes = ['mm-label', actor.ghost && 'mm-label--ghost'].filter(Boolean).join(' ');
  const scale = actor.ghost ? ' scale(.62)' : '';
  return `<g class="${classes}" data-key="label:${escape(actor.id)}" style="transform:translate(${round(actor.x)}px,${round(actor.y)}px)${scale};--mm-actor:${escape(actor.color)}" aria-hidden="true">${pill(x, y, tx, ty, calloutText(actor), side)}</g>`;
}

function chainLabel(actor: SceneActor): string {
  const { angle, length, label } = actor.chain!;
  const reach = chainBase(actor) + chainReach(length);
  const tip = { x: Math.cos(angle) * reach * .72, y: Math.sin(angle) * reach * .72 };
  return `<g class="mm-label mm-label--chain" data-key="chain:${escape(actor.id)}" style="transform:translate(${round(actor.x)}px,${round(actor.y)}px)" aria-hidden="true">`
    + callout(round(tip.x - 64), round(tip.y - 26), round(tip.x - 6), round(tip.y - 6), `${label} chain`) + '</g>';
}

// ---- Colours ----

function sphereGradient(id: string, color: string): string {
  const light = mix(color, '#ffffff', .55);
  const dark = mix(color, '#1b2340', .28);
  return `<radialGradient id="${id}" cx="36%" cy="30%" r="78%"><stop offset="0" style="stop-color:${light}"/><stop offset=".55" style="stop-color:${escape(color)}"/><stop offset="1" style="stop-color:${dark}"/></radialGradient>`;
}

function haloGradient(id: string, color: string): string {
  return `<radialGradient id="${id}"><stop offset=".55" style="stop-color:${escape(color)}" stop-opacity=".28"/><stop offset="1" style="stop-color:${escape(color)}" stop-opacity="0"/></radialGradient>`;
}

export const molecularMotionCss = `
.mm-svg{--mm-ink:#15213b;--mm-muted:#4f5d75;--mm-surface:#ffffff;--mm-canvas:#f5f7fb;--mm-line:#dfe4ee;--mm-alert:#e5484d;--mm-dna:#3f63c4;--mm-dna-back:#a9b9e4;--mm-dna-rung:#8ea3dc;--mm-dna-new:#e0607a;--mm-chain:#b44fb0;--mm-accent:#2563eb;display:block;width:100%;height:auto;overflow:visible;font-family:var(--mm-font,Inter,system-ui,sans-serif)}
:where([data-theme=dark],.mm-theme-dark) .mm-svg{--mm-ink:#e7ecf6;--mm-muted:#93a1b8;--mm-surface:#141b2b;--mm-canvas:#0e1422;--mm-line:#26314a;--mm-alert:#ff6b6b;--mm-dna:#7f9ef0;--mm-dna-back:#34457a;--mm-dna-rung:#4b61a3;--mm-dna-new:#f08aa0;--mm-chain:#d77ad3;--mm-accent:#6ea0ff}
@media(prefers-color-scheme:dark){:where(:root:not([data-theme=light])) .mm-svg{--mm-ink:#e7ecf6;--mm-muted:#93a1b8;--mm-surface:#141b2b;--mm-canvas:#0e1422;--mm-line:#26314a;--mm-alert:#ff6b6b;--mm-dna:#7f9ef0;--mm-dna-back:#34457a;--mm-dna-rung:#4b61a3;--mm-dna-new:#f08aa0;--mm-chain:#d77ad3;--mm-accent:#6ea0ff}}
.mm-dna__back path{fill:none;stroke:var(--mm-dna-back);stroke-width:${HELIX.backTube};stroke-linecap:round;stroke-linejoin:round}
.mm-dna__rungs{fill:none;stroke:var(--mm-dna-rung);stroke-width:4.2;stroke-linecap:round;opacity:.85}
.mm-dna__rungs--damaged{stroke:var(--mm-alert);opacity:1}
.mm-dna__tube{fill:none;stroke:var(--mm-dna);stroke-width:${HELIX.tube};stroke-linecap:round;stroke-linejoin:round}
.mm-dna__shine{fill:none;stroke:#fff;stroke-opacity:.3;stroke-width:3;stroke-linecap:round;transform:translateY(-2.5px)}
.mm-dna__nascent{fill:none;stroke:var(--mm-dna-new);stroke-width:${HELIX.tube - 3};stroke-linecap:round;stroke-linejoin:round}.mm-dna__nascent--back{stroke-width:${HELIX.backTube - 3};opacity:.55}
.mm-dna__polarity{fill:var(--mm-muted);font-size:11px;font-weight:700;text-anchor:middle}
.mm-binding{transition:transform .8s cubic-bezier(.22,.7,.2,1),opacity .6s ease}.mm-binding--relation path{stroke:var(--mm-muted);opacity:.72}
.mm-lesion__glow{animation:mm-pulse 2.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.mm-lesion__dot{fill:var(--mm-alert);stroke:var(--mm-surface);stroke-width:1.5}.mm-lesion__ring{fill:var(--mm-surface);stroke:var(--mm-alert);stroke-width:2}
.mm-actor,.mm-label{transition:transform .8s cubic-bezier(.22,.7,.2,1),opacity .6s ease}
.mm-actor{cursor:pointer;outline:none}.mm-actor--ghost,.mm-label--ghost{opacity:.26;cursor:default;pointer-events:none}
.mm-shape__outline,.mm-actor .mm-surface__outline{fill:color-mix(in srgb,var(--mm-actor) 62%,var(--mm-ink))}
.mm-shape__outline--molecule{fill:transparent}
.mm-actor--inactive .mm-actor__inner{opacity:.82}.mm-actor--inhibited .mm-shape__body,.mm-actor--inhibited .mm-surface{filter:grayscale(.75)}.mm-actor--inhibited .mm-shape__outline,.mm-actor--inhibited .mm-surface__outline{fill:var(--mm-muted)}
.mm-halo{animation:mm-breathe 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.mm-inhibition circle{fill:none;stroke:var(--mm-alert);stroke-width:3}.mm-inhibition path{stroke:var(--mm-alert);stroke-width:4;stroke-linecap:round}
.mm-actor:focus-visible .mm-shape__outline,.mm-actor[aria-pressed=true] .mm-shape__outline,.mm-actor:focus-visible .mm-surface__outline,.mm-actor[aria-pressed=true] .mm-surface__outline{fill:var(--mm-accent)}
.mm-bonds{fill:none;stroke:color-mix(in srgb,var(--mm-actor) 70%,var(--mm-ink));stroke-width:3.5;stroke-linecap:round}
.mm-chain path{fill:none;stroke:var(--mm-chain);stroke-width:2.2;opacity:.7}.mm-chain circle{fill:var(--mm-chain);stroke:var(--mm-surface);stroke-width:1.2;animation:mm-bead .4s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 45ms);transform-box:fill-box;transform-origin:center}
.mm-badge circle{fill:var(--mm-surface);stroke:var(--mm-ink);stroke-width:1.2}.mm-badge text{fill:var(--mm-ink);font-size:9px;font-weight:700}
.mm-pill{fill:color-mix(in srgb,var(--mm-actor) 14%,var(--mm-surface));stroke:color-mix(in srgb,var(--mm-actor) 45%,var(--mm-surface));stroke-width:1}
.mm-pill__text{fill:color-mix(in srgb,var(--mm-actor) 55%,var(--mm-ink));font-size:14px;font-weight:650;letter-spacing:.01em}
.mm-leader{fill:none;stroke:var(--mm-muted);stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round}.mm-label--alert .mm-leader{stroke:var(--mm-alert)}
.mm-callout{fill:var(--mm-ink);font-size:13px;font-weight:500}.mm-label--alert .mm-callout{fill:var(--mm-alert);font-weight:600}.mm-label--chain .mm-callout{fill:var(--mm-chain);font-size:12px}
.mm-svg--compact .mm-halo{display:none}
.mm-enter{opacity:0}.mm-exit{opacity:0!important;transition:opacity .45s ease}
@keyframes mm-pulse{50%{transform:scale(1.18);opacity:.75}}@keyframes mm-breathe{50%{transform:scale(1.06);opacity:.8}}@keyframes mm-bead{from{transform:scale(0);opacity:0}}
@media(prefers-reduced-motion:reduce){.mm-svg *{animation:none!important;transition:none!important}}
${primitiveCss}`;
