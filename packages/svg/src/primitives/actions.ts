export type ActionVisualKind = 'bind' | 'unbind' | 'recruit' | 'dimerize' | 'activate' | 'inhibit' | 'modify' | 'cleave' | 'ligate' | 'synthesize' | 'degrade' | 'translocate' | 'polymerize' | 'unwind' | 'elongate' | 'conformational-change';

/*
 * Action arrows: one programmatic, biology-free arrow. A cubic Bézier shaft whose head is built on
 * the shaft's own end tangent, so shaft and head read as one stroke. Every size is in user units, so
 * the arrow scales with its figure and keeps the same proportions everywhere. What a biological
 * action looks like (dashed, bar end, cut mark…) is decided by `ACTION_VISUAL_STYLES`, not here.
 */
interface ArrowPoint { x: number; y: number }

/** `solid` for transformations; `dashed` for relations such as recruitment. */
export type ActionArrowVariant = 'solid' | 'dashed';

/** Terminal marker: an integrated arrowhead, a perpendicular bar (tee), or nothing. */
export type ActionArrowEnd = 'arrow' | 'bar' | 'none';

/** Mark drawn across the middle of the shaft. */
export type ActionArrowMark = 'none' | 'cross';

export interface ActionArrowOptions {
  variant?: ActionArrowVariant;
  end?: ActionArrowEnd;
  mark?: ActionArrowMark;
  /** Clear space between `from` and the start of the arrow, in px (e.g. the source actor's reach plus padding). */
  startGap?: number;
  /** Clear space between the tip and `to`, in px. */
  endGap?: number;
  /**
   * Sideways sag of the shaft midpoint, in px; positive bends to the left of the `from → to` direction.
   * `'auto'` (default): straight for short arrows, a gentle arc for long ones, bending up (right for vertical arrows).
   */
  curvature?: number | 'auto';
  /** Points the arrow back at `from`. The path and its bend stay put; only the marker moves. */
  reverse?: boolean;
  /** Draw-on animation when the arrow appears. Off under `prefers-reduced-motion`; the static state is the finished arrow. */
  draw?: boolean;
  /** Extra classes on the group (e.g. a semantic tag used for colour). */
  className?: string;
}

export interface ActionArrowGeometry {
  /** Shaft path: always `M x y C …`, so it can be interpolated between states. */
  shaft: string;
  /** Marker path ('' when `end` is 'none'). An arrowhead is always `M tip L wing L notch L wing Z`. */
  head: string;
  /** Mid-shaft mark path ('' without a mark). */
  mark: string;
  /** The shaft's four control points, in drawing order; the last one is where the marker takes over. */
  controls: [ArrowPoint, ArrowPoint, ArrowPoint, ArrowPoint];
  /** Where the arrow points. */
  tip: ArrowPoint;
  /** Unit tangent of the shaft at its end; the marker is built along it. */
  tangent: ArrowPoint;
  /** Shaft arc length in px. */
  length: number;
  /** Dash and gap fitted so the shaft starts and ends on a whole dash (dashed variant only). */
  dash?: [number, number];
}

/** Shaft stroke width in px; the head is sized against it. */
export const ACTION_ARROW_STROKE = 2;

const HEAD_LENGTH = 9;

const HEAD_HALF_WIDTH = 4.4;

/** Depth of the concave back of the head. */
const HEAD_NOTCH = 2;

/** How far the shaft runs into the solid part of the head, past the notch, so no seam can show. */
const HEAD_OVERLAP = 1.2;

const BAR_HALF = 6.5;

const CROSS_ARM = 5.4;

const MARK_MIN_SHAFT = 28;

/** Dash length before its round caps (which add one stroke width), and the gap between dashes. */
const DASH = 2.2;

const DASH_GAP = 4.6;

const MIN_ARROW = 8;

type Cubic = [ArrowPoint, ArrowPoint, ArrowPoint, ArrowPoint];

const r2 = (value: number) => Math.round(value * 100) / 100 + 0;

const fmt = (p: ArrowPoint) => `${r2(p.x)} ${r2(p.y)}`;

const vAdd = (a: ArrowPoint, b: ArrowPoint, k = 1): ArrowPoint => ({ x: a.x + b.x * k, y: a.y + b.y * k });

const vSub = (a: ArrowPoint, b: ArrowPoint): ArrowPoint => ({ x: a.x - b.x, y: a.y - b.y });

const vUnit = (v: ArrowPoint, fallback: ArrowPoint = { x: 1, y: 0 }): ArrowPoint => { const n = Math.hypot(v.x, v.y); return n > 1e-9 ? { x: v.x / n, y: v.y / n } : fallback; };

const vLerp = (a: ArrowPoint, b: ArrowPoint, t: number): ArrowPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

const cubicAt = ([p0, p1, p2, p3]: Cubic, t: number): ArrowPoint => {
  const s = 1 - t;
  return { x: s * s * s * p0.x + 3 * s * s * t * p1.x + 3 * s * t * t * p2.x + t * t * t * p3.x, y: s * s * s * p0.y + 3 * s * s * t * p1.y + 3 * s * t * t * p2.y + t * t * t * p3.y };
};

