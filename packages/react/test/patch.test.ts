// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
import { buildSvgScene, renderSvg } from '@molecular-motion/svg';
import { patchSvg } from '../src/patch';

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
    expect(layers()).toEqual(['defs', 'acids', 'pairings', 'connections', 'actors', 'labels']);
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
});
