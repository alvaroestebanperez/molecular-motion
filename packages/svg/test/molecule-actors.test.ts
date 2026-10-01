import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
import { buildSvgScene, renderSmallMoleculePrimitive, renderSvg, SMALL_MOLECULE_TOPOLOGIES, smallMoleculeAtoms } from '../src';
import { actorParticles, MOLECULE_ACTOR_SCALE } from '../src/scene';

const source = readFileSync(new URL('../../../examples/parp1-ssb-repair.yaml', import.meta.url), 'utf8');
const parp1 = (yaml = source) => compileMechanism(parseMechanism(yaml));
/** The step where NAD+ is shown next to PARP1. */
const nadStep = (mechanism: ReturnType<typeof parp1>) => {
  for (let index = 0; index < mechanism.length; index++) {
    const scene = buildSvgScene(mechanism.at(index));
    if (scene.actors.some(actor => actor.id === 'nad' && !actor.ghost)) return scene;
  }
  throw new Error('NAD+ never shown');
};
const actorMarkup = (svg: string, id: string) => svg.match(new RegExp(`<g class="mm-actor[^"]*" data-key="actor:${id}"[\\s\\S]*?</g></g>`))![0];

describe('declared molecule actors', () => {
  it('draws a declared molecule with the same topology glyph as the catalog', () => {
    const scene = nadStep(parp1());
    const nad = scene.actors.find(actor => actor.id === 'nad')!;
    expect(nad.molecule).toBe('nad-plus');
    const glyph = renderSmallMoleculePrimitive({ visualSeed: 'nad', topology: SMALL_MOLECULE_TOPOLOGIES['nad-plus']!, scale: MOLECULE_ACTOR_SCALE, fill: nad.color });
    const svg = renderSvg(scene);
    expect(svg).toContain(glyph);
    expect(glyph).toContain('data-topology="units"');
    expect(glyph).toContain('data-units="2"');
  });

  it('lays out contact with the atoms that are drawn', () => {
    const atoms = smallMoleculeAtoms(SMALL_MOLECULE_TOPOLOGIES['nad-plus']!, MOLECULE_ACTOR_SCALE);
    const particles = actorParticles('nad', 'molecule', 24, 'nad-plus');
    expect(particles.map(p => ({ x: p.x, y: p.y, r: p.r }))).toEqual(atoms);
  });

  it('falls back to the generic glyph for unknown or missing keys', () => {
    const unknown = parp1(source.replace('molecule: nad-plus', 'molecule: not-in-the-vocabulary'));
    const svg = renderSvg(nadStep(unknown));
    expect(actorMarkup(svg, 'nad')).toContain('class="mm-bonds"');
    expect(actorMarkup(svg, 'nad')).not.toContain('data-topology');
    const undeclared = renderSvg(nadStep(parp1(source.replace('    molecule: nad-plus\n', ''))));
    expect(actorMarkup(undeclared, 'nad')).toContain('class="mm-bonds"');
  });

  it('only changes the declared actor: every other actor renders as before', () => {
    const declared = parp1();
    const undeclared = parp1(source.replace('    molecule: nad-plus\n', ''));
    for (let index = 0; index < declared.length; index++) {
      const a = buildSvgScene(declared.at(index)); const b = buildSvgScene(undeclared.at(index));
      for (const actor of a.actors) {
        if (actor.id === 'nad' || actor.boundTo?.startsWith('nad')) continue;
        const twin = b.actors.find(other => other.id === actor.id)!;
        expect({ x: actor.x, y: actor.y }).toEqual({ x: twin.x, y: twin.y });
      }
    }
  });

  it('is deterministic and never uses global randomness', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('global randomness used'); });
    const scene = nadStep(parp1());
    expect(renderSvg(scene)).toBe(renderSvg(nadStep(parp1())));
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
