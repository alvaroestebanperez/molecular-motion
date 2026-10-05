// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileMechanism } from '@molecular-motion/core';
import { parseMechanism } from '@molecular-motion/core/yaml';
import { buildSvgScene, geometryFrame, interpolateGeometry, renderSvg, type GeometryFrame } from '@molecular-motion/svg';
import { animateGeometry, applyGeometryFrame, cubicBezier, motionTiming, NUCLEIC_LAYERS } from '../src/animate';
import { patchSvg } from '../src/patch';

const hr = compileMechanism(parseMechanism(readFileSync('examples/homologous-recombination.yaml', 'utf8')));
const scene = (id: string) => buildSvgScene(hr.at(id));
const markup = (id: string) => renderSvg(scene(id), { idPrefix: 'p' });
const frame = (id: string) => geometryFrame(scene(id));
const linear = { duration: 800, ease: (t: number) => t };

/** Elements in order with their attributes and text: what is structurally there, whatever the attribute order. */
function structure(node: Element): string {
  const attributes = Array.from(node.attributes).map(({ name, value }) => ` ${name}=${JSON.stringify(value)}`).sort().join('');
  return `<${node.tagName}${attributes}>${Array.from(node.childNodes).map(child => child.nodeType === 1 ? structure(child as Element) : child.textContent ?? '').join('')}</${node.tagName}>`;
}
const layer = (svg: Element, name: string) => Array.from(svg.children).find(child => child.getAttribute('data-layer') === name);
const nucleic = (svg: Element) => NUCLEIC_LAYERS.map(name => { const found = layer(svg, name); return found ? structure(found) : ''; }).join('');

describe('drawing a frame in place (ADR 0001 §5)', () => {
  let container: HTMLDivElement;
  let svg: Element;
  beforeEach(() => { vi.useFakeTimers(); container = document.createElement('div'); patchSvg(container, markup('invasion')); svg = container.firstElementChild!; });
  afterEach(() => { vi.useRealTimers(); });

  it('prolongs a growing strand on the same <path> elements', () => {
    const pairing = svg.querySelector('[data-key^="pairing:"]')!;
    const tube = pairing.querySelector('.mm-dna__tube')!;
    const backbone = svg.querySelector('[data-key="acid:sister"] .mm-dna__tube')!;
    const before = tube.getAttribute('d')!;
    applyGeometryFrame(svg, interpolateGeometry(frame('invasion'), frame('synthesis'), .5), 'p');
    // Same nodes, new geometry: nothing was replaced.
    expect(svg.querySelector('[data-key^="pairing:"]')).toBe(pairing);
    expect(pairing.querySelector('.mm-dna__tube')).toBe(tube);
    expect(svg.querySelector('[data-key="acid:sister"] .mm-dna__tube')).toBe(backbone);
    expect(tube.getAttribute('d')).not.toBe(before);
    // The new tract did not exist before: its path is added once, and then it is that same path that grows.
    const nascent = pairing.querySelector('.mm-dna__nascent')!;
    const half = nascent.getAttribute('d')!;
    applyGeometryFrame(svg, interpolateGeometry(frame('invasion'), frame('synthesis'), .8), 'p');
    expect(pairing.querySelector('.mm-dna__nascent')).toBe(nascent);
    expect(nascent.getAttribute('d')!.length).toBeGreaterThan(half.length);
  });

  it('draws the destination exactly as a clean render does', () => {
    applyGeometryFrame(svg, frame('synthesis'), 'p');
    const clean = document.createElement('div');
    patchSvg(clean, markup('synthesis'));
    expect(nucleic(svg)).toBe(nucleic(clean.firstElementChild!));
  });

  it('creates the pairing layer where a clean render has it, and empties it when nothing is paired', () => {
    patchSvg(container, markup('filament'));
    vi.advanceTimersByTime(1000);
    expect(layer(svg, 'pairings')).toBeUndefined();
    applyGeometryFrame(svg, interpolateGeometry(frame('engagement'), frame('invasion'), .5), 'p');
    expect(Array.from(svg.children).map(child => child.getAttribute('data-layer')).filter(Boolean)).toEqual(['defs', 'acids', 'pairings', 'connections', 'actors', 'labels']);
    applyGeometryFrame(svg, frame('engagement'), 'p');
    expect(layer(svg, 'pairings')!.children).toHaveLength(0);
  });
});

