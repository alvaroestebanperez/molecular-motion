// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
import { buildSvgScene, molecularMotionCss, renderSvg } from '@molecular-motion/svg';
import { patchSvg } from '../src/patch';
import { firstAppearances, upcomingActors } from '../src/player';

const mechanism = compileMechanism(parseMechanism(readFileSync('examples/parp1-ssb-repair.yaml', 'utf8')));
const markup = (step: string, ghosts: string[] = []) => renderSvg(buildSvgScene(mechanism.at(step), { ghosts }), { idPrefix: 'p' });

describe('patchSvg', () => {
  let container: HTMLDivElement;
  beforeEach(() => { vi.useFakeTimers(); container = document.createElement('div'); document.body.append(container); });
  afterEach(() => { vi.useRealTimers(); container.remove(); });

  it('keeps DOM nodes for persistent elements so CSS transitions can animate them', () => {
    patchSvg(container, markup('binding', ['nad']));
    const svg = container.firstElementChild;
    const parp1 = container.querySelector('[data-key="actor:parp1"]');
    const ghost = container.querySelector('[data-key="actor:nad"]');
    expect(ghost?.getAttribute('class')).toContain('mm-actor--ghost');

    patchSvg(container, markup('activation'));
    expect(container.firstElementChild).toBe(svg);
    expect(container.querySelector('[data-key="actor:parp1"]')).toBe(parp1);
    // The upcoming actor becomes real in place: same node, ghost class removed.
    expect(container.querySelector('[data-key="actor:nad"]')).toBe(ghost);
    expect(ghost?.getAttribute('class')).not.toContain('mm-actor--ghost');
    expect(parp1?.getAttribute('data-activity')).toBe('active');
  });

  it('fades out removed elements before detaching them', () => {
    patchSvg(container, markup('excision'));
    const ogg1 = container.querySelector('[data-key="actor:ogg1"]')!;
    patchSvg(container, markup('binding'));
    expect(ogg1.isConnected).toBe(true);
    expect(ogg1.classList.contains('mm-exit')).toBe(true);
    expect(ogg1.hasAttribute('data-key')).toBe(false);
    vi.advanceTimersByTime(500);
    expect(ogg1.isConnected).toBe(false);
  });

  it('marks new elements as entering and preserves document order', () => {
    patchSvg(container, markup('intact'));
    patchSvg(container, markup('excision'));
    const added = container.querySelector('[data-key="actor:ogg1"]')!;
    expect(added.classList.contains('mm-enter')).toBe(true);
    const keys = [...container.querySelectorAll('[data-layer="actors"] > [data-key]')].map(element => element.getAttribute('data-key'));
    const fresh = document.createElement('div');
    patchSvg(fresh, markup('excision'));
    expect(keys).toEqual([...fresh.querySelectorAll('[data-layer="actors"] > [data-key]')].map(element => element.getAttribute('data-key')));
  });

  it('ends in the same DOM as a fresh render, whatever the path', () => {
    for (const path of [['intact', 'repaired'], ['repaired', 'scaffold'], ['ligation', 'intact', 'scaffold']]) {
      const walked = document.createElement('div');
      for (const step of path) { patchSvg(walked, markup(step)); vi.advanceTimersByTime(500); }
      const fresh = document.createElement('div');
      patchSvg(fresh, markup(path.at(-1)!));
      walked.querySelectorAll('.mm-enter').forEach(element => element.classList.remove('mm-enter'));
      expect(walked.innerHTML).toBe(fresh.innerHTML);
    }
  });

  it('adds a layer that only some steps have in its place, and removes it when it is gone', () => {
    const hr = compileMechanism(parseMechanism(readFileSync('examples/homologous-recombination.yaml', 'utf8')));
    const step = (id: string) => renderSvg(buildSvgScene(hr.at(id)), { idPrefix: 'p' });
    const layers = () => [...container.querySelectorAll('svg > [data-layer]')].map(element => element.getAttribute('data-layer'));
    patchSvg(container, step('filament'));
    expect(layers()).toEqual(['defs', 'acids', 'connections', 'actors', 'labels']);
    // Strands pair across the two molecules: the layer appears between the molecules and what sits on them.
    patchSvg(container, step('invasion'));
    expect(layers()).toEqual(['defs', 'footprints', 'acids', 'pairings', 'connections', 'actors', 'labels']);
    const pairing = container.querySelector('[data-key^="pairing:"]')!;
    // The pairing grows by synthesis: the same element, redrawn.
    patchSvg(container, step('synthesis'));
    expect(container.querySelector('[data-key^="pairing:"]')).toBe(pairing);
    expect(pairing.innerHTML).toContain('mm-dna__nascent');
    // Unpaired: the strand fades out and the layer goes with it.
    patchSvg(container, step('displacement'));
    expect(pairing.classList.contains('mm-exit')).toBe(true);
    expect(layers()).toEqual(['defs', 'acids', 'connections', 'actors', 'labels']);
    vi.advanceTimersByTime(500);
    expect(pairing.isConnected).toBe(false);
    container.querySelectorAll('.mm-enter').forEach(element => element.classList.remove('mm-enter'));
    const fresh = document.createElement('div');
    patchSvg(fresh, step('displacement'));
    expect(container.innerHTML).toBe(fresh.innerHTML);
  });

  describe('a kept element that changes place in its layer (ghost → present)', () => {
    // happy-dom has no animation engine, so the intermediate state is pinned at its source: patchSvg must
    // start, on the same node, an animation from the look the element had. `npm run check:browser`
    // samples the real mid-transition values in Chrome.
    const hr = compileMechanism(parseMechanism(readFileSync('examples/homologous-recombination.yaml', 'utf8')));
    const appearances = firstAppearances(hr);
    const step = (id: string) => { const index = hr.definition.steps.findIndex(item => item.id === id); return renderSvg(buildSvgScene(hr.at(index), { ghosts: upcomingActors(appearances, index) }), { idPrefix: 'p' }); };
    type Call = { element: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions };
    let calls: Call[];
    let duration: string;
    const prototype = Element.prototype as unknown as { animate?: unknown; getAnimations?: unknown };
    const original = { animate: prototype.animate, getAnimations: prototype.getAnimations, getComputedStyle: window.getComputedStyle };

    beforeEach(() => {
      calls = []; duration = '0.8s, 0.6s, 0.6s';
      prototype.animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) { calls.push({ element: this, keyframes, options }); return { id: options.id, cancel() {} }; };
      prototype.getAnimations = () => [];
      // What a browser reports: the stylesheet's transitions, and the element's look read from its own markup.
      window.getComputedStyle = ((element: Element) => {
        const ghost = element.classList.contains('mm-actor--ghost') || element.classList.contains('mm-label--ghost');
        const values: Record<string, string> = {
          transform: /transform:([^;]+)/.exec(element.getAttribute('style') ?? '')?.[1] ?? 'none', opacity: ghost ? '0.26' : '1', filter: ghost && element.classList.contains('mm-actor') ? 'blur(2.2px)' : 'none',
        };
        return { transitionProperty: 'transform, opacity, filter', transitionDuration: duration, transitionTimingFunction: 'cubic-bezier(0.22, 0.7, 0.2, 1), ease, ease', getPropertyValue: (name: string) => values[name] ?? '' };
      }) as unknown as typeof window.getComputedStyle;
    });
    afterEach(() => { prototype.animate = original.animate; prototype.getAnimations = original.getAnimations; window.getComputedStyle = original.getComputedStyle; });

    it('keeps its node and resumes position, opacity and blur from where it was', () => {
      patchSvg(container, step('invasion'));
      const pold = container.querySelector('[data-key="actor:pold"]')!;
      const ghostStyle = pold.getAttribute('style')!;
      expect(pold.classList.contains('mm-actor--ghost')).toBe(true);
      patchSvg(container, step('synthesis'));
      // Same node, now present, and moved within the layer: this is the case a browser would not animate.
      expect(container.querySelector('[data-key="actor:pold"]')).toBe(pold);
      expect(pold.classList.contains('mm-actor--ghost')).toBe(false);
      const started = calls.filter(call => call.element === pold);
      expect(started.map(call => [Object.keys(call.keyframes[0]!).filter(key => key !== 'offset')[0], call.options.duration, call.options.easing])).toEqual([
        ['transform', 800, 'cubic-bezier(0.22, 0.7, 0.2, 1)'], ['opacity', 600, 'ease'], ['filter', 600, 'ease'],
      ]);
      // Each starts from the ghost's look and has no end of its own: it runs towards the element's style.
      expect(started.map(call => call.keyframes)).toEqual([
        [{ transform: /transform:([^;]+)/.exec(ghostStyle)![1], offset: 0 }], [{ opacity: '0.26', offset: 0 }], [{ filter: 'blur(2.2px)', offset: 0 }],
      ]);
      expect(started.every(call => call.options.id === 'mm-resume')).toBe(true);
    });

    it('leaves elements that stay in place to the stylesheet, and new ones to their fade-in', () => {
      patchSvg(container, step('invasion'));
      const rpa = container.querySelector('[data-key="actor:rpa#4"]')!;
      patchSvg(container, step('synthesis'));
      expect(container.querySelector('[data-key="actor:rpa#4"]')).toBe(rpa);
      expect(calls.filter(call => call.element === rpa)).toEqual([]);
      expect(calls.every(call => !call.element.classList.contains('mm-enter'))).toBe(true);
    });

    it('starts nothing when the stylesheet transitions nothing (reduced motion)', () => {
      duration = '0s, 0s, 0s';
      patchSvg(container, step('invasion'));
      patchSvg(container, step('synthesis'));
      expect(calls).toEqual([]);
      expect(container.querySelector('[data-key="actor:pold"]')!.classList.contains('mm-actor--ghost')).toBe(false);
    });

    it('blurs a ghost through a style that can be interpolated', () => {
      expect(molecularMotionCss).toContain('.mm-actor--ghost{filter:blur(2.2px)}');
      expect(molecularMotionCss).toMatch(/\.mm-actor,\.mm-label\{transition:[^}]*filter/);
      // The static `filter` attribute on the inner group is overridden, so the blur is not applied twice.
      expect(molecularMotionCss).toContain('.mm-actor--ghost .mm-actor__inner{filter:none}');
    });
  });
});
