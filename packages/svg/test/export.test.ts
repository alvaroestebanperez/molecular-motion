// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
import { buildSvgScene, exportPng, exportSvg, molecularMotionCss, renderSvg, THEME_TOKENS } from '../src';

const hr = compileMechanism(parseMechanism(readFileSync(resolve(process.cwd(), 'examples/homologous-recombination.yaml'), 'utf8')));
const scene = buildSvgScene(hr.at(hr.length - 1));
const parse = (markup: string) => new DOMParser().parseFromString(markup, 'image/svg+xml');

describe('exportSvg', () => {
  it('is a standalone, well-formed SVG file with styles embedded and an explicit size', () => {
    const file = exportSvg(scene, { scale: 2 });
    expect(file.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg width="1920" height="1080" data-theme="light" class="mm-svg mm-export"')).toBe(true);
    expect(file).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(file).toContain(`<style>${molecularMotionCss.replace(/&/g, '&amp;').replace(/</g, '&lt;')}`);
    const document = parse(file);
    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.documentElement.tagName.toLowerCase()).toBe('svg');
    // Entities decode back to the exact stylesheet.
    expect(document.querySelector('style')!.textContent!.startsWith(molecularMotionCss)).toBe(true);
  });

  it('resolves the theme instead of leaving it to the viewer, and fills the background', () => {
    expect(exportSvg(scene, { theme: 'dark' })).toContain(`svg.mm-svg.mm-export{${THEME_TOKENS.dark};width:auto;height:auto}`);
    expect(exportSvg(scene)).toContain(`svg.mm-svg.mm-export{${THEME_TOKENS.light};`);
    expect(exportSvg(scene)).toContain('<rect class="mm-export__background" x="0" y="0" width="960" height="540" fill="var(--mm-canvas)"/>');
    expect(exportSvg(scene, { background: '#ffffff' })).toContain('fill="#ffffff"/>');
    expect(exportSvg(scene, { background: false })).not.toContain('mm-export__background');
  });

  it('is static: no interactive roles, animations frozen in their final state', () => {
    const file = exportSvg(scene);
    expect(renderSvg(scene)).toContain('role="button"');
    expect(file).not.toContain('role="button"');
    expect(file).not.toContain('tabindex');
    expect(file).toContain('.mm-export *{animation:none!important;transition:none!important}');
  });

  it('keeps title and description first, and leaves the interactive render untouched', () => {
    const file = exportSvg(scene);
    expect(file).toMatch(/<svg[^>]*><title id="mm-title">RAD51 filament formation<\/title><desc id="mm-description">[^<]*<\/desc><style>/);
    expect(renderSvg(scene)).not.toContain('mm-export');
    expect(exportSvg(scene)).toBe(exportSvg(scene));
  });

  it('exports thumbnails cropped to the action', () => {
    const file = exportSvg(scene, { compact: true });
    const [, , width, height] = file.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number);
    expect(file).toContain(`width="${Math.round(width!)}" height="${Math.round(height!)}"`);
    expect(width! / height!).toBeCloseTo(2, 1);
  });
});

describe('exportPng', () => {
  it('refuses SVGs without a pixel size', async () => {
    await expect(exportPng(renderSvg(scene))).rejects.toThrow(/expects an SVG from exportSvg/);
  });

  it('draws the SVG at its pixel size times the pixel ratio, encodes a PNG and releases the URL', async () => {
    // Real rasterisation needs a browser; these doubles check the size, the flow and the clean-up.
    const drawn: number[][] = [];
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ drawImage: (_image: unknown, ...box: number[]) => drawn.push(box) }),
      toBlob: (done: (blob: Blob) => void, type: string) => done(new Blob(['png'], { type })),
    };
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => tag === 'canvas' ? canvas : create(tag)) as typeof document.createElement);
    vi.stubGlobal('Image', class { onload?: () => void; set src(_url: string) { queueMicrotask(() => this.onload?.()); } });
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const blob = await exportPng(exportSvg(scene, { scale: 1.5 }), { pixelRatio: 3 });
    expect(blob.type).toBe('image/png');
    expect([canvas.width, canvas.height]).toEqual([4320, 2430]);
    expect(drawn).toEqual([[0, 0, 4320, 2430]]);
    expect(revoke).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

describe('exportSvg keeps callouts the viewer lets overflow', () => {
  const edge = buildSvgScene(compileMechanism({
    schemaVersion: 4, mechanism: { id: 'x', name: 'X' },
    actors: [{ id: 'kinase', type: 'protein', label: 'A protein with a long name', position: { x: 930, y: 60 } }],
    steps: [{ id: 's', title: 'S', actions: [{ type: 'show', actor: 'kinase' }] }],
  }).at(0));
  const box = (file: string) => file.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number) as [number, number, number, number];

  it('grows the viewBox (never shrinks it) to contain every callout, and sizes the file to match', () => {
    const pill = renderSvg(edge).match(/data-key="label:kinase" style="transform:translate\(([\d.]+)px,([\d.]+)px\)[^>]*>.*?<rect class="mm-pill" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)"/)!.slice(1).map(Number);
    const [tx, ty, rx, ry, rw] = pill as [number, number, number, number, number];
    // The callout really overflows the canvas (above it), so the check below is not vacuous.
    expect(ty + ry).toBeLessThan(0);
    const [x, y, width, height] = box(exportSvg(edge));
    expect(y).toBeLessThan(0);
    expect(x).toBeLessThanOrEqual(Math.min(0, tx + rx));
    expect(y).toBeLessThanOrEqual(Math.min(0, ty + ry));
    expect(x + width).toBeGreaterThanOrEqual(Math.max(960, tx + rx + rw));
    expect(y + height).toBeGreaterThanOrEqual(540);
    expect(exportSvg(edge)).toContain(`width="${Math.round(width)}" height="${Math.round(height)}"`);
    expect(exportSvg(edge)).toContain(`<rect class="mm-export__background" x="${x}" y="${y}" width="${width}" height="${height}"`);
  });

  it('leaves the canvas untouched when every callout fits', () => {
    expect(box(exportSvg(scene))).toEqual([0, 0, 960, 540]);
  });
});
