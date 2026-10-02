import { esc, round } from './shared';
import { actionArrowGeometry } from './actions';

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
  const line = ([a, b]: (typeof pairs)[number]) => `<path data-interaction="${id(a, b)}" d="M${a.x} ${a.y}L${b.x} ${b.y}"/>`;
  if (kind === 'relation') return `<g class="mm-primitive mm-primitive--interaction">${pairs.map(line).join('')}</g>`;
  // The last link of a directed relation is the shared action arrow (dashed, straight): one arrowhead for the whole language.
  const [tail, tip] = pairs[pairs.length - 1]!;
  const arrow = actionArrowGeometry(tail, tip, { variant: 'dashed', curvature: 0 });
  const last = `<path data-interaction="${id(tail, tip)}" d="${arrow.shaft}" style="stroke-dasharray:${arrow.dash![0]} ${arrow.dash![1]}"/>`;
  const head = `<path class="mm-interaction__head" d="${arrow.head}"/>`;
  return `<g class="mm-primitive mm-primitive--interaction mm-interaction--directed">${pairs.slice(0, -1).map(line).join('')}${last}${head}</g>`;
}

/** Interactions between actors. */
export const interactionCss = `.mm-primitive--interaction path{fill:none;stroke:#64748b;stroke-width:2;stroke-dasharray:3 3}.mm-primitive--interaction .mm-interaction__head{fill:#64748b;stroke-width:.8;stroke-dasharray:none;stroke-linecap:round;stroke-linejoin:round}.mm-interaction--directed path{stroke-linecap:round}.mm-interaction__contact{fill:#17213b;opacity:.3;filter:blur(2.5px)}`;
