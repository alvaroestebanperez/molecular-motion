import { describe, expect, it } from 'vitest';
import { compileMechanism, type ActionNode } from '@molecular-motion/core';
import { buildSvgScene, renderSvg } from '../src';

/** Four copies of a protein and a duplex they can sit on. */
const scene = (actions: ActionNode[]) => buildSvgScene(compileMechanism({
  schemaVersion: 5, mechanism: { id: 'x', name: 'X' },
  actors: [
    { id: 'dna', type: 'dna', nucleic: { length: 80 }, sites: [{ id: 'a', span: [10, 16] }, { id: 'b', span: [30, 36] }] },
    { id: 'unit', type: 'protein', label: 'Unit', copies: 4, footprint: { length: 6 }, interfaces: [{ id: 'side', valence: 2 }] },
    { id: 'other', type: 'protein', label: 'Other' },
  ],
  steps: [{ id: 's', title: 'S', actions: [...['unit#1', 'unit#2', 'unit#3', 'unit#4', 'other'].map(actor => ({ type: 'show', actor })), ...actions] }],
}).at(0));
const identical = (actions: ActionNode[]) => Object.fromEntries(scene(actions).actors.map(actor => [actor.id, actor.identical ? `${actor.identical.first ? 'first of ' : 'one of '}${actor.identical.size}` : 'distinct']));
const tabStops = (actions: ActionNode[], groupIdenticalCopies: boolean) =>
  [...renderSvg(scene(actions), { groupIdenticalCopies }).matchAll(/data-actor="([^"]+)" role="button" tabindex="(-?\d)" aria-pressed="false" aria-label="([^"]+)"/g)].map(match => `${match[1]} ${match[2]} ${match[3]}`);

describe('copies that are identical in a snapshot', () => {
  it('are those with the same state, occupancy and interactions; a single-copy actor is never one', () => {
    expect(identical([])).toEqual({ 'unit#1': 'first of 4', 'unit#2': 'one of 4', 'unit#3': 'one of 4', 'unit#4': 'one of 4', other: 'distinct' });
  });

  it('stop being identical as soon as state tells them apart', () => {
    expect(identical([{ type: 'activate', actor: 'unit#2' }])).toMatchObject({ 'unit#1': 'first of 3', 'unit#2': 'distinct', 'unit#3': 'one of 3' });
    expect(identical([{ type: 'phosphorylate', actor: 'unit#1' }])).toMatchObject({ 'unit#1': 'distinct', 'unit#2': 'first of 3' });
    // The same change on two of them makes those two identical to each other, and different from the rest.
    expect(identical([{ type: 'activate', actor: 'unit#2' }, { type: 'activate', actor: 'unit#4' }]))
      .toEqual({ 'unit#1': 'first of 2', 'unit#2': 'first of 2', 'unit#3': 'one of 2', 'unit#4': 'one of 2', other: 'distinct' });
  });

  it('are distinct when they occupy different nucleotides, even side by side', () => {
    expect(identical([{ type: 'occupy', actor: 'unit#1', target: 'dna.a' }, { type: 'occupy', actor: 'unit#2', target: 'dna.b' }]))
      .toMatchObject({ 'unit#1': 'distinct', 'unit#2': 'distinct', 'unit#3': 'first of 2', 'unit#4': 'one of 2' });
  });

  it('are distinct when their interactions differ, partner for partner', () => {
    // Bound to each other: each has a different partner.
    expect(identical([{ type: 'bind', actor: 'unit#1', interface: 'side', target: 'unit#2', targetInterface: 'side' }]))
      .toMatchObject({ 'unit#1': 'distinct', 'unit#2': 'distinct', 'unit#3': 'first of 2', 'unit#4': 'one of 2' });
    // Bound to the very same partner in the same way: nothing tells them apart.
    expect(identical([{ type: 'bind', actor: 'unit#1', target: 'other' }, { type: 'bind', actor: 'unit#2', target: 'other' }]))
      .toMatchObject({ 'unit#1': 'first of 2', 'unit#2': 'one of 2', 'unit#3': 'first of 2', 'unit#4': 'one of 2' });
  });
});

describe('tab stops', () => {
  it('stay one per copy unless grouping is asked for', () => {
    expect(tabStops([], false)).toEqual(['unit#1 0 Unit', 'unit#2 0 Unit', 'unit#3 0 Unit', 'unit#4 0 Unit', 'other 0 Other']);
  });

  it('are one per group of identical copies when it is: the first speaks for the rest, which stay clickable', () => {
    expect(tabStops([], true)).toEqual(['unit#1 0 Unit, 4 identical copies', 'unit#2 -1 Unit', 'unit#3 -1 Unit', 'unit#4 -1 Unit', 'other 0 Other']);
    expect(tabStops([{ type: 'occupy', actor: 'unit#1', target: 'dna.a' }, { type: 'occupy', actor: 'unit#2', target: 'dna.b' }], true).map(stop => stop.split(' ').slice(0, 2).join(' ')))
      .toEqual(['unit#1 0', 'unit#2 0', 'unit#3 0', 'unit#4 -1', 'other 0']);
  });
});
