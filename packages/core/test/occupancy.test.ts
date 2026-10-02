import { describe, expect, it } from 'vitest';
import { compileMechanism, occupancyConflicts, partnersOf, primaryPartner, type ActionNode, type Occupancy } from '../src';

/** An 80-bp duplex broken at 40, with the overhang spans resection will expose, and footprinted proteins. */
const ACTORS = [
  {
    id: 'dna', type: 'dna', nucleic: { length: 80 },
    sites: [
      { id: 'break', at: 40 }, { id: 'right-overhang', span: [40, 58] }, { id: 'nick', at: 20, strand: 'top' },
      { id: 'p', at: 10 }, { id: 'short', span: [60, 65] }, { id: 'drawn', position: { x: 10, y: 0 } },
    ],
  },
  { id: 'rpa', type: 'protein', copies: 3, footprint: { length: 6, form: 'single' } },
  { id: 'rad51', type: 'protein', copies: 6, footprint: { length: 3, form: 'single' }, interfaces: [{ id: 'protomer', valence: 2 }] },
  { id: 'tf', type: 'protein', footprint: { length: 4, form: 'duplex' } },
  { id: 'brca2', type: 'protein' },
  { id: 'polb', type: 'protein' },
];
const mechanism = (steps: ActionNode[][]) => compileMechanism({
  schemaVersion: 4, mechanism: { id: 'x', name: 'X' }, actors: ACTORS,
  steps: steps.map((actions, index) => ({ id: `s${index}`, title: `S${index}`, actions })),
});
const resected: ActionNode[] = [{ type: 'cleave', target: 'dna.break', lesion: 'double-strand-break' }, { type: 'resect', target: 'dna.break', length: 18 }];
const coated: ActionNode[] = [...resected, { type: 'coat', actors: ['rpa#1', 'rpa#2', 'rpa#3'], target: 'dna.right-overhang' }];
const spans = (occupancy: Record<string, Occupancy>) => Object.values(occupancy).map(item => [item.instance, item.span ? `${item.span.from}-${item.span.to}` : null, item.strand ?? null]);

describe('RPA → RAD51 on the 3′ overhang (RFC 0005 §6)', () => {
  it('coats the single-stranded overhang side by side, on the strand the footprint form allows', () => {
    const snapshot = mechanism([coated]).at(0);
    expect(spans(snapshot.occupancy)).toEqual([['rpa#1', '40-46', 'bottom'], ['rpa#2', '46-52', 'bottom'], ['rpa#3', '52-58', 'bottom']]);
    expect(snapshot.occupancy['rpa#1@dna']).toEqual({ id: 'rpa#1@dna', instance: 'rpa#1', acid: 'dna', site: 'right-overhang', span: { from: 40, to: 46 }, strand: 'bottom' });
    expect(primaryPartner(snapshot, 'rpa#2')).toBe('dna.right-overhang');
    expect(snapshot.timeline.at(-1)!.changes.map(change => change.key)).toContain('occupancy.rpa#3@dna');
  });

  it('displaces RPA one copy at a time with explicit actions, and links RAD51 protomers', () => {
    const snapshot = mechanism([coated, [
      { type: 'vacate', actor: 'rpa#1' },
      { type: 'occupy', actor: 'rad51#1', target: 'dna', span: [40, 43] },
      { type: 'occupy', actor: 'rad51#2', target: 'dna', span: [43, 46] },
      { type: 'bind', actor: 'rad51#2', interface: 'protomer', target: 'rad51#1', targetInterface: 'protomer' },
      { type: 'bind', actor: 'brca2', target: 'rad51#1' },
    ]]).at(1);
    expect(spans(snapshot.occupancy)).toEqual([['rpa#2', '46-52', 'bottom'], ['rpa#3', '52-58', 'bottom'], ['rad51#1', '40-43', 'bottom'], ['rad51#2', '43-46', 'bottom']]);
    // Occupancy and interaction are independent: RAD51 is on the DNA *and* bound to its neighbour.
    expect(partnersOf(snapshot, 'rad51#1').map(partner => [partner.via, partner.reference])).toEqual([['occupancy', 'dna'], ['interaction', 'brca2'], ['interaction', 'rad51#2']]);
  });

  it('fills in the direction of the orientation and records it', () => {
    const snapshot = mechanism([[...resected, { type: 'coat', actors: ['rpa#1', 'rpa#2'], target: 'dna.right-overhang', orientation: 'reverse' }]]).at(0);
    expect(spans(snapshot.occupancy)).toEqual([['rpa#1', '52-58', 'bottom'], ['rpa#2', '46-52', 'bottom']]);
    expect(snapshot.occupancy['rpa#1@dna']!.orientation).toBe('reverse');
  });
});

