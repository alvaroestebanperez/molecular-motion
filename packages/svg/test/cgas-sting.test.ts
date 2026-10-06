import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism } from '@molecular-motion/core';
import { parseMechanism } from '@molecular-motion/core/yaml';
import { buildSvgScene, renderSvg, type SvgScene } from '../src';
import { actorContactShape, areaLabels } from '../src/scene';
import { insideParticle } from '../src/primitives/protein-geometry';

const load = (name: string) => compileMechanism(parseMechanism(readFileSync(new URL(`../../../examples/${name}.yaml`, import.meta.url), 'utf8')));
const mechanism = load('cgas-sting');
const CANVASES = [{}, { width: 640, height: 620 }, { width: 520, height: 600 }];
const scene = (step: string, size = {}) => buildSvgScene(mechanism.at(step), size);
const actor = (target: SvgScene, id: string) => target.actors.find(item => item.id === id)!;
const overlap = (a: SvgScene['actors'][number], b: SvgScene['actors'][number]) => actorContactShape(a).particles
  .some(p => actorContactShape(b).particles.some(q => insideParticle(q, a.x + p.x - b.x, a.y + p.y - b.y, -3)));

describe('cGAS–STING in schema v5', () => {
  it('is eleven steps, and hides the DNA and cGAS after cGAMP is made without degrading them', () => {
    expect(mechanism.length).toBe(11);
    expect(mechanism.definition.schemaVersion).toBe(7);
    for (const id of ['dna', 'cgas#1', 'cgas#2']) {
      expect(mechanism.at('cgamp').actors[id]).toMatchObject({ present: true, visible: true });
      expect(mechanism.at('sting-binding').actors[id]).toMatchObject({ present: true, visible: false });
    }
  });

  it.each(CANVASES)('on a %o canvas, actors that span the membrane stay on its plane in every step', size => {
    for (let index = 0; index < mechanism.length; index++) {
      const target = buildSvgScene(mechanism.at(index), size);
      const spanning = target.actors.filter(item => item.membrane);
      expect(spanning).toHaveLength(4);
      for (const item of spanning) expect(item.y, `${target.title}: ${item.id}`).toBe(target.membranes[0]!.y);
    }
  });

  it('a ligand bound to two partners sits between where it touches each', () => {
    const target = scene('sting-binding');
    for (const [ligand, a, b] of [['cgamp#1', 'sting#1', 'sting#2'], ['cgamp#2', 'sting#3', 'sting#4']] as const) {
      const [x0, x1] = [actor(target, a).x, actor(target, b).x].sort((p, q) => p - q);
      expect(actor(target, ligand).x).toBeGreaterThan(x0!);
      expect(actor(target, ligand).x).toBeLessThan(x1!);
      // On the cytosolic side, below the bilayer.
      expect(actor(target, ligand).y).toBeGreaterThan(target.membranes[0]!.y + 24);
    }
  });

  it.each(CANVASES)('on a %o canvas, what rests on the DNA or is free in the cytosol stays off the spanning actors', size => {
    for (const step of ['cgas-binding', 'cgas-assembly', 'cgamp'] as const) {
      const target = scene(step, size);
      const [spanning, others] = [target.actors.filter(item => item.membrane), target.actors.filter(item => !item.membrane && !item.ghost)];
      expect(others.length).toBeGreaterThan(0);
      for (const other of others) for (const sting of spanning) expect(overlap(other, sting), `${step}: ${other.id} on ${sting.id}`).toBe(false);
      // The nucleic acid lies below every inner domain.
      const lowest = Math.max(...spanning.flatMap(item => actorContactShape(item).particles.map(p => item.y + p.y + Math.max(p.rx, p.ry))));
      expect(target.nucleicAcids[0]!.y - 36).toBeGreaterThan(lowest);
    }
  });

  it('the bilayer takes the name of the membrane compartment the scene is at: ER, then Golgi from step 7', () => {
    const names = Array.from({ length: mechanism.length }, (_, index) => buildSvgScene(mechanism.at(index)).membranes[0]!.label);
    expect(names).toEqual([...Array(6).fill('ER membrane'), ...Array(5).fill('Golgi membrane')]);
    const [before, after] = [scene('oligomerization'), scene('trafficking')];
    // A change of context: the same bilayer in the same place, under another key, and nobody moves.
    expect(after.membranes[0]!.y).toBe(before.membranes[0]!.y);
    expect(after.membranes[0]!.id).not.toBe(before.membranes[0]!.id);
    expect(after.actors.map(item => [item.id, item.x, item.y])).toEqual(before.actors.map(item => [item.id, item.x, item.y]));
    expect(renderSvg(before)).toContain('data-key="membrane:er-membrane"');
    expect(renderSvg(after)).toContain('data-key="membrane:golgi-membrane"');
    expect(renderSvg(after)).toContain('>Golgi membrane</text>');
    // STING is still drawn spanning it: it did not become soluble.
    expect(after.actors.filter(item => item.membrane === 'golgi-membrane')).toHaveLength(4);
  });

  it.each(CANVASES)('on a %o canvas, the membrane name is not written under a spanning actor', size => {
    for (let index = 0; index < mechanism.length; index++) {
      const target = buildSvgScene(mechanism.at(index), size);
      const name = areaLabels(target).find(label => label.role === 'membrane')!;
      for (const item of target.actors.filter(other => other.membrane)) {
        const xs = actorContactShape(item).particles.flatMap(p => [item.x + p.x - p.rx, item.x + p.x + p.rx]);
        const ys = actorContactShape(item).particles.flatMap(p => [item.y + p.y - p.ry, item.y + p.y + p.ry]);
        const apart = Math.min(...xs) > name.box[2] || Math.max(...xs) < name.box[0] || Math.min(...ys) > name.box[3] || Math.max(...ys) < name.box[1];
        expect(apart, `${target.title}: ${item.id}`).toBe(true);
      }
    }
  });

  it.each(CANVASES)('on a %o canvas, the IRF3 dimer is in the cytoplasm at step 10 and inside the nuclear region at step 11', size => {
    const [dimer, nucleus] = [scene('irf3-dimer', size), scene('nucleus', size)];
    const region = nucleus.regions[0]!;
    expect(region).toMatchObject({ id: 'nucleus', kind: 'nucleus' });
    for (const id of ['irf3#1', 'irf3#2']) {
      const inside = (target: SvgScene) => actorContactShape(actor(target, id)).particles.every(p => actor(target, id).y + p.y - p.ry > region.y);
      expect(actor(dimer, id).y, id).toBeLessThan(region.y);
      expect(inside(nucleus), id).toBe(true);
      expect(actor(nucleus, id).y - actor(dimer, id).y).toBeGreaterThan(80);
    }
    // Still a dimer: the two moved together.
    expect(Math.abs(actor(nucleus, 'irf3#1').x - actor(nucleus, 'irf3#2').x)).toBeLessThan(actor(nucleus, 'irf3#1').radius * 2.2);
    expect(renderSvg(nucleus)).toContain('data-layer="regions"');
  });
});

describe('regions are drawn only where there is something to tell apart', () => {
  it.each(['parp1-ssb-repair', 'homologous-recombination', 'p53-mdm2-feedback', 'egfr-dimerization'])('%s declares no compartment beside a nucleus, so it has no region', name => {
    const other = load(name);
    for (let index = 0; index < other.length; index++) {
      const target = buildSvgScene(other.at(index));
      expect(target.regions).toEqual([]);
      expect(renderSvg(target)).not.toContain('data-layer="regions"');
    }
  });
});