describe('a transition and its interruption (ADR 0001 §3.1)', () => {
  let container: HTMLDivElement;
  let svg: Element;
  beforeEach(() => { vi.useFakeTimers(); container = document.createElement('div'); patchSvg(container, markup('invasion')); svg = container.firstElementChild!; });
  afterEach(() => { vi.useRealTimers(); });
  /** One animation frame of 100 ms. */
  const tick = (times = 1) => { for (let index = 0; index < times; index += 1) vi.advanceTimersByTime(100); };

  it('runs from the origin to the destination, and what is left is a clean render', () => {
    const done = vi.fn();
    patchSvg(container, markup('synthesis'), { keep: NUCLEIC_LAYERS });
    const origin = frame('invasion');
    const animation = animateGeometry(svg, origin, frame('synthesis'), 'p', linear, done);
    const pairing = svg.querySelector('[data-key^="pairing:"]')!;
    // The first frame is the origin itself.
    vi.advanceTimersToNextFrame();
    expect(animation.frame()).toBe(origin);
    tick(5);
    const midway = animation.frame();
    expect(midway.pairings[0]!.segments[0]!.traveller.from).toBeGreaterThan(22);
    expect(midway.pairings[0]!.segments[0]!.traveller.from).toBeLessThan(40);
    expect(done).not.toHaveBeenCalled();
    tick(6);
    expect(done).toHaveBeenCalledTimes(1);
    // Settling with a full patch changes nothing in the nucleic layers and keeps the same elements.
    const drawn = nucleic(svg);
    patchSvg(container, markup('synthesis'));
    vi.advanceTimersByTime(1000);
    expect(nucleic(svg)).toBe(drawn);
    expect(svg.querySelector('[data-key^="pairing:"]')).toBe(pairing);
    const clean = document.createElement('div');
    patchSvg(clean, markup('synthesis'));
    expect(structure(svg)).toBe(structure(clean.firstElementChild!));
  });

  it('leaves the animated layers alone while everything else is patched', () => {
    const before = nucleic(svg);
    patchSvg(container, markup('synthesis'), { keep: NUCLEIC_LAYERS });
    expect(nucleic(svg)).toBe(before);
    expect(svg.querySelector('title')!.textContent).toBe('Synthesis on the sister chromatid');
  });

  it('interrupted at an intermediate t, the new transition starts on exactly the frame that was visible', () => {
    const first = animateGeometry(svg, frame('invasion'), frame('synthesis'), 'p', linear, () => {});
    tick(4);
    const shown: GeometryFrame = first.frame();
    const visible = nucleic(svg);
    const nodes = Array.from(svg.querySelectorAll('[data-layer="pairings"] path'));
    first.cancel();
    // Neither a step nor a clean render: the strand is part of the way there.
    expect(shown).not.toBe(frame('invasion'));
    expect(visible).not.toBe(nucleic((() => { const clean = document.createElement('div'); patchSvg(clean, markup('invasion')); return clean.firstElementChild!; })()));

    const done = vi.fn();
    const second = animateGeometry(svg, shown, frame('invasion'), 'p', linear, done);
    vi.advanceTimersToNextFrame();
    // First frame of the new transition: the same values, the same markup, the same elements.
    expect(second.frame()).toBe(shown);
    expect(nucleic(svg)).toBe(visible);
    expect(Array.from(svg.querySelectorAll('[data-layer="pairings"] path'))).toEqual(nodes);
    // It then moves away from there, continuously, and arrives.
    vi.advanceTimersToNextFrame();
    const next = second.frame();
    const reach = (item: GeometryFrame) => item.pairings[0]!.segments[0]!.traveller.from;
    expect(reach(next)).toBeGreaterThan(reach(shown));
    expect(reach(next) - reach(shown)).toBeLessThan(3);
    tick(10);
    expect(done).toHaveBeenCalledTimes(1);
    expect(second.frame()).toEqual(frame('invasion'));
  });

  it('a cancelled transition draws nothing more', () => {
    const done = vi.fn();
    const animation = animateGeometry(svg, frame('invasion'), frame('synthesis'), 'p', linear, done);
    tick(3);
    animation.cancel();
    const frozen = nucleic(svg);
    tick(20);
    expect(nucleic(svg)).toBe(frozen);
    expect(done).not.toHaveBeenCalled();
  });
});

describe('timing comes from the stylesheet (ADR 0001 §6)', () => {
  const original = window.getComputedStyle;
  afterEach(() => { window.getComputedStyle = original; });
  const withStyle = (transitionDuration: string, transitionTimingFunction: string) => {
    window.getComputedStyle = (() => ({ transitionDuration, transitionTimingFunction })) as unknown as typeof window.getComputedStyle;
    const container = document.createElement('div');
    patchSvg(container, markup('invasion'));
    return motionTiming(container.firstElementChild!);
  };

  it('reads duration and easing, and reports no motion when the stylesheet has none', () => {
    const timing = withStyle('0.8s', 'cubic-bezier(0.22, 0.7, 0.2, 1)');
    expect(timing.duration).toBe(800);
    expect(timing.ease(0)).toBe(0);
    expect(timing.ease(1)).toBe(1);
    expect(timing.ease(.5)).toBeGreaterThan(.8);
    expect(withStyle('0s', 'ease').duration).toBe(0);
    expect(withStyle('250ms, 1s', 'linear, ease').duration).toBe(250);
    expect(withStyle('250ms', 'linear').ease(.3)).toBeCloseTo(.3);
  });

  it('follows the curve the browser would', () => {
    const ease = cubicBezier(.25, .1, .25, 1);
    expect(ease(.25)).toBeCloseTo(.4085, 3);
    expect(ease(.5)).toBeCloseTo(.8024, 3);
  });
});
