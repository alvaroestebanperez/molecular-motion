const EXIT_MS = 450;
/** Marks the animations `patchSvg` starts itself, so a later patch can replace them. */
const RESUMED = 'mm-resume';

/**
 * Update an SVG rendered by `renderSvg` in place. Children of each `data-layer` group are matched
 * by `data-key`: persistent elements keep their DOM node (so CSS transitions animate transform and
 * opacity), new ones fade in, and removed ones fade out before being detached.
 *
 * Layers named in `keep` are left exactly as they are: something else is drawing them (the geometry
 * animator, ADR 0001), and a later call without `keep` settles them.
 */
export function patchSvg(container: HTMLElement, markup: string, options: { keep?: readonly string[] } = {}): void {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const next = template.content.firstElementChild;
  const current = container.firstElementChild;
  if (!next) { container.replaceChildren(); return; }
  if (!current || current.tagName !== next.tagName || current.getAttribute('viewBox') !== next.getAttribute('viewBox')) {
    container.replaceChildren(document.importNode(next, true));
    return;
  }

  syncAttributes(current, next);
  // Top-level children are matched by `data-layer`, or by tag name when they have none (title, desc).
  // Matching walks the children directly instead of running selectors against the long-lived tree.
  const slot = (element: Element) => element.getAttribute('data-layer') ?? `<${element.tagName}>`;
  const present = new Map(Array.from(current.children).filter(child => !child.hasAttribute('data-leaving')).map(child => [slot(child), child]));
  // Some layers exist only in some steps (pairings between molecules). A layer that appears is put
  // where a fresh render has it, so stacking order holds; one that is gone empties out and is removed.
  let cursor: Element | null = null;
  for (const child of Array.from(next.children)) {
    const layer = child.getAttribute('data-layer');
    let target = present.get(slot(child));
    present.delete(slot(child));
    if (layer && options.keep?.includes(layer)) { if (target) cursor = target; continue; }
    if (!target) {
      target = document.importNode(child, false);
      current.insertBefore(target, cursor ? cursor.nextSibling : current.firstChild);
    }
    cursor = target;
    if (!layer || layer === 'defs') {
      syncAttributes(target, child);
      if (target.innerHTML !== child.innerHTML) target.innerHTML = child.innerHTML;
      continue;
    }
    reconcile(target, child);
  }
  for (const stale of present.values()) {
    if (options.keep?.includes(stale.getAttribute('data-layer') ?? '')) continue;
    // Nothing in it to fade out (the animator already emptied it): it goes at once.
    if (!stale.hasAttribute('data-layer') || !stale.children.length) { stale.remove(); continue; }
    reconcile(stale, document.createElement('g'));
    stale.removeAttribute('data-layer');
    stale.setAttribute('data-leaving', '');
    window.setTimeout(() => stale.remove(), EXIT_MS);
  }
}

function reconcile(target: Element, source: Element) {
  const existing = new Map<string, Element>();
  for (const element of Array.from(target.children)) {
    const key = element.getAttribute('data-key');
    if (key && !element.classList.contains('mm-exit')) existing.set(key, element);
  }
  let cursor: Element | null = null;
  for (const incoming of Array.from(source.children)) {
    const key = incoming.getAttribute('data-key');
    let element = key ? existing.get(key) : undefined;
    const reference: ChildNode | null = cursor ? cursor.nextSibling : target.firstChild;
    // A kept element that has to change place in the layer is re-inserted, and a browser drops the CSS
    // transitions of a re-inserted node: it would jump. Its look just before is kept to resume from.
    const resume = element && reference !== element ? transitionState(element) : undefined;
    if (element) {
      existing.delete(key!);
      syncAttributes(element, incoming);
      if (element.innerHTML !== incoming.innerHTML) element.innerHTML = incoming.innerHTML;
    } else {
      element = document.importNode(incoming, true);
      element.classList.add('mm-enter');
      const entering = element;
      requestAnimationFrame(() => requestAnimationFrame(() => entering.classList.remove('mm-enter')));
    }
    if (reference !== element) target.insertBefore(element, reference);
    if (resume) resumeTransitions(element, resume);
    cursor = element;
  }
  for (const stale of existing.values()) {
    stale.classList.add('mm-exit');
    stale.removeAttribute('data-key');
    stale.setAttribute('aria-hidden', 'true');
    stale.removeAttribute('tabindex');
    window.setTimeout(() => stale.remove(), EXIT_MS);
  }
}

/** One transitioned property of an element: its value now, and how the stylesheet animates it. */
interface TransitionState { property: string; value: string; duration: number; easing: string }

/** Top-level commas only: `cubic-bezier(.2, .7, .2, 1), ease` is two items. */
const list = (value: string) => value.split(/,(?![^(]*\))/).map(item => item.trim());
const milliseconds = (value: string) => (value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000) || 0;

/**
 * What the stylesheet transitions on an element, with the values it shows right now (mid-transition
 * values included). Empty when nothing is transitioned, as under `prefers-reduced-motion`.
 */
function transitionState(element: Element): TransitionState[] {
  if (typeof window.getComputedStyle !== 'function' || typeof element.animate !== 'function') return [];
  const style = window.getComputedStyle(element);
  const properties = list(style.transitionProperty ?? '');
  const durations = list(style.transitionDuration ?? '');
  const easings = list(style.transitionTimingFunction ?? '');
  return properties.flatMap((property, index) => {
    const duration = milliseconds(durations[index % durations.length] ?? '');
    return property && property !== 'none' && property !== 'all' && duration > 0
      ? [{ property, value: style.getPropertyValue(property), duration, easing: easings[index % easings.length] || 'ease' }]
      : [];
  });
}

/**
 * Play, on a re-inserted element, the transitions it would have had if it had stayed in place: from
 * the look it had to the one it has now, with the stylesheet's own durations and easings.
 */
function resumeTransitions(element: Element, before: readonly TransitionState[]) {
  if (!before.length) return;
  for (const animation of element.getAnimations?.() ?? []) if (animation.id === RESUMED) animation.cancel();
  const style = window.getComputedStyle(element);
  for (const { property, value, duration, easing } of before) {
    if (style.getPropertyValue(property) === value) continue;
    const name = property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    // Only the start is given (a lone keyframe would otherwise be the end): the animation runs towards
    // whatever the element's style says, also if that changes meanwhile.
    element.animate([{ [name]: value, offset: 0 }], { duration, easing, id: RESUMED });
  }
}

function syncAttributes(target: Element, source: Element) {
  const entering = target.classList.contains('mm-enter');
  for (const { name } of Array.from(target.attributes)) if (!source.hasAttribute(name)) target.removeAttribute(name);
  for (const { name, value } of Array.from(source.attributes)) if (target.getAttribute(name) !== value) target.setAttribute(name, value);
  if (entering) target.classList.add('mm-enter');
}