/** de Casteljau: the part of the curve between 0 and t. */
const cubicUntil = (c: Cubic, t: number): Cubic => {
  const a = vLerp(c[0], c[1], t); const b = vLerp(c[1], c[2], t); const d = vLerp(c[2], c[3], t);
  const ab = vLerp(a, b, t); const bd = vLerp(b, d, t);
  return [c[0], a, ab, vLerp(ab, bd, t)];
};

const cubicTangent = ([p0, p1, p2, p3]: Cubic, t: number): ArrowPoint => {
  const s = 1 - t;
  return vUnit({ x: 3 * s * s * (p1.x - p0.x) + 6 * s * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x), y: 3 * s * s * (p1.y - p0.y) + 6 * s * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y) }, vUnit(vSub(p3, p0)));
};

const cubicLength = (c: Cubic) => { let total = 0; let last = c[0]; for (let i = 1; i <= 48; i++) { const p = cubicAt(c, i / 48); total += Math.hypot(p.x - last.x, p.y - last.y); last = p; } return total; };

/** Adaptive sag: none up to 40 px, then growing gently to at most 8 px. */
export const autoArrowCurvature = (length: number) => Math.min(8, Math.max(0, (length - 40) * .085));

export function actionArrowGeometry(from: ArrowPoint, to: ArrowPoint, options: ActionArrowOptions = {}): ActionArrowGeometry {
  const end = options.end ?? 'arrow';
  const chord = vSub(to, from); const distance = Math.hypot(chord.x, chord.y); const u = vUnit(chord);
  // Gaps never eat the arrow: they shrink together, leaving at least MIN_ARROW px.
  let startGap = Math.max(0, options.startGap ?? 0); let endGap = Math.max(0, options.endGap ?? 0);
  const room = Math.max(0, distance - MIN_ARROW);
  if (startGap + endGap > room) { const k = room / (startGap + endGap); startGap *= k; endGap *= k; }
  const a = vAdd(from, u, startGap); const b = vAdd(to, u, -endGap); const span = Math.hypot(b.x - a.x, b.y - a.y);
  // Left of travel in screen coordinates (y down). 'auto' always bends up, or right for vertical arrows.
  const left = { x: u.y, y: -u.x };
  const sag = options.curvature === undefined || options.curvature === 'auto'
    ? autoArrowCurvature(span) * (Math.abs(left.y) > 1e-6 ? -Math.sign(left.y) : Math.sign(left.x) || 1)
    : options.curvature;
  // A cubic's midpoint moves 3/4 of its inner control points' offset.
  const offset = { x: left.x * sag * 4 / 3, y: left.y * sag * 4 / 3 };
  const forward: Cubic = [a, vAdd(vLerp(a, b, 1 / 3), offset), vAdd(vLerp(a, b, 2 / 3), offset), b];
  const curve: Cubic = options.reverse ? [forward[3], forward[2], forward[1], forward[0]] : forward;
  const target = curve[3];

  let shaft = curve; let tangent = cubicTangent(curve, 1); let tip = target; let marker = '';
  if (end === 'arrow') {
    // The shaft stops just inside the solid part of the head, and the head is built on the tangent there.
    const inset = HEAD_LENGTH - HEAD_NOTCH - HEAD_OVERLAP;
    let lo = 0; let hi = 1;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; const p = cubicAt(curve, mid); if (Math.hypot(p.x - target.x, p.y - target.y) > inset) lo = mid; else hi = mid; }
    shaft = cubicUntil(curve, lo); tangent = cubicTangent(curve, lo);
    tip = vAdd(shaft[3], tangent, inset);
    const base = vAdd(tip, tangent, -HEAD_LENGTH); const normal = { x: -tangent.y, y: tangent.x };
    marker = `M${fmt(tip)}L${fmt(vAdd(base, normal, HEAD_HALF_WIDTH))}L${fmt(vAdd(base, tangent, HEAD_NOTCH))}L${fmt(vAdd(base, normal, -HEAD_HALF_WIDTH))}Z`;
  } else if (end === 'bar') {
    const normal = { x: -tangent.y, y: tangent.x };
    marker = `M${fmt(vAdd(target, normal, BAR_HALF))}L${fmt(vAdd(target, normal, -BAR_HALF))}`;
  }
  let mark = '';
  // A mark needs clear shaft on both sides; on a stub it would collide with the head, so it is left out.
  if (options.mark === 'cross' && cubicLength(shaft) >= MARK_MIN_SHAFT) {
    const centre = cubicAt(shaft, .5); const t = cubicTangent(shaft, .5); const n = { x: -t.y, y: t.x };
    const d1 = vUnit(vAdd(t, n)); const d2 = vUnit(vSub(t, n));
    mark = `M${fmt(vAdd(centre, d1, -CROSS_ARM))}L${fmt(vAdd(centre, d1, CROSS_ARM))}M${fmt(vAdd(centre, d2, -CROSS_ARM))}L${fmt(vAdd(centre, d2, CROSS_ARM))}`;
  }
  const length = cubicLength(shaft);
  const geometry: ActionArrowGeometry = {
    shaft: `M${fmt(shaft[0])}C${fmt(shaft[1])} ${fmt(shaft[2])} ${fmt(shaft[3])}`,
    head: marker, mark,
    controls: shaft.map(p => ({ x: r2(p.x), y: r2(p.y) })) as ActionArrowGeometry['controls'],
    tip: { x: r2(tip.x), y: r2(tip.y) }, tangent: { x: Math.round(tangent.x * 1e4) / 1e4 + 0, y: Math.round(tangent.y * 1e4) / 1e4 + 0 }, length: r2(length),
  };
  if (options.variant === 'dashed') {
    // Whole dashes only: n dashes and n - 1 gaps fill the shaft exactly.
    const n = Math.max(2, Math.round((length + DASH_GAP) / (DASH + DASH_GAP)));
    geometry.dash = [DASH, r2(Math.max(.5, (length - n * DASH) / (n - 1)))];
  }
  return geometry;
}

