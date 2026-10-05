// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileMechanism } from '@molecular-motion/core';
import { parseMechanism } from '@molecular-motion/core/yaml';
import { buildSvgScene, renderSvg } from '@molecular-motion/svg';
import { patchSvg } from '../src/patch';
import { firstAppearances, upcomingActors } from '../src/player';

/**
 * The invariant of `patchSvg`: once a transition A → B has finished, the DOM is the one a clean render
 * of B produces. It holds for every pair of steps of every shipped example, rendered the way the viewer
 * renders them (upcoming actors as ghosts), in both canvas sizes, and along chains of steps.
 */
const EXAMPLES = ['parp1-ssb-repair', 'homologous-recombination', 'egfr-dimerization'] as const;
const SIZES = { wide: {}, narrow: { width: 640, height: 620 } } as const;

/**
 * What is structurally relevant: elements in order, with their attributes and text. Attribute order is
 * not (an element kept across steps gains attributes in a different order than a fresh one), nor is the
 * transient marker of an element that has just entered.
 */
function settled(node: Element): string {
  const attributes = Array.from(node.attributes)
    .map(({ name, value }) => [name, name === 'class' ? value.split(/\s+/).filter(token => token && token !== 'mm-enter').join(' ') : value] as const)
    .filter(([name, value]) => name !== 'class' || value)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, value]) => ` ${name}=${JSON.stringify(value)}`).join('');
  const children = Array.from(node.childNodes).map(child => child.nodeType === 1 ? settled(child as Element) : child.textContent ?? '').join('');
  return `<${node.tagName}${attributes}>${children}</${node.tagName}>`;
}

describe.each(EXAMPLES)('patchSvg invariant: %s', name => {
  const mechanism = compileMechanism(parseMechanism(readFileSync(`examples/${name}.yaml`, 'utf8')));
  const appearances = firstAppearances(mechanism);
  const steps = Array.from({ length: mechanism.length }, (_, index) => index);
  // Renders and clean references are computed once per step: the pairs below only pay for the patching.
  const cache = new Map<string, string>();
  const cached = (key: string, make: () => string) => cache.get(key) ?? cache.set(key, make()).get(key)!;
  const markup = (index: number, size: keyof typeof SIZES, selectedActor?: string) => cached(`m|${index}|${size}|${selectedActor ?? ''}`, () =>
    renderSvg(buildSvgScene(mechanism.at(index), { ...SIZES[size], ghosts: upcomingActors(appearances, index) }), { idPrefix: 'p', selectedActor }));
  const clean = (index: number, size: keyof typeof SIZES, selectedActor?: string) => cached(`c|${index}|${size}|${selectedActor ?? ''}`, () => {
    const fresh = document.createElement('div');
    patchSvg(fresh, markup(index, size, selectedActor));
    return settled(fresh);
  });

  // The all-pairs walk patches a few hundred times; it is slow under load, never close to this limit.
  vi.setConfig({ testTimeout: 60_000 });
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it.each(Object.keys(SIZES) as (keyof typeof SIZES)[])('every transition A → B ends as a clean render of B (%s canvas)', size => {
    // One long-lived DOM, as in the viewer: it visits every ordered pair of steps, and is checked after each move.
    const container = document.createElement('div');
    const move = (to: number, from: string) => {
      patchSvg(container, markup(to, size));
      vi.advanceTimersByTime(1000);
      // Compared outside `expect` so a failure reports the pair, not two 50 kB strings.
      if (settled(container) !== clean(to, size)) throw new Error(`${from} → ${mechanism.at(to).step.id} does not end as a clean render`);
    };
    let at = 'nothing';
    for (const from of steps) for (const to of steps) {
      if (from === to) continue;
      move(from, at);
      move(to, mechanism.at(from).step.id);
      at = mechanism.at(to).step.id;
    }
  });

  it('holds along a whole walk, forwards and back, without waiting for exits to finish', () => {
    const container = document.createElement('div');
    for (const index of [...steps, ...steps.slice(0, -1).reverse()]) {
      patchSvg(container, markup(index, 'wide'));
      // The next step arrives while removed elements are still fading out, as when stepping quickly.
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(1000);
    expect(settled(container)).toBe(clean(0, 'wide'));
  });

  it('holds when the transition is interrupted half-way by another one', () => {
    for (const [a, b, c] of steps.slice(2).map(index => [index - 2, index - 1, index] as const)) {
      const container = document.createElement('div');
      patchSvg(container, markup(a, 'wide'));
      patchSvg(container, markup(c, 'wide'));
      vi.advanceTimersByTime(200);
      patchSvg(container, markup(b, 'wide'));
      vi.advanceTimersByTime(1000);
      expect(settled(container), `${a} → ${c} → ${b}`).toBe(clean(b, 'wide'));
    }
  });

  it('holds across a change of canvas size and of selected actor', () => {
    const container = document.createElement('div');
    patchSvg(container, markup(0, 'wide'));
    patchSvg(container, markup(mechanism.length - 1, 'narrow'));
    vi.advanceTimersByTime(1000);
    expect(settled(container)).toBe(clean(mechanism.length - 1, 'narrow'));
    const actor = Object.values(mechanism.at(mechanism.length - 1).actors).find(item => item.present && item.visible)!.id;
    patchSvg(container, markup(mechanism.length - 1, 'narrow', actor));
    vi.advanceTimersByTime(1000);
    expect(settled(container)).toBe(clean(mechanism.length - 1, 'narrow', actor));
  });
});
