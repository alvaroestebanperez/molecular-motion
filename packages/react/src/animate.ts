import { interpolateGeometry, nucleicLayerMarkup, type GeometryFrame } from '@molecular-motion/svg';

/**
 * Drives the nucleic layers of a rendered figure from one geometry to another (ADR 0001). It knows two
 * frames and a clock: nothing about steps or the actions between them. Each frame is drawn onto the
 * elements already in the document, so a strand that grows is the same `<path>` getting longer.
 */

/** Layers the animator owns while a transition runs; `patchSvg` leaves them alone meanwhile. */
export const NUCLEIC_LAYERS = ['acids', 'pairings'] as const;

const SVG_NS = 'http://www.w3.org/2000/svg';
const layerOf = (svg: Element, name: string) => Array.from(svg.children).find(child => child.getAttribute('data-layer') === name);
const signature = (element: Element) => `${element.tagName}|${element.getAttribute('data-key') ?? element.getAttribute('class') ?? ''}`;

/** Make `target`'s children those of `source`, reusing every element that plays the same role. */
function syncChildren(target: Element, source: Element): void {
  const spare = Array.from(target.children);
  let cursor: Element | null = null;
  for (const incoming of Array.from(source.children)) {
    const index = spare.findIndex(candidate => signature(candidate) === signature(incoming));
    let element: Element;
    if (index >= 0) {
      [element] = spare.splice(index, 1) as [Element];
      for (const { name } of Array.from(element.attributes)) if (!incoming.hasAttribute(name)) element.removeAttribute(name);
      for (const { name, value } of Array.from(incoming.attributes)) if (element.getAttribute(name) !== value) element.setAttribute(name, value);
      if (incoming.children.length || element.children.length) syncChildren(element, incoming);
      else if (element.textContent !== incoming.textContent) element.textContent = incoming.textContent;
    } else element = document.importNode(incoming, true);
    const reference: ChildNode | null = cursor ? cursor.nextSibling : target.firstChild;
    if (reference !== element) target.insertBefore(element, reference);
    cursor = element;
  }
  for (const stale of spare) stale.remove();
}

/** Draw a frame onto the nucleic layers of `svg`, in place. */
export function applyGeometryFrame(svg: Element, frame: GeometryFrame, idPrefix: string): void {
  const markup = nucleicLayerMarkup(frame, idPrefix);
  const template = document.createElement('template');
  // Parsed inside an <svg> so the elements are SVG elements.
  template.innerHTML = `<svg xmlns="${SVG_NS}">${NUCLEIC_LAYERS.map(name => `<g class="mm-layer" data-layer="${name}">${markup[name]}</g>`).join('')}</svg>`;
  const parsed = template.content.firstElementChild!;
  for (const name of NUCLEIC_LAYERS) {
    const source = layerOf(parsed, name)!;
    let target = layerOf(svg, name);
    if (!target) {
      // A layer only some steps have (pairings): put it where a clean render has it, right after the molecules.
      if (!source.children.length) continue;
      target = document.importNode(source, false);
      const acids = layerOf(svg, 'acids');
      svg.insertBefore(target, acids ? acids.nextSibling : svg.firstChild);
    }
    syncChildren(target, source);
  }
}

// ---- Clock ----

export interface Timing { duration: number; ease(t: number): number }

const KEYWORDS: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1], ease: [.25, .1, .25, 1], 'ease-in': [.42, 0, 1, 1], 'ease-out': [0, 0, .58, 1], 'ease-in-out': [.42, 0, .58, 1],
};

/** A CSS `cubic-bezier(x1, y1, x2, y2)` as a function of time. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const curve = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return t => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let [low, high] = [0, 1];
    for (let round = 0; round < 24; round += 1) { const middle = (low + high) / 2; if (curve(x1, x2, middle) < t) low = middle; else high = middle; }
    return curve(y1, y2, (low + high) / 2);
  };
}

/**
 * How long things take to move and with which easing, read from the stylesheet (the nucleic layer
 * carries the same transition as actors), so strands and proteins start and end together. A duration
 * of 0, as under `prefers-reduced-motion`, means no animation.
 */
export function motionTiming(svg: Element): Timing {
  const layer = layerOf(svg, 'acids');
  const style = layer && typeof window.getComputedStyle === 'function' ? window.getComputedStyle(layer) : undefined;
  const first = (value: string | undefined) => (value ?? '').split(/,(?![^(]*\))/)[0]!.trim();
  const duration = first(style?.transitionDuration);
  const easing = first(style?.transitionTimingFunction);
  const numbers = /cubic-bezier\(([^)]+)\)/.exec(easing)?.[1]?.split(',').map(Number) as [number, number, number, number] | undefined;
  const [x1, y1, x2, y2] = numbers?.length === 4 && numbers.every(Number.isFinite) ? numbers : KEYWORDS[easing] ?? KEYWORDS.linear!;
  return { duration: (duration.endsWith('ms') ? parseFloat(duration) : parseFloat(duration) * 1000) || 0, ease: cubicBezier(x1, y1, x2, y2) };
}

export interface GeometryAnimation {
  /** The frame on screen now: the origin of whatever comes next. */
  frame(): GeometryFrame;
  cancel(): void;
}

/** Animate the nucleic layers from `from` to `to`. `onDone` runs after the last frame, unless cancelled. */
export function animateGeometry(svg: Element, from: GeometryFrame, to: GeometryFrame, idPrefix: string, timing: Timing, onDone: () => void): GeometryAnimation {
  let shown = from;
  let handle = 0;
  let start: number | undefined;
  const tick = (now: number) => {
    start ??= now;
    const t = Math.min(1, (now - start) / timing.duration);
    shown = interpolateGeometry(from, to, timing.ease(t));
    applyGeometryFrame(svg, shown, idPrefix);
    if (t < 1) handle = requestAnimationFrame(tick);
    else onDone();
  };
  handle = requestAnimationFrame(tick);
  return { frame: () => shown, cancel: () => cancelAnimationFrame(handle) };
}
