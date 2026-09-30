import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
import { buildSvgScene, renderSvg } from '../src';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

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
    expect(svg).toContain('mm-lesion');
  });

  it.each(['parp1-ssb-repair', 'homologous-recombination'])('%s: migrated v1 document renders byte-identical SVG', name => {
    const mechanism = compileMechanism(parseMechanism(read(`../../core/test/fixtures/v1/${name}.yaml`)));
    const rendered = Array.from({ length: mechanism.length }, (_, index) => renderSvg(buildSvgScene(mechanism.at(index))));
    expect(rendered).toEqual(JSON.parse(read(`./fixtures/${name}.v1.svg.json`)));
  });

  it('exposes activity as data, not as action knowledge', () => {
    const mechanism = compileMechanism(parseMechanism(read('../../../examples/parp1-ssb-repair.yaml')));
    expect(renderSvg(buildSvgScene(mechanism.at('recognition')))).toContain('data-actor="parp1" data-activity="active"');
  });
});
