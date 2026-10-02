import { describe, expect, it } from 'vitest';
import { compileMechanism, type ActionNode } from '@molecular-motion/core';
import { buildSvgScene, describeScene, renderSvg, type SceneActor } from '../src';
import { contactOutline } from '../src/primitives';
import { actorContactShape } from '../src/scene';
import { outlineDistance, penetration, type Placed } from './contact';

const placed = (actor: SceneActor): Placed => ({ ...actorContactShape(actor), margin: 0, x: actor.x, y: actor.y });
/** Visible width, measured on the same contact outline the layout uses. */
const extent = (actor: SceneActor) => { const xs = contactOutline(actorContactShape({ ...actor, chain: undefined })).map(point => point.x); return Math.max(...xs) - Math.min(...xs); };

/** HR resection with RPA, RAD51 and BRCA2 (RFC 0005 §6), 80 bp on the default 960-px canvas: 12 px per nt. */
const scene = (actions: ActionNode[]) => buildSvgScene(compileMechanism({
  schemaVersion: 4, mechanism: { id: 'x', name: 'X' },
  actors: [
    { id: 'dna', type: 'dna', label: 'DNA', nucleic: { length: 80 }, sites: [{ id: 'break', at: 40 }, { id: 'right', span: [40, 58] }] },
    { id: 'rpa', type: 'protein', label: 'RPA', copies: 3, footprint: { length: 6, form: 'single' } },
    { id: 'rad51', type: 'protein', label: 'RAD51', copies: 3, footprint: { length: 3, form: 'single' }, interfaces: [{ id: 'protomer', valence: 2 }] },
    { id: 'brca2', type: 'protein', label: 'BRCA2' },
  ],
  steps: [{ id: 's', title: 'S', actions: [
    { type: 'cleave', target: 'dna.break', lesion: 'double-strand-break' }, { type: 'resect', target: 'dna.break', length: 18 }, ...actions,
  ] }],
}).at(0));
const coat = { type: 'coat', actors: ['rpa#1', 'rpa#2', 'rpa#3'], target: 'dna.right' };
const handover: ActionNode[] = [coat, { type: 'vacate', actor: 'rpa#1' }, { type: 'hide', actor: 'rpa#1' },
  { type: 'occupy', actor: 'rad51#1', target: 'dna', span: [40, 43], orientation: 'reverse' }, { type: 'occupy', actor: 'rad51#2', target: 'dna', span: [43, 46] },
  { type: 'bind', actor: 'brca2', target: 'rad51#1' }];
const actor = (s: ReturnType<typeof scene>, id: string) => s.actors.find(item => item.id === id)!;

describe('span occupants (RFC 0005 §7)', () => {
  it('sit at the middle of their span, resting on the strand that is present', () => {
    const coated = scene([coat]);
    expect(['rpa#1', 'rpa#2', 'rpa#3'].map(id => actor(coated, id).x)).toEqual([516, 588, 660]);
    for (const id of ['rpa#1', 'rpa#2', 'rpa#3']) expect(coated.connections.find(item => item.source === id)!.kind).toBe('contact');
  });

  it('are drawn at the width of their footprint, one size per definition, so adjacent copies abut', () => {
    const coated = scene([coat, { type: 'show', actor: 'rad51#3' }]);
    for (const id of ['rpa#1', 'rpa#2']) expect(extent(actor(coated, id)) / 72).toBeCloseTo(1, 1);
    expect(outlineDistance(placed(actor(coated, 'rpa#1')), placed(actor(coated, 'rpa#2')))).toBeLessThan(6);
    // A free copy keeps the definition's size: identity does not change with state.
    expect(actor(coated, 'rad51#3').radius).toBe(actor(scene([...handover]), 'rad51#1').radius);
  });

  it('mirror only the shape of a reverse-oriented occupant', () => {
    const svg = renderSvg(scene(handover));
    const group = (id: string) => svg.match(new RegExp(`data-actor="${id}"[^>]*>.*?</g></g>`))![0];
    expect(group('rad51#1')).toContain('<g transform="scale(-1 1)">');
    expect(group('rad51#2')).not.toContain('scale(-1 1)');
  });

  it('give whatever docks onto a filament protomer room above it instead of crushing its neighbours', () => {
    const swapped = scene(handover);
    expect(penetration(placed(actor(swapped, 'brca2')), placed(actor(swapped, 'rpa#2')))).toBeLessThanOrEqual(0);
    expect(actor(swapped, 'brca2').y).toBeLessThan(actor(swapped, 'rad51#1').y);
  });
});

describe('copies share one callout', () => {
  it('labels the first visible copy with the count and describes the group once', () => {
    const coated = scene([coat]);
    const svg = renderSvg(coated);
    expect(svg.match(/data-key="label:rpa#/g)).toHaveLength(1);
    expect(svg).toContain('>RPA ×3</text>');
    expect(describeScene(coated)).toContain('Shown: RPA ×3 (bound to DNA (right)).');
    expect(coated.actors.filter(item => item.actor === 'rpa').map(item => item.group)).toEqual([{ size: 3, lead: true }, { size: 3, lead: false }, { size: 3, lead: false }]);
  });
});

describe('assemblies off the DNA', () => {
  const assemblies = buildSvgScene(compileMechanism({
    schemaVersion: 4, mechanism: { id: 'e', name: 'E' },
    actors: [
      { id: 'egfr', type: 'protein', copies: 2, interfaces: [{ id: 'dimer' }] },
      { id: 'sting', type: 'protein', copies: 2, interfaces: [{ id: 'dimer' }, { id: 'pocket' }] },
      { id: 'cgamp', type: 'molecule', interfaces: [{ id: 'bridge', valence: 2 }] },
    ],
    steps: [{ id: 's', title: 'S', actions: [
      { type: 'show', actor: 'egfr#1' }, { type: 'show', actor: 'sting#1' },
      { type: 'bind', actor: 'egfr#2', interface: 'dimer', target: 'egfr#1', targetInterface: 'dimer' },
      { type: 'bind', actor: 'sting#2', interface: 'dimer', target: 'sting#1', targetInterface: 'dimer' },
      { type: 'bind', actor: 'cgamp', interface: 'bridge', target: 'sting#1', targetInterface: 'pocket' },
      { type: 'bind', actor: 'cgamp', interface: 'bridge', target: 'sting#2', targetInterface: 'pocket' },
    ] }],
  }).at(0));
  const find = (id: string) => assemblies.actors.find(item => item.id === id)!;

  it('anchors a symmetric dimer on its lower id and docks the other copy against it', () => {
    expect(find('egfr#1').boundTo).toBeUndefined();
    expect(find('egfr#2').boundTo).toBe('egfr#1');
    expect(outlineDistance(placed(find('egfr#1')), placed(find('egfr#2')))).toBeLessThanOrEqual(2);
  });

  it('seats a ligand bound to both protomers over the dimer, touching it', () => {
    const [a, b, ligand] = [find('sting#1'), find('sting#2'), find('cgamp')];
    expect(ligand.x).toBeGreaterThan(Math.min(a.x, b.x));
    expect(ligand.x).toBeLessThan(Math.max(a.x, b.x));
    expect(ligand.y).toBeLessThan(Math.min(a.y, b.y));
    expect(assemblies.connections.find(item => item.source === 'cgamp')!.kind).toBe('contact');
    expect(Math.min(outlineDistance(placed(a), placed(ligand)), outlineDistance(placed(b), placed(ligand)))).toBeLessThanOrEqual(2);
  });
});
