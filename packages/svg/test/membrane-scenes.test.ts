import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
import { buildSvgScene, exportSvg, membraneSceneCss, MODIFICATION_VISUAL_PROFILES, renderSvg, type SvgScene } from '../src';
import { actorContactShape, actorParticles, siteAnchor, spanningGeometry } from '../src/scene';

const load = (name: string) => compileMechanism(parseMechanism(readFileSync(new URL(`../../../examples/${name}.yaml`, import.meta.url), 'utf8')));
const egfr = load('egfr-dimerization');
const scene = (step: string, options = {}) => buildSvgScene(egfr.at(step), options);
const actor = (target: SvgScene, id: string) => target.actors.find(item => item.id === id)!;
/** Vertical extent of everything an actor shows, in canvas coordinates. */
const extent = (item: SvgScene['actors'][number]) => {
  const ys = actorContactShape(item).particles.flatMap(p => [item.y + p.y - Math.max(p.rx, p.ry), item.y + p.y + Math.max(p.rx, p.ry)]);
  return { top: Math.min(...ys), bottom: Math.max(...ys) };
};

describe('membranes come from compartments', () => {
  it('a membrane compartment is a bilayer even when no actor is in it', () => {
    const empty = buildSvgScene(compileMechanism({
      schemaVersion: 5, mechanism: { id: 'm', name: 'M' }, compartments: ['extracellular', 'membrane', 'cytoplasm'],
      actors: [{ id: 'ligand', type: 'protein', compartment: 'extracellular' }, { id: 'adaptor', type: 'protein', compartment: 'cytoplasm' }],
      steps: [{ id: 's', title: 'S', actions: [{ type: 'show', actor: 'ligand' }, { type: 'show', actor: 'adaptor' }] }],
    }).at(0));
    expect(empty.membranes).toEqual([expect.objectContaining({ id: 'membrane', outside: expect.objectContaining({ id: 'extracellular' }), inside: expect.objectContaining({ id: 'cytoplasm' }) })]);
    expect(empty.actors.every(item => item.membrane === undefined)).toBe(true);
    // Free actors wait in the band of their own compartment.
    expect(actor(empty, 'ligand').y).toBeLessThan(empty.membranes[0]!.y);
    expect(actor(empty, 'adaptor').y).toBeGreaterThan(empty.membranes[0]!.y);
    expect(renderSvg(empty)).toContain('data-layer="membranes"');
  });

  it.each(['parp1-ssb-repair', 'homologous-recombination', 'p53-mdm2-feedback'])('%s has no membrane compartment, so no membrane, layer, tag or extra stylesheet', name => {
    const mechanism = load(name);
    for (let index = 0; index < mechanism.length; index++) {
      const target = buildSvgScene(mechanism.at(index));
      expect(target.membranes).toEqual([]);
      expect(target.actors.some(item => item.membrane || item.tags)).toBe(false);
      expect(renderSvg(target)).not.toContain('data-layer="membranes"');
      expect(exportSvg(target)).not.toContain(membraneSceneCss);
    }
  });
});

describe('EGFR: signalling across the membrane', () => {
  it('both receptors span the same membrane in every step, with a domain on each side', () => {
    for (let index = 0; index < egfr.length; index++) {
      const target = buildSvgScene(egfr.at(index));
      const [membrane] = target.membranes;
      for (const id of ['egfr#1', 'egfr#2']) {
        const receptor = actor(target, id);
        expect(receptor.membrane).toBe(membrane!.id);
        expect(receptor.y).toBe(membrane!.y);
        expect(extent(receptor).top).toBeLessThan(membrane!.y - 24);
        expect(extent(receptor).bottom).toBeGreaterThan(membrane!.y + 24);
      }
    }
  });

  it('EGF binds above the membrane, GRB2 below it, and the receptors touch along it', () => {
    const adaptor = scene('adaptor');
    const y = adaptor.membranes[0]!.y;
    for (const id of ['egf#1', 'egf#2']) expect(extent(actor(adaptor, id)).bottom).toBeLessThan(y - 24);
    expect(extent(actor(adaptor, 'grb2')).top).toBeGreaterThan(y + 24);
    const [a, b] = [actor(adaptor, 'egfr#1'), actor(adaptor, 'egfr#2')];
    expect(a.y).toBe(b.y);
    expect(Math.abs(a.x - b.x)).toBeLessThan(a.radius * 2);
    // Apart before they dimerize.
    const monomers = scene('monomers');
    expect(Math.abs(actor(monomers, 'egfr#1').x - actor(monomers, 'egfr#2').x)).toBeGreaterThan(a.radius * 4);
  });

  it('the modification names the declared site exactly; no case folding', () => {
    const declared = egfr.at(0).definition.actors.find(item => item.id === 'egfr')!.sites!.map(site => site.id);
    expect(egfr.at('adaptor').actors['egfr#1']!.modifications.map(modification => modification.site)).toEqual(declared);
    // A site spelled differently is a different anchor: nothing normalises it.
    const receptor = actor(scene('adaptor'), 'egfr#1');
    expect(siteAnchor(receptor, 'Y1068', 'inside')).not.toEqual(siteAnchor(receptor, 'y1068', 'inside'));
  });

  it('a site has one anchor: the tag sits on it before and after the partner binds, and the partner docks there', () => {
    const [before, after] = [scene('autophosphorylation'), scene('adaptor')];
    const tagOf = (target: SvgScene) => actor(target, 'egfr#1').tags!.find(tag => tag.site === 'y1068')!;
    expect(tagOf(before)).toEqual(tagOf(after));
    const receptor = actor(after, 'egfr#1');
    const anchor = siteAnchor(receptor, 'y1068', 'inside');
    const tag = tagOf(after);
    expect(Math.hypot(tag.x - anchor.x, tag.y - anchor.y)).toBeLessThan(tag.r);
    // The cytosolic side, derived from who binds the site, already before GRB2 is there.
    expect(anchor.y).toBeGreaterThan(spanningGeometry(receptor.actor, receptor.radius).reach);
    expect(tagOf(before).y).toBeGreaterThan(spanningGeometry(receptor.actor, receptor.radius).reach);
    // GRB2 rests against the tag: its surface comes within a few px of the anchor.
    const grb2 = actor(after, 'grb2');
    const nearest = Math.min(...actorParticles(grb2.actor, grb2.type, grb2.radius).map(p => Math.hypot(grb2.x + p.x - (receptor.x + anchor.x), grb2.y + p.y - (receptor.y + anchor.y)) - Math.max(p.rx, p.ry)));
    expect(nearest).toBeLessThan(tag.r * 2 + 6);
    const connection = after.connections.find(item => item.source === 'grb2')!;
    expect(Math.hypot(connection.from.x - (receptor.x + tag.x), connection.from.y - (receptor.y + tag.y))).toBeLessThan(tag.r * 2 + 4);
  });

  it('a profile is appearance only: it cannot say which side a tag goes on', () => {
    for (const profile of Object.values(MODIFICATION_VISUAL_PROFILES)) expect(Object.keys(profile!).sort()).toEqual(expect.not.arrayContaining(['side', 'attach', 'topology']));
    const svg = renderSvg(scene('autophosphorylation'));
    expect(svg.match(/mm-modification--tag/g)).toHaveLength(2);
    expect(svg).not.toContain('mm-modification--phosphorylation');
  });

  it('callouts stay off the bilayer and their leaders do not cross it', () => {
    for (let index = 0; index < egfr.length; index++) expect(buildSvgScene(egfr.at(index)).calloutConflicts.filter(conflict => conflict.hard > 0), egfr.at(index).step.id).toEqual([]);
  });
});