/** A generic directed arrow from `from` to `to` (or back, with `reverse`), drawn in `currentColor`. */
export function renderActionArrow(from: ArrowPoint, to: ArrowPoint, options: ActionArrowOptions = {}): string {
  const g = actionArrowGeometry(from, to, options);
  const variant = options.variant ?? 'solid'; const end = options.end ?? 'arrow';
  const classes = ['mm-action', `mm-action--${variant}`, `mm-action--end-${end}`, options.draw ? 'mm-action--draw' : '', options.className ?? ''].filter(Boolean).join(' ');
  const dash = g.dash ? ` style="stroke-dasharray:${g.dash[0]} ${g.dash[1]}"` : '';
  const draw = options.draw && !g.dash ? ' pathLength="1"' : '';
  const marker = g.head ? `<path class="mm-action__${end === 'arrow' ? 'head' : 'bar'}" d="${g.head}"/>` : '';
  const mark = g.mark ? `<path class="mm-action__mark" d="${g.mark}"/>` : '';
  return `<g class="${classes}" aria-hidden="true"><path class="mm-action__shaft" d="${g.shaft}"${dash}${draw}/>${mark}${marker}</g>`;
}

/**
 * How each catalogued action kind is drawn: the only place where an action's meaning becomes arrow
 * style. Transformations are solid arrows, recruitment is a dashed relation, inhibition ends in a bar
 * and cleavage carries a cut mark across the shaft.
 */
export const ACTION_VISUAL_STYLES: Readonly<Record<ActionVisualKind, Pick<ActionArrowOptions, 'variant' | 'end' | 'mark'>>> = {
  bind: {}, unbind: {}, dimerize: {}, activate: {}, modify: {}, ligate: {}, synthesize: {}, degrade: {}, translocate: {},
  polymerize: {}, unwind: {}, elongate: {}, 'conformational-change': {},
  // A recruit action is the partner's motion, a transformation: solid. The recruitment relation itself is
  // the dashed directed interaction drawn alongside, so motion and relation never share a style.
  recruit: {}, inhibit: { end: 'bar' }, cleave: { mark: 'cross' },
};

/** Backwards-compatible: an action arrow styled by kind. Geometry options (gaps, curvature, reverse, draw) pass through. */
export function renderActionVisual(kind: ActionVisualKind, from: ArrowPoint, to: ArrowPoint, options: Omit<ActionArrowOptions, 'variant' | 'end' | 'mark'> = {}): string {
  return renderActionArrow(from, to, { ...options, ...ACTION_VISUAL_STYLES[kind], className: [`mm-action--${kind}`, options.className].filter(Boolean).join(' ') });
}

/** Action arrows. */
export const actionCss = `.mm-action{color:var(--mm-action,currentColor);opacity:.86}.mm-action path{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.mm-action .mm-action__head{fill:currentColor;stroke-width:.8}.mm-action .mm-action__bar{stroke-width:2.6}.mm-action .mm-action__mark{stroke-width:2.4}.mm-action--inhibit{color:#e5484d;opacity:1}.mm-action--draw .mm-action__shaft[pathLength]{stroke-dasharray:1 2;animation:mm-action-draw .7s cubic-bezier(.3,.7,.3,1) both}.mm-action--draw .mm-action__head,.mm-action--draw .mm-action__bar,.mm-action--draw .mm-action__mark,.mm-action--draw.mm-action--dashed .mm-action__shaft{animation:mm-action-reveal .7s ease-out both}@keyframes mm-action-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}@keyframes mm-action-reveal{0%,55%{opacity:0}100%{opacity:1}}@media(prefers-reduced-motion:reduce){.mm-action *{animation:none!important}}`;
