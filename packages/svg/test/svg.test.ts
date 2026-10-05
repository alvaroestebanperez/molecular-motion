import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism } from '@molecular-motion/core';
import { parseMechanism } from '@molecular-motion/core/yaml';
import { buildSvgScene, describeScene, renderSvg } from '../src';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const parp1 = () => compileMechanism(parseMechanism(read('../../../examples/parp1-ssb-repair.yaml')));
const interactiveActors = (svg: string) => [...svg.matchAll(/data-actor="([^"]+)"[^>]*role="button"/g)].map(match => match[1]);

describe('SVG renderer', () => {
  it('builds an accessible scene without a DOM', () => {
    const definition = {
      schemaVersion: 2 as const,
      mechanism: { id: 'x', name: 'Example' },
      actors: [{ id: 'dna', type: 'dna' as const, sites: [{ id: 'lesion' }] }],
      steps: [{ id: 'damage', title: 'Damage', actions: [{ type: 'cleave', target: 'dna.lesion' }] }],
    };
    const svg = renderSvg(buildSvgScene(compileMechanism(definition).at(0)));
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title id="mm-title">Damage</title>');
    expect(svg).toContain('data-lesion="single-strand-break"');
    expect(svg).toContain('Single-strand break (SSB)');
  });

  // The v1 SVG fixtures are no longer byte-comparable (the visual language changed on purpose),
  // but the migrated documents must still show the same actors and lesions at every step.
  it.each(['parp1-ssb-repair', 'homologous-recombination'])('%s: migrated v1 document shows the same actors and lesions as v1', name => {
    const mechanism = compileMechanism(parseMechanism(read(`../../core/test/fixtures/v1/${name}.yaml`)));
    const v1: string[] = JSON.parse(read(`./fixtures/${name}.v1.svg.json`));
    v1.forEach((markup, index) => {
      const svg = renderSvg(buildSvgScene(mechanism.at(index)));
      const v1Actors = [...markup.matchAll(/data-actor="([^"]+)"/g)].map(match => match[1]).filter(id => id !== 'dna');
      expect(interactiveActors(svg)).toEqual(v1Actors);
      expect(svg.match(/data-lesion=/g)?.length ?? 0).toBe(markup.match(/class="mm-lesion"/g)?.length ?? 0);
    });
  });

  it('is deterministic: the same snapshot always yields the same markup', () => {
    const mechanism = parp1();
    for (let index = 0; index < mechanism.length; index++) {
      expect(renderSvg(buildSvgScene(mechanism.at(index)))).toBe(renderSvg(buildSvgScene(parp1().at(index))));
    }
  });

  it('exposes activity as data, not as action knowledge', () => {
    expect(renderSvg(buildSvgScene(parp1().at('activation')))).toMatch(/data-actor="parp1" data-activity="active"/);
  });

  it('draws explicit binding relations from resolved SceneState', () => {
    const svg = renderSvg(buildSvgScene(parp1().at('scaffold')));
    expect(svg).toContain('data-layer="connections"');
    expect(svg).toContain('data-key="connection:xrcc1:parp1"');
  });

  it('draws upcoming actors out of focus, hidden from assistive tech and not focusable', () => {
    const svg = renderSvg(buildSvgScene(parp1().at('intact'), { ghosts: ['ogg1', 'ape1'] }));
    expect(svg).toMatch(/class="mm-actor mm-actor--protein mm-actor--ghost" data-key="actor:ogg1" data-actor="ogg1" aria-hidden="true"/);
    expect(interactiveActors(svg)).toEqual([]);
    expect(svg).toContain('filter="url(#mm-blur)"');
  });

  it('keys every persistent element so hosts can animate between steps', () => {
    const svg = renderSvg(buildSvgScene(parp1().at('parylation')));
    for (const key of ['acid:dna', 'actor:parp1', 'label:parp1', 'chain:parp1', 'lesion:dna.lesion']) expect(svg).toContain(`data-key="${key}"`);
    expect(svg.match(/class="mm-chain"[\s\S]*?<\/g>/)?.[0].match(/<circle/g)?.length).toBeGreaterThanOrEqual(12);
  });

  it('renders compact thumbnails without labels, ghosts, or interactive elements, cropped to the action', () => {
    const svg = renderSvg(buildSvgScene(parp1().at('scaffold'), { ghosts: ['polb'] }), { compact: true, idPrefix: 'thumb' });
    expect(svg).not.toContain('mm-label');
    expect(svg).not.toContain('data-actor="polb"');
    expect(svg).not.toContain('role="button"');
    expect(svg).not.toMatch(/viewBox="0 0 960 540"/);
  });

  it('describes the visible state in plain language', () => {
    const scene = buildSvgScene(parp1().at('scaffold'));
    expect(describeScene(scene)).toBe('Shown: PARP1 (active, bound to DNA (lesion), carrying PAR); XRCC1 (bound to PARP1). Lesions: Single-strand break (SSB) at DNA (lesion).');
  });

  it('points chains towards the free side and keeps labels away from them', () => {
    // On an intact molecule (the frozen v2 HR) the filament leaves towards the free side…
    const intact = compileMechanism(parseMechanism(read('./fixtures/v2/homologous-recombination.yaml')));
    expect(Math.cos(buildSvgScene(intact.at('filament')).actors.find(actor => actor.id === 'rad51')!.chain!.angle)).toBeLessThan(0);
    // …and on a resected molecule (the frozen v3 HR, which still draws RAD51 as a chain) it runs down along
    // the 3′ overhang beneath RAD51, away from the break.
    const hr = compileMechanism(parseMechanism(read('../../core/test/fixtures/v3/homologous-recombination.yaml')));
    const rad51 = buildSvgScene(hr.at('filament')).actors.find(actor => actor.id === 'rad51')!;
    expect(Math.cos(rad51.chain!.angle)).toBeLessThan(0);
    expect(Math.sin(rad51.chain!.angle)).toBeGreaterThan(0);
    const parp1Actor = buildSvgScene(parp1().at('parylation')).actors.find(actor => actor.id === 'parp1')!;
    expect(Math.cos(parp1Actor.chain!.angle)).toBeGreaterThan(0);
    expect(parp1Actor.labelSide).toBe(-1);
  });
});
