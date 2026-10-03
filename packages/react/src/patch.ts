const EXIT_MS = 450;

/**
 * Update an SVG rendered by `renderSvg` in place. Children of each `data-layer` group are matched
 * by `data-key`: persistent elements keep their DOM node (so CSS transitions animate transform and
 * opacity), new ones fade in, and removed ones fade out before being detached.
 */
export function patchSvg(container: HTMLElement, markup: string): void {
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
  // Some layers exist only in some steps (pairings between molecules). A layer that appears is put
  // where a fresh render has it, so stacking order holds; one that is gone empties out and is removed.
  let cursor: Element | null = null;
  for (const child of Array.from(next.children)) {
    const layer = child.getAttribute('data-layer');
    let target = layer ? current.querySelector(`:scope > [data-layer="${layer}"]`) : current.querySelector(`:scope > ${child.tagName}`);
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
  for (const stale of Array.from(current.querySelectorAll(':scope > [data-layer]'))) {
    if (next.querySelector(`:scope > [data-layer="${stale.getAttribute('data-layer')}"]`)) continue;
    reconcile(stale, document.createElement('g'));
    stale.removeAttribute('data-layer');
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
    const reference: ChildNode | null = cursor ? cursor.nextSibling : target.firstChild;
    if (reference !== element) target.insertBefore(element, reference);
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

function syncAttributes(target: Element, source: Element) {
  const entering = target.classList.contains('mm-enter');
  for (const { name } of Array.from(target.attributes)) if (!source.hasAttribute(name)) target.removeAttribute(name);
  for (const { name, value } of Array.from(source.attributes)) if (target.getAttribute(name) !== value) target.setAttribute(name, value);
  if (entering) target.classList.add('mm-enter');
}
