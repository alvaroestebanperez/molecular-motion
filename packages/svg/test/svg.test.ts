import { describe, expect, it } from 'vitest';
import { compileMechanism } from '@molecular-motion/core';
import { buildSvgScene, renderSvg } from '../src';

describe('SVG renderer', () => {
  it('builds an accessible scene without a DOM', () => {
    const definition = {
      schemaVersion: 1 as const,
      mechanism: { id: 'x', name: 'Example' },
      actors: [{ id: 'dna', type: 'dna' as const, sites: [{ id: 'lesion' }] }],
      steps: [{ id: 'damage', title: 'Damage', actions: [{ type: 'create-lesion' as const, target: 'dna.lesion' }] }],
    };
    const svg = renderSvg(buildSvgScene(compileMechanism(definition).at(0)));
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title id="mm-title">Damage</title>');
    expect(svg).toContain('mm-lesion');
  });
});
