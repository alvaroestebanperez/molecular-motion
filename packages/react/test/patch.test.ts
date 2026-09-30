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
});
