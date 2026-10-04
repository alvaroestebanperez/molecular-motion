import { firstContact, contactOutline, proteinSurfacePoint, type ContactShape } from './primitives/contact';
import { proteinGeometry, proteinOutlineWidth, renderProteinSurface, type ProteinSphere } from './primitives/protein-geometry';
import { esc, round } from './primitives/shared';

/** Presentation only: no biological names or actor identity enter this geometry. */
export interface ModificationVisualProfile {
  /** `tag` is one small labelled disc adhered to the carrier's surface; the others repeat along a chain. */
  readonly marker: 'protein-surface' | 'bead' | 'tag';
  readonly radius: number;
  readonly fill: string;
  readonly seed?: string;
  readonly gap?: number;
  readonly curl?: number;
}
export type ModificationVisualProfiles = Readonly<Record<string, ModificationVisualProfile | undefined>>;
export interface RepeatedMarker {
  units: { x: number; y: number; r: number; index: number }[];
  links: [{ x: number; y: number }, { x: number; y: number }][];
  particles: ProteinSphere[];
  bounds: [number, number, number, number];
  profile: ModificationVisualProfile;
}

/** Same shape, seed and spacing for every unit, independent of semantics and identities. */
export function repeatedMarkerGeometry(profile: ModificationVisualProfile, count: number, angle: number, carrier: ContactShape, at = { x: 0, y: 0 }): RepeatedMarker {
  const r = profile.radius;
  const margin = profile.marker === 'protein-surface' ? proteinOutlineWidth(r) : .6;
  const local = profile.marker === 'protein-surface'
    ? proteinGeometry(profile.seed ?? 'repeated-marker', r, 8, 'compact')
    : [{ x: 0, y: 0, r, rx: r, ry: r, rotation: 0, depth: 0 }];
  const shape = { particles: local, margin };
  const envelope = Math.max(...local.map(p => Math.hypot(p.x, p.y) + Math.max(p.rx, p.ry) + margin));
  const units: RepeatedMarker['units'] = [];
  const links: RepeatedMarker['links'] = [];
  for (let index = 0; index < Math.max(1, Math.min(Math.floor(count), 16)); index++) {
    const turn = angle + (profile.curl ?? (Math.cos(angle) <= 0 ? .42 : -.42)) * index;
    const direction = { x: Math.cos(turn), y: Math.sin(turn) };
    const previous = units[index - 1];
    const support = proteinSurfacePoint(local, turn + Math.PI, r);
    const offset = !previous && !carrier.particles.length
      ? { x: at.x - support.x - direction.x * 1.2, y: at.y - support.y - direction.y * 1.2 }
      : firstContact(previous ? shape : carrier, shape, direction, { overlap: previous ? 0 : 1.2, ...(!previous && { origin: at }) }).offset;
    const gap = previous ? profile.gap ?? 4.5 : 0;
    const unit = { x: (previous?.x ?? 0) + offset.x + direction.x * gap, y: (previous?.y ?? 0) + offset.y + direction.y * gap, r: envelope, index };
    if (previous) {
      const from = proteinSurfacePoint(local, turn, r);
      const to = proteinSurfacePoint(local, turn + Math.PI, r);
      links.push([{ x: previous.x + from.x - direction.x * 2, y: previous.y + from.y - direction.y * 2 }, { x: unit.x + to.x + direction.x * 2, y: unit.y + to.y + direction.y * 2 }]);
    }
    units.push(unit);
  }
  const particles = units.flatMap(unit => local.map(p => ({ ...p, x: p.x + unit.x, y: p.y + unit.y, rx: p.rx + margin, ry: p.ry + margin })));
  const outline = contactOutline({ particles });
  return { units, links, particles, bounds: [Math.min(...outline.map(p => p.x)), Math.min(...outline.map(p => p.y)), Math.max(...outline.map(p => p.x)), Math.max(...outline.map(p => p.y))], profile };
}

export function renderRepeatedMarker(markers: RepeatedMarker, label?: string): string {
  const { profile, units, links } = markers;
  const surface = profile.marker === 'protein-surface'
    ? renderProteinSurface(proteinGeometry(profile.seed ?? 'repeated-marker', profile.radius, 8, 'compact'), profile.fill, profile.radius)
    : `<circle r="${round(profile.radius)}" fill="${esc(profile.fill)}" stroke="#334155" stroke-width="1.2"/>`;
  const path = links.map(([a, b]) => `M${round(a.x)} ${round(a.y)}L${round(b.x)} ${round(b.y)}`).join('');
  return `<g class="mm-modification mm-repeated-marker${units.length > 1 ? ' mm-modification--chain' : ''}" data-units="${units.length}"><path class="mm-modification__link" d="${path}" fill="none" stroke="${esc(profile.fill)}" stroke-width="2.2"/>${units.map(u => `<g class="mm-modification__unit" transform="translate(${round(u.x)} ${round(u.y)})">${surface}${label ? `<text y="2.6">${esc(label)}</text>` : ''}</g>`).join('')}</g>`;
}
