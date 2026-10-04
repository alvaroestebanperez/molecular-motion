import { resolveModificationVisualProfile } from '../modification-profiles';
import { repeatedMarkerGeometry, renderRepeatedMarker } from '../repeated-marker';
import {
  type ProteinSphere, proteinGeometry, type ProteinPoint,
} from './protein-geometry';
import { type ContactShape, proteinSurfacePoint } from './contact';
import { round } from './shared';

export type ModificationVisualKind = 'phosphorylation' | 'acetylation' | 'methylation' | 'ubiquitination' | 'sumoylation' | 'glycosylation' | 'parylation';

const MODIFICATION_LABELS: Record<ModificationVisualKind, string> = {
  phosphorylation: 'P', acetylation: 'Ac', methylation: 'Me', ubiquitination: 'Ub', sumoylation: 'SUMO', glycosylation: 'sugar', parylation: 'PAR',
};

/** Radius of one ubiquitin unit: a small protein, never another protagonist. */
export const UBIQUITIN_RADIUS = 10;



/** Compatibility export for the existing catalog API. */
export function ubiquitinGeometry(): ProteinSphere[] {
  return proteinGeometry('ub', UBIQUITIN_RADIUS, 8, 'compact');
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
  const unitLabel = MODIFICATION_LABELS[kind];
  const profile = resolveModificationVisualProfile({ id: kind, kind, label: MODIFICATION_LABELS[kind] });
  if (profile) {
    const direction = options.direction ?? (Math.hypot(at.x, at.y) > 1e-6 ? at : { x: 0, y: -1 });
    const markers = repeatedMarkerGeometry(profile, modification.length ?? 1, Math.atan2(direction.y, direction.x), options.carrier ?? { particles: [] }, at);
    return renderRepeatedMarker(markers, unitLabel);
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
