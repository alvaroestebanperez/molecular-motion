import {
  type ProteinSphere, proteinGeometry, proteinOutlineWidth, type ProteinPoint, renderProteinSurface,
} from './protein-geometry';
import { type ContactShape, proteinSurfacePoint, firstContact } from './contact';
import { round } from './shared';

export type ModificationVisualKind = 'phosphorylation' | 'acetylation' | 'methylation' | 'ubiquitination' | 'sumoylation' | 'glycosylation' | 'parylation';

const MODIFICATION_LABELS: Record<ModificationVisualKind, string> = {
  phosphorylation: 'P', acetylation: 'Ac', methylation: 'Me', ubiquitination: 'Ub', sumoylation: 'SUMO', glycosylation: 'sugar', parylation: 'PAR',
};

/** Radius of one ubiquitin unit: a small protein, never another protagonist. */
export const UBIQUITIN_RADIUS = 10;

/** Fixed fill of every ubiquitin unit (hex, so the shared surface shading can mix it). */
const UBIQUITIN_FILL = '#e39467';

/** Gap bridged by the short link between consecutive ubiquitin units. */
const UBIQUITIN_LINK = 4.5;

let ubiquitinShape: ContactShape | undefined;

/**
 * Geometry of one ubiquitin unit: the shared protein geometry with a fixed seed and a compact,
 * two-lobed morphology with very few particles, so every ubiquitin looks the same everywhere.
 */
export function ubiquitinGeometry(): ProteinSphere[] {
  return proteinGeometry('ub', UBIQUITIN_RADIUS, 8, 'compact');
}

function ubiquitin(): ContactShape {
  ubiquitinShape ??= { particles: ubiquitinGeometry(), margin: proteinOutlineWidth(UBIQUITIN_RADIUS) };
  return ubiquitinShape;
}

/**
 * Mono- or poly-ubiquitin: `count` identical mini-proteins. The first one touches the carrier's
 * surface at `at`; each next one is fitted by first contact and joined by a short link (Ub—Ub—Ub),
 * curling gently so the chain stays compact. Reuses the protein surface, never the Protein primitive
 * (no halo, states or nested modifications).
 */
function renderUbiquitin(count: number, at: ProteinPoint, direction: ProteinPoint, carrier?: ContactShape): string {
  const shape = ubiquitin();
  const length = Math.hypot(direction.x, direction.y) || 1;
  const d = { x: direction.x / length, y: direction.y / length };
  const support = (v: ProteinPoint) => proteinSurfacePoint(shape.particles, Math.atan2(v.y, v.x), UBIQUITIN_RADIUS);
  const base = support({ x: -d.x, y: -d.y });
  // Pressed 1.2 px into the carrier, as contact elsewhere, so the outlines merge instead of leaving a
  // hairline gap. With the carrier's geometry, first contact on the axis through `at` also keeps
  // an off-axis lobe from being buried in a concave surface.
  const centres = [carrier
    ? firstContact(carrier, shape, d, { origin: at, overlap: 1.2 }).offset
    : { x: at.x - base.x - d.x * 1.2, y: at.y - base.y - d.y * 1.2 }];
  const links: string[] = [];
  const curl = d.x <= 0 ? .42 : -.42;
  for (let index = 1; index < count; index++) {
    const turn = curl * index;
    const heading = { x: d.x * Math.cos(turn) - d.y * Math.sin(turn), y: d.x * Math.sin(turn) + d.y * Math.cos(turn) };
    const previous = centres[index - 1]!;
    const { offset } = firstContact(shape, shape, heading, { overlap: 0 });
    const next = { x: previous.x + offset.x + heading.x * UBIQUITIN_LINK, y: previous.y + offset.y + heading.y * UBIQUITIN_LINK };
    const from = support(heading); const to = support({ x: -heading.x, y: -heading.y });
    // The link starts and ends just inside each unit's outline, so it reads as one connection through the gap.
    links.push(`M${round(previous.x + from.x - heading.x * 2)} ${round(previous.y + from.y - heading.y * 2)}L${round(next.x + to.x + heading.x * 2)} ${round(next.y + to.y + heading.y * 2)}`);
    centres.push(next);
  }
  const surface = renderProteinSurface(shape.particles, UBIQUITIN_FILL, UBIQUITIN_RADIUS);
  const units = centres.map(centre => `<g class="mm-modification__unit" transform="translate(${round(centre.x)} ${round(centre.y)})">${surface}<text y="2.6">Ub</text></g>`).join('');
  const chain = count > 1 ? ' mm-modification--chain' : '';
  return `<g class="mm-modification mm-modification--ubiquitination${chain}" data-units="${count}">${links.length ? `<path class="mm-modification__link" d="${links.join('')}"/>` : ''}${units}</g>`;
}

/**
 * A post-translational modification marker attached at `at`, a point on the carrier's visible
 * surface. `direction` points away from the carrier (default: from the local origin towards `at`);
 * `carrier` is the carrier's particle geometry, when known, for exact contact. Ubiquitin is drawn as
 * small proteins (mono-Ub, or a Ub—Ub—Ub chain); PAR stays a bead polymer; the other kinds are
 * labelled tags centred on the surface.
 */
export function renderModificationPrimitive(modification: { kind: ModificationVisualKind; length?: number; branched?: boolean }, at = { x: 0, y: 0 }, options: { direction?: ProteinPoint; carrier?: ContactShape } = {}): string {
  const { kind } = modification;
  if (kind === 'ubiquitination') {
    const direction = options.direction ?? (Math.hypot(at.x, at.y) > 1e-6 ? at : { x: 0, y: -1 });
    return renderUbiquitin(Math.max(1, Math.min(modification.length ?? 1, 8)), at, direction, options.carrier);
  }
  if (kind === 'parylation') {
    const count = Math.max(2, Math.min(modification.length ?? 6, 14));
    const links: string[] = [];
    const beads: string[] = [];
    let previous = at;
    for (let index = 0; index < count; index++) {
      const point = { x: at.x + 11 + index * 12, y: at.y - index * 7 + Math.sin(index * 1.2) * 6 };
      links.push(`M${round(previous.x)} ${round(previous.y)}L${round(point.x)} ${round(point.y)}`);
      beads.push(`<circle cx="${round(point.x)}" cy="${round(point.y)}" r="5.5"/>`);
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

/** Post-translational modification markers and chains. */
export const modificationCss = `.mm-modification rect{fill:#fff;stroke:#334155;stroke-width:1}.mm-modification text{text-anchor:middle;fill:#17213b;font:700 9px Inter,system-ui}.mm-modification--phosphorylation rect,.mm-modification--acetylation rect{fill:#f7c85c}.mm-modification--methylation rect{fill:#e9829b}.mm-modification--sumoylation rect{fill:#82b7e8}.mm-modification--glycosylation rect{fill:#ec8bad}.mm-modification--parylation path{fill:none;stroke:#c354bd;stroke-width:2}.mm-modification--parylation circle{fill:#ce65c6;stroke:#fff;stroke-width:1}.mm-modification__link{fill:none;stroke:#8a5a3f;stroke-width:2.2;stroke-linecap:round}.mm-modification__unit text{font-size:7px}`;
