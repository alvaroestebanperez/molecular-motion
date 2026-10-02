import { describe, expect, it } from 'vitest';
import { compileMechanism } from '@molecular-motion/core';
import { buildSvgScene, renderSvg } from '../src';
import { actorParticles } from '../src/scene';

const scene = buildSvgScene(compileMechanism({
  schemaVersion: 4, mechanism: { id: 'x', name: 'X' },
  actors: [{ id: 'egfr', type: 'protein', label: 'EGFR', copies: 2 }, { id: 'atp', type: 'molecule', molecule: 'atp', copies: 2 }],
  steps: [{ id: 's', title: 'S', actions: [{ type: 'show', actor: 'egfr#1' }, { type: 'show', actor: 'egfr#2' }, { type: 'show', actor: 'atp#1' }, { type: 'show', actor: 'atp#2' }] }],
}).at(0));
const inner = (svg: string, id: string) => svg.match(new RegExp(`data-actor="${id}"[^>]*>(<g class="mm-actor__inner".*?)</g></g>`))![1];

describe('actor instances in the scene (RFC 0005 §3.3)', () => {
  it('keys every copy separately but gives all copies the definition’s identity', () => {
    expect(scene.actors.map(actor => [actor.id, actor.actor, actor.label])).toEqual([
      ['egfr#1', 'egfr', 'EGFR'], ['egfr#2', 'egfr', 'EGFR'], ['atp#1', 'atp', 'atp'], ['atp#2', 'atp', 'atp'],
    ]);
    expect(new Set(scene.actors.filter(actor => actor.actor === 'egfr').map(actor => actor.color)).size).toBe(1);
    const svg = renderSvg(scene);
    expect(svg).toContain('data-key="actor:egfr#1"');
    expect(svg).toContain('data-key="actor:egfr#2"');
  });

  it('draws the same silhouette for every copy: only position may differ', () => {
    const svg = renderSvg(scene);
    expect(inner(svg, 'egfr#1')).toBe(inner(svg, 'egfr#2'));
    expect(inner(svg, 'atp#1')).toBe(inner(svg, 'atp#2'));
    expect(inner(svg, 'egfr#1')).not.toBe(inner(svg, 'atp#1'));
    // The check discriminates: seeding by instance id would have given each copy its own shape.
    expect(actorParticles('egfr#1', 'protein', 62)).not.toEqual(actorParticles('egfr#2', 'protein', 62));
  });
});
