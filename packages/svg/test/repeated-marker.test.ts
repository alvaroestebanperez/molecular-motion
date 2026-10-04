import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
import { buildSvgScene, exportSvg, renderSvg, MODIFICATION_VISUAL_PROFILES } from '../src';
import { actorContactShape, actorRepeatedMarker } from '../src/scene';
const profile = MODIFICATION_VISUAL_PROFILES.ubiquitination!;
function mechanism(kind = 'custom-a') {
  return compileMechanism({ schemaVersion: 5, mechanism: { id: 'arbitrary', name: 'Arbitrary' }, actors: [{ id: 'carrier', type: 'protein', initial: { visible: true } }], steps: [{ id: 'modified', title: 'Modified', actions: [{ type: 'modify', actor: 'carrier', kind, label: 'Shared label', length: 4 }] }] });
}
describe('repeated modification presentation', () => {
  it('different kinds mapped to the same profile have identical geometry and rendering', () => {
    const profiles = { 'custom-a': profile, 'custom-b': profile };
    const a = buildSvgScene(mechanism('custom-a').at(0), { modificationProfiles: profiles });
    const b = buildSvgScene(mechanism('custom-b').at(0), { modificationProfiles: profiles });
    expect(actorRepeatedMarker(a.actors[0]!)).toEqual(actorRepeatedMarker(b.actors[0]!));
    expect(renderSvg(a)).toBe(renderSvg(b));
  });
  it('one semantic state, different profiles: semantics unchanged and geometry distinct', () => {
    const snapshot = mechanism().at(0);
    const before = JSON.stringify(snapshot);
    const a = buildSvgScene(snapshot, { modificationProfiles: { 'custom-a': profile } });
    const b = buildSvgScene(snapshot, { modificationProfiles: { 'custom-a': { marker: 'bead', radius: 6, fill: '#aaa', curl: 0 } } });
    expect(actorRepeatedMarker(a.actors[0]!)).not.toEqual(actorRepeatedMarker(b.actors[0]!));
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(snapshot.actors.carrier!.modifications).toHaveLength(1);
    expect(Object.keys(snapshot.actors)).toEqual(['carrier']);
    expect(snapshot.interactions).toEqual({});
  });
  it('geometry is deterministic and its particles are used for contacts and framing', () => {
    const snapshot = mechanism('ubiquitination').at(0);
    const scene = buildSvgScene(snapshot);
    const actor = scene.actors[0]!;
    const geometry = actorRepeatedMarker(actor)!;
    expect(geometry.units).toHaveLength(4);
    expect(geometry.profile.radius).toBe(10);
    expect(actorContactShape(actor).particles.slice(-geometry.particles.length)).toEqual(geometry.particles);
    expect(renderSvg(buildSvgScene(snapshot))).toBe(renderSvg(scene));
    const markup = exportSvg(scene, { compact: true });
    const [x,y,w,h] = markup.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number) as [number,number,number,number];
    const [l,t,r,b] = geometry.bounds;
    expect(x).toBeLessThanOrEqual(actor.x+l); expect(y).toBeLessThanOrEqual(actor.y+t);
    expect(x+w).toBeGreaterThanOrEqual(actor.x+r); expect(y+h).toBeGreaterThanOrEqual(actor.y+b);
  });
  it('absent profiles preserve the exact legacy rendering, including PAR', () => {
    for (const name of ['parp1-ssb-repair','homologous-recombination','egfr-dimerization']) {
      const compiled = compileMechanism(parseMechanism(readFileSync(new URL(`../../../examples/${name}.yaml`, import.meta.url), 'utf8')));
      for (let i=0;i<compiled.length;i++) expect(renderSvg(buildSvgScene(compiled.at(i), { modificationProfiles: {} }))).toBe(renderSvg(buildSvgScene(compiled.at(i))));
    }
    const legacy = buildSvgScene(mechanism('ubiquitination').at(0), { modificationProfiles: {} });
    expect(legacy.actors[0]!.chain!.profile).toBeUndefined();
    expect(renderSvg(legacy)).toContain('class="mm-chain"');
  });
  it('the integrated eight-step mechanism compiles and uses occupancy, not DNA edges', () => {
    const m = compileMechanism(parseMechanism(readFileSync(new URL('../../../examples/p53-mdm2-feedback.yaml', import.meta.url), 'utf8')));
    expect(m.length).toBe(8);
    const tagged = m.at(2);
    expect(tagged.actors['p53-basal']!.modifications).toEqual([{id:'ubiquitination',kind:'ubiquitination',label:'Ub',length:4}]);
    expect(Object.keys(tagged.actors).some(id=>id.startsWith('ub#'))).toBe(false);
    expect(m.at(4).actors['p53-basal']!.present).toBe(false);
    expect(Object.values(m.at(6).occupancy).some(o=>o.instance==='p53-response')).toBe(true);
    expect(Object.values(m.at(6).interactions).some(e=>e.ends.some(end=>end.instance==='mdm2-gene'))).toBe(false);
    expect(m.at(7).occupancy).toEqual({});
    expect(m.at(7).actors['p53-response']!.activity!.state).toBe('inhibited');
  });
});