describe('the occupancy rule and footprint forms', () => {
  it('rejects overlapping copies on a strand and spans that do not fit', () => {
    expect(() => mechanism([[...coated, { type: 'occupy', actor: 'rad51#1', target: 'dna', span: [44, 47] }]]))
      .toThrow(/"rad51#1" would overlap "rpa#1" on dna 40–46 \(bottom\)/);
    expect(() => mechanism([[...resected, { type: 'coat', actors: ['rad51#1', 'rad51#2'], target: 'dna.short' }]]))
      .toThrow(/2 instances need 6 nt but dna 60–65 has 5/);
    expect(() => mechanism([[...coated, { type: 'occupy', actor: 'rpa#1', target: 'dna', span: [0, 6], strand: 'top' }]]))
      .toThrow(/"rpa#1" is already on dna; vacate it first/);
  });

  it('checks the form against the strands as they are now', () => {
    expect(() => mechanism([[{ type: 'occupy', actor: 'rpa#1', target: 'dna.p' }]])).toThrow(/no single strand to occupy across 10–16; name the strand/);
    expect(() => mechanism([[{ type: 'occupy', actor: 'rpa#1', target: 'dna.p', strand: 'top' }]]))
      .toThrow(/"rpa#1" cannot occupy dna 10–16: it needs single-stranded DNA, but the bottom strand is present within 10–16/);
    expect(() => mechanism([[...resected, { type: 'occupy', actor: 'tf', target: 'dna', span: [44, 48] }]])).toThrow(/the top strand is missing within 44–48/);
    const placed = mechanism([[{ type: 'occupy', actor: 'tf', target: 'dna.p', orientation: 'reverse' }]]).at(0);
    expect(spans(placed.occupancy)).toEqual([['tf', '6-10', 'both']]);
  });

  it('is a replaceable rule over flat records: points never conflict, strands are independent', () => {
    const base = { id: 'a', instance: 'a', acid: 'dna' };
    const top = { ...base, span: { from: 0, to: 6 }, strand: 'top' as const };
    expect(occupancyConflicts([top], { ...base, id: 'b', instance: 'b' })).toEqual([]);
    expect(occupancyConflicts([top], { ...top, id: 'b', instance: 'b', strand: 'bottom' })).toEqual([]);
    expect(occupancyConflicts([top], { ...top, id: 'b', instance: 'b', strand: 'both', span: { from: 5, to: 9 } })).toEqual([top]);
    expect(occupancyConflicts([top], { ...top, id: 'b', instance: 'b', span: { from: 6, to: 9 } })).toEqual([]);
  });
});

describe('strand actions never displace occupants silently', () => {
  it('lets resection continue beside RPA but not under a duplex-bound protein', () => {
    expect(spans(mechanism([[...coated, { type: 'resect', target: 'dna.break', length: 4 }]]).at(0).occupancy)).toHaveLength(3);
    expect(() => mechanism([[...resected, { type: 'occupy', actor: 'tf', target: 'dna', span: [60, 64] }, { type: 'resect', target: 'dna.break', length: 4 }]]))
      .toThrow(/"tf" occupies dna 60–64 and would no longer fit \(the top strand is missing within 60–64\); vacate it first/);
  });

  it('requires RPA to leave before synthesis covers its strand, and duplex binders to leave before unwinding', () => {
    const gap: ActionNode[] = [{ type: 'cleave', target: 'dna.nick' }, { type: 'resect', target: 'dna.nick', length: 6 }, { type: 'occupy', actor: 'rpa#1', target: 'dna', span: [20, 26] }];
    expect(() => mechanism([[...gap, { type: 'extend', target: 'dna.nick', length: 3, by: 'polb' }]]))
      .toThrow(/"rpa#1" occupies dna 20–26 and would no longer fit \(it needs single-stranded DNA, but the top strand is present within 20–26\)/);
    expect(mechanism([[...gap, { type: 'vacate', actor: 'rpa#1' }, { type: 'extend', target: 'dna.nick', length: 3 }]]).at(0).occupancy).toEqual({});
    expect(() => mechanism([[{ type: 'occupy', actor: 'tf', target: 'dna', span: [60, 64] }, { type: 'unwind', target: 'dna.short' }]]))
      .toThrow(/"tf" occupies dna 60–64 and would no longer fit \(it needs paired DNA, but 60–64 is unwound\)/);
  });
});

describe('point occupancy (legacy bind) next to span occupancy', () => {
  it('a point claims no nucleotides; bind cannot overwrite a span; unbind leaves spans to vacate', () => {
    const snapshot = mechanism([[...coated, { type: 'bind', actor: 'brca2', target: 'dna.right-overhang' }, { type: 'unbind', actor: 'rpa#2' }]]).at(0);
    expect(snapshot.occupancy['brca2@dna']).toEqual({ id: 'brca2@dna', instance: 'brca2', acid: 'dna', site: 'right-overhang' });
    expect(snapshot.occupancy['rpa#2@dna']!.span).toEqual({ from: 46, to: 52 });
    expect(() => mechanism([[...coated, { type: 'bind', actor: 'rpa#1', target: 'dna.break' }]])).toThrow(/"rpa#1" already occupies dna; vacate it first/);
    expect(() => mechanism([[{ type: 'vacate', actor: 'rpa#1' }]])).toThrow(/"rpa#1" is not on any nucleic acid/);
  });

  it('validates targets and footprints statically', () => {
    expect(() => mechanism([[{ type: 'occupy', actor: 'brca2', target: 'dna.p' }]])).toThrow(/"brca2" has no footprint: give a span, or a site with a span/);
    expect(() => mechanism([[{ type: 'occupy', actor: 'rpa#1', target: 'dna' }]])).toThrow(/name a site or give a span/);
    expect(() => mechanism([[{ type: 'occupy', actor: 'rpa#1', target: 'dna.drawn' }]])).toThrow(/has no coordinate; a position is layout only/);
    expect(() => mechanism([[{ type: 'occupy', actor: 'rpa#1', target: 'brca2', span: [0, 6] }]])).toThrow(/"brca2" is not a nucleic acid; bind to it instead/);
    expect(() => mechanism([[{ type: 'coat', actors: ['brca2', 'rpa#1'], target: 'dna.right-overhang' }]])).toThrow(/"brca2" has no footprint to coat with/);
    expect(() => mechanism([[{ type: 'coat', actors: ['rpa#1', 'rpa#1'], target: 'dna.right-overhang' }]])).toThrow(/lists an instance twice/);
    expect(() => mechanism([[{ type: 'occupy', actor: 'rpa#1', target: 'dna', span: [6, 6] }]])).toThrow(/span must be \[from, to\] with integers 0 ≤ from < to/);
  });
});
