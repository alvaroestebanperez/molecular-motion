import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bondAt, compileMechanism, covalentPredecessor, covalentStrands, covalentSuccessor, joinedTo, migrateV6, nucleotidePresent, partnerOf, productsOf, toJsonSchema,
  type ActionNode, type CovalentStrand, type MechanismSnapshot, type Nucleotide, type StrandSpan,
} from '../src';
import { parseMechanism } from '../src/yaml';
import { allStates } from './helpers';

/** Two sister chromatids with the junction points of RFC 0008 §1 (22 and 58), and what the invalid cases need. */
const POINTS = [
  { id: 'hj-left', at: 22, strand: 'top' }, { id: 'hj-left-bottom', at: 22, strand: 'bottom' },
  { id: 'hj-right', at: 58, strand: 'bottom' }, { id: 'hj-right-top', at: 58, strand: 'top' },
  { id: 'break', at: 40 }, { id: 'window', span: [22, 58] },
  { id: 'far', at: 30, strand: 'top' }, { id: 'both', at: 30, strand: 'both' }, { id: 'bare', at: 30 },
  { id: 'cut', at: 10, strand: 'top' }, { id: 'low', at: 70, strand: 'bottom' },
  { id: 'x40', at: 40, strand: 'top' }, { id: 'x45', at: 45, strand: 'top' }, { id: 'x50', at: 50, strand: 'top' },
  { id: 'start', at: 0, strand: 'top' }, { id: 'end', at: 80, strand: 'top' },
];
const duplex = (id: string) => ({ id, type: 'dna', compartment: 'nucleus', nucleic: { length: 80 }, sites: POINTS });
const ACTORS = [
  duplex('dna'), duplex('sister'), duplex('third'), duplex('mirror'), duplex('lone'),
  { id: 'rna', type: 'rna', nucleic: { length: 36, form: 'duplex' }, sites: [{ id: 'intron', span: [12, 24] }] },
  { id: 'transcript', type: 'rna', nucleic: { length: 80 }, sites: [{ id: 'hj-left', at: 22 }] },
  { id: 'short', type: 'dna', nucleic: { length: 40 }, sites: [{ id: 'join', at: 10, strand: 'top' }] },
  { id: 'template', type: 'dna', nucleic: { length: 80 }, sites: [{ id: 'bubble', span: [20, 40] }] },
  { id: 'rag', type: 'protein', sites: [{ id: 'pocket' }] },
  { id: 'product', type: 'dna', nucleic: { length: 80 }, sites: POINTS, initial: { present: false } },
];
const ALIGNMENTS = [
  { id: 'sister', between: ['dna', 'sister'], range: [0, 80] },
  { id: 'third', between: ['dna', 'third'], range: [0, 80] },
  { id: 'transcript', between: ['dna', 'transcript'], range: [0, 80] },
  { id: 'product', between: ['dna', 'product'], range: [0, 80] },
  // A boundary at 22 is opposite one at 58 under the mirrored alignment; the direct one covers neither.
  { id: 'mirror', between: ['dna', 'mirror'], range: [0, 80], orientation: 'opposite' },
  { id: 'mirror-direct', a: { acid: 'dna', span: [0, 10] }, b: { acid: 'mirror', span: [70, 80] } },
  { id: 'mirrored-only', between: ['sister', 'mirror'], range: [0, 80], orientation: 'opposite' },
  // Offset alignments: dna 20–60 corresponds to the whole of `short`, and both to a common template.
  { id: 'short', a: { acid: 'dna', span: [20, 60] }, b: { acid: 'short', span: [0, 40] } },
  { id: 'dna-template', between: ['dna', 'template'], range: [0, 80] },
  { id: 'short-template', a: { acid: 'short', span: [0, 40] }, b: { acid: 'template', span: [20, 60] } },
];
const document = (steps: ActionNode[][], initial: Record<string, unknown> = {}) => ({
  schemaVersion: 7, mechanism: { id: 'x', name: 'X' }, compartments: ['nucleus', 'cytoplasm'],
  actors: ACTORS.map(actor => initial[actor.id] ? { ...actor, initial: initial[actor.id] } : actor), alignments: ALIGNMENTS,
  steps: steps.map((actions, index) => ({ id: `s${index}`, title: `S${index}`, actions })),
});
const mechanism = (steps: ActionNode[][], initial?: Record<string, unknown>) => compileMechanism(document(steps, initial));
const last = (steps: ActionNode[][], initial?: Record<string, unknown>) => mechanism(steps, initial).at(steps.length - 1);

const reconnect = (site: string, other = 'sister', extra: Record<string, unknown> = {}): ActionNode => ({ type: 'reconnect-strands', target: `dna.${site}`, with: `${other}.${site}`, ...extra });
const TOP_LEFT = reconnect('hj-left');
const TOP_RIGHT = reconnect('hj-right-top');
const BOTTOM_LEFT = reconnect('hj-left-bottom');
const BOTTOM_RIGHT = reconnect('hj-right');
const show: ActionNode = { type: 'show', actor: 'rag' };

/** The double Holliday junction of RFC 0008 §1, reached with real actions: break, resection, invasion, synthesis, second-end capture, synthesis, ligation. */
const DOUBLE_JUNCTION: ActionNode[] = [
  { type: 'cleave', target: 'dna.break', lesion: 'double-strand-break' },
  { type: 'resect', target: 'dna.break', length: 18 },
  { type: 'unwind', target: 'sister.window' },
  { type: 'invade', target: 'dna', strand: 'top', span: [22, 40], with: 'sister' },
  { type: 'extend', target: 'dna.break', strand: 'top', length: 18 },
  { type: 'pair', target: 'dna', strand: 'bottom', span: [40, 58], with: 'sister' },
  { type: 'extend', target: 'dna.break', strand: 'bottom', length: 18 },
  { type: 'ligate', target: 'dna.break' },
];

/** A covalent strand as RFC 0008 §4.4 writes it: 5′→3′, each stretch from its first nucleotide to its last. */
const written = ({ stretches, circular }: CovalentStrand) =>
  `${circular ? '○ ' : '5′ '}${stretches.map(({ acid, strand, from, to }) => strand === 'top' ? `${acid}.top ${from}…${to - 1}` : `${acid}.bottom ${to - 1}…${from}`).join(' → ')}${circular ? '' : ' 3′'}`;
const strands = (snapshot: MechanismSnapshot, ...acids: string[]) =>
  covalentStrands(snapshot, snapshot.definition).filter(strand => acids.includes(strand.stretches[0]!.acid)).map(written);
const spans = (list: StrandSpan[]) => list.map(({ acid, strand, from, to }) => `${acid}.${strand}[${from},${to})`).join(' + ');
const products = (snapshot: MechanismSnapshot, ...acids: string[]) =>
  productsOf(snapshot, snapshot.definition).filter(product => acids.includes(product[0]!.acid)).map(spans);
const nucleotide = (text: string): Nucleotide => { const [acid, strand, index] = text.split(/[.[\]]/); return { acid: acid!, strand: strand as 'top' | 'bottom', index: Number(index) }; };
const UNTOUCHED = ['5′ dna.top 0…79 3′', '5′ dna.bottom 79…0 3′', '5′ sister.top 0…79 3′', '5′ sister.bottom 79…0 3′'];

describe('schema v7 (RFC 0008 §11)', () => {
  it('migrates v6 by moving only the version', () => {
    const v6 = { schemaVersion: 6, actors: [{ id: 'a', type: 'protein' }], steps: [] };
    expect(migrateV6(v6)).toEqual({ ...v6, schemaVersion: 7 });
    const v7 = { schemaVersion: 7 };
    expect(migrateV6(v7)).toBe(v7);
    expect(parseMechanism({ ...document([[show]]), schemaVersion: 6 }).schemaVersion).toBe(7);
    expect(() => parseMechanism({ ...document([[show]]), schemaVersion: 8 })).toThrow(/schemaVersion must be 1, 2, 3, 4, 5, 6 or 7/);
  });

  it('declares reconnect-strands in the generated schema, and no state: a document cannot begin with a join (D8)', () => {
    const schema = toJsonSchema() as { properties: Record<string, unknown>; $defs: { action: { oneOf: Array<{ properties: Record<string, unknown> & { type: { const: string } }; required: string[] }> } } };
    expect(schema.properties.schemaVersion).toEqual({ const: 7 });
    const action = schema.$defs.action.oneOf.find(item => item.properties.type.const === 'reconnect-strands')!;
    expect(action.required).toEqual(['type', 'target', 'with']);
    expect(Object.keys(action.properties)).toEqual(['type', 'duration', 'by', 'target', 'with', 'strand']);
    expect(schema.properties).not.toHaveProperty('joins');
    expect(() => parseMechanism(document([[show]], { dna: { nucleic: { joins: [] } } }))).toThrow(/initial\.nucleic\.joins is not supported/);
  });
});

describe('the definition at work (RFC 0008 §4.4)', () => {
  it('no join: ordinary adjacency', () => {
    const snapshot = last([[show]]);
    expect(strands(snapshot, 'dna', 'sister')).toEqual(UNTOUCHED);
    expect(snapshot).not.toHaveProperty('joins');
  });

  it('1. one reciprocal reconnection on top, at 22', () => {
    const snapshot = last([[TOP_LEFT]]);
    expect(snapshot.joins).toEqual({ 'dna.top~sister.top': [
      { from: { acid: 'dna', strand: 'top', at: 22 }, to: { acid: 'sister', strand: 'top', at: 22 } },
      { from: { acid: 'sister', strand: 'top', at: 22 }, to: { acid: 'dna', strand: 'top', at: 22 } },
    ] });
    expect(covalentSuccessor(snapshot, snapshot.definition, nucleotide('dna.top[21]'))).toEqual(nucleotide('sister.top[22]'));
    expect(covalentSuccessor(snapshot, snapshot.definition, nucleotide('sister.top[21]'))).toEqual(nucleotide('dna.top[22]'));
    expect(strands(snapshot, 'dna', 'sister')).toEqual([
      '5′ dna.top 0…21 → sister.top 22…79 3′', '5′ dna.bottom 79…0 3′',
      '5′ sister.top 0…21 → dna.top 22…79 3′', '5′ sister.bottom 79…0 3′',
    ]);
  });

  it('2. one reciprocal reconnection on bottom, at 58: the stored joins have the same form, the nucleotides differ', () => {
    const snapshot = last([[BOTTOM_RIGHT]]);
    expect(snapshot.joins).toEqual({ 'dna.bottom~sister.bottom': [
      { from: { acid: 'dna', strand: 'bottom', at: 58 }, to: { acid: 'sister', strand: 'bottom', at: 58 } },
      { from: { acid: 'sister', strand: 'bottom', at: 58 }, to: { acid: 'dna', strand: 'bottom', at: 58 } },
    ] });
    expect(covalentSuccessor(snapshot, snapshot.definition, nucleotide('dna.bottom[58]'))).toEqual(nucleotide('sister.bottom[57]'));
    expect(covalentSuccessor(snapshot, snapshot.definition, nucleotide('sister.bottom[58]'))).toEqual(nucleotide('dna.bottom[57]'));
    expect(strands(snapshot, 'dna', 'sister')).toEqual([
      '5′ dna.top 0…79 3′', '5′ dna.bottom 79…58 → sister.bottom 57…0 3′',
      '5′ sister.top 0…79 3′', '5′ sister.bottom 79…58 → dna.bottom 57…0 3′',
    ]);
  });

  it('3. top at 22 and top at 58: the non-crossover topology', () => {
    expect(strands(last([[TOP_LEFT, TOP_RIGHT]]), 'dna', 'sister')).toEqual([
      '5′ dna.top 0…21 → sister.top 22…57 → dna.top 58…79 3′', '5′ dna.bottom 79…0 3′',
      '5′ sister.top 0…21 → dna.top 22…57 → sister.top 58…79 3′', '5′ sister.bottom 79…0 3′',
    ]);
  });

  it('4. top at 22 and bottom at 58: the crossover topology', () => {
    expect(strands(last([[TOP_LEFT, BOTTOM_RIGHT]]), 'dna', 'sister')).toEqual([
      '5′ dna.top 0…21 → sister.top 22…79 3′', '5′ dna.bottom 79…58 → sister.bottom 57…0 3′',
      '5′ sister.top 0…21 → dna.top 22…79 3′', '5′ sister.bottom 79…58 → dna.bottom 57…0 3′',
    ]);
  });

  it('5. excision alone gives RFC 0007\'s junction with no join stored', () => {
    const snapshot = last([[{ type: 'excise-interval', target: 'rna.intron' }]]);
    expect(snapshot).not.toHaveProperty('joins');
    expect(strands(snapshot, 'rna')).toEqual(['5′ rna.top 0…11 → rna.top 24…35 3′', '5′ rna.bottom 35…24 → rna.bottom 11…0 3′']);
  });

  it('5. excision composes with a join', () => {
    const snapshot = last([[TOP_LEFT]], { sister: { nucleic: { excised: [{ from: 40, to: 50 }] } } });
    expect(strands(snapshot, 'dna', 'sister')).toEqual([
      '5′ dna.top 0…21 → sister.top 22…39 → sister.top 50…79 3′', '5′ dna.bottom 79…0 3′',
      '5′ sister.top 0…21 → dna.top 22…79 3′', '5′ sister.bottom 79…50 → sister.bottom 39…0 3′',
    ]);
  });

  it('a missing nucleotide ends a covalent strand, and a strand of a single-stranded molecule has no bottom', () => {
    const snapshot = last([[TOP_LEFT]], { sister: { nucleic: { missing: [{ strand: 'top', from: 60, to: 70 }] } } });
    expect(strands(snapshot, 'sister')).toEqual(['5′ sister.top 0…21 → dna.top 22…79 3′', '5′ sister.top 70…79 3′', '5′ sister.bottom 79…0 3′']);
    expect(strands(snapshot, 'dna')[0]).toBe('5′ dna.top 0…21 → sister.top 22…59 3′');
    expect(strands(snapshot, 'transcript')).toEqual(['5′ transcript.top 0…79 3′']);
    expect(strands(snapshot, 'product')).toEqual([]);
  });

  it('several joins between two molecules can close a strand with no ends: it is reported once, as circular', () => {
    // a 20 ↔ b 60 under one alignment, a 60 ↔ b 20 under the other.
    const sites = (at: number) => ({ id: `p${at}`, at, strand: 'top' });
    const crossed = compileMechanism({
      schemaVersion: 7, mechanism: { id: 'x', name: 'X' },
      actors: ['a', 'b'].map(id => ({ id, type: 'dna', nucleic: { length: 80 }, sites: [sites(20), sites(60)] })),
      alignments: [{ id: 'one', a: { acid: 'a', span: [0, 40] }, b: { acid: 'b', span: [40, 80] } }, { id: 'two', a: { acid: 'a', span: [40, 80] }, b: { acid: 'b', span: [0, 40] } }],
      steps: [{ id: 's', title: 'S', actions: [{ type: 'reconnect-strands', target: 'a.p20', with: 'b.p60' }, { type: 'reconnect-strands', target: 'a.p60', with: 'b.p20' }] }],
    }).at(0);
    expect(covalentStrands(crossed, crossed.definition).filter(strand => strand.stretches[0]!.strand === 'top').map(written)).toEqual([
      '5′ a.top 0…19 → b.top 60…79 3′', '5′ b.top 0…19 → a.top 60…79 3′', '○ a.top 20…59 → b.top 20…59',
    ]);
  });
});

describe('covalent neighbours (RFC 0008 §4.2, X3)', () => {
  const STATES: Array<[string, ActionNode[], Record<string, unknown>?]> = [
    ['no join', [show]],
    ['top at 22', [TOP_LEFT]],
    ['crossover', [TOP_LEFT, BOTTOM_RIGHT]],
    ['non-crossover', [TOP_LEFT, TOP_RIGHT]],
    ['both strands at both points', [TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT]],
    ['with an excision and gaps', [TOP_LEFT, BOTTOM_RIGHT], { sister: { nucleic: { excised: [{ from: 40, to: 50 }], missing: [{ strand: 'bottom', from: 60, to: 66 }] } }, dna: { nucleic: { missing: [{ strand: 'top', from: 30, to: 34 }] } } }],
    ['the double junction, resolved', [...DOUBLE_JUNCTION, TOP_LEFT, BOTTOM_RIGHT]],
    ['a third molecule', [TOP_LEFT, reconnect('hj-right-top', 'third')]],
  ];

  it.each(STATES)('successor and predecessor are inverse of each other over every present nucleotide: %s', (_, actions, initial) => {
    const snapshot = last([actions], initial);
    let present = 0;
    for (const actor of snapshot.definition.actors) {
      if (actor.type !== 'dna' && actor.type !== 'rna') continue;
      for (const strand of ['top', 'bottom'] as const) for (let index = -1; index <= actor.nucleic!.length!; index += 1) {
        const at = { acid: actor.id, strand, index };
        const [next, previous] = [covalentSuccessor(snapshot, snapshot.definition, at), covalentPredecessor(snapshot, snapshot.definition, at)];
        if (!nucleotidePresent(snapshot, snapshot.definition, at)) { expect([next, previous]).toEqual([undefined, undefined]); continue; }
        present += 1;
        if (next) expect(covalentPredecessor(snapshot, snapshot.definition, next), `after ${actor.id}.${strand}[${index}]`).toEqual(at);
        if (previous) expect(covalentSuccessor(snapshot, snapshot.definition, previous), `before ${actor.id}.${strand}[${index}]`).toEqual(at);
        if (next) expect(nucleotidePresent(snapshot, snapshot.definition, next)).toBe(true);
      }
    }
    // Every present nucleotide lies on exactly one covalent strand.
    const counted = covalentStrands(snapshot, snapshot.definition).flatMap(strand => strand.stretches).reduce((sum, stretch) => sum + stretch.to - stretch.from, 0);
    expect(counted).toBe(present);
    expect(productsOf(snapshot, snapshot.definition).flat().reduce((sum, span) => sum + span.to - span.from, 0)).toBe(present);
  });

  it('reads nothing but joins, excised, missing and polarity: a break lesion does not end a covalent strand', () => {
    const snapshot = last([[TOP_LEFT, { type: 'cleave', target: 'dna.hj-left' }, { type: 'cleave', target: 'dna.cut' }]]);
    expect(snapshot.sites['dna.hj-left']).toEqual({ lesion: 'single-strand-break' });
    expect(strands(snapshot, 'dna')[0]).toBe('5′ dna.top 0…21 → sister.top 22…79 3′');
  });

  it('joinedTo names the molecules a molecule shares a join with, and only those', () => {
    const snapshot = last([[TOP_LEFT, reconnect('hj-right-top', 'third')]]);
    expect(joinedTo(snapshot, 'dna')).toEqual(['sister', 'third']);
    expect(joinedTo(snapshot, 'sister')).toEqual(['dna']);
    expect(joinedTo(snapshot, 'lone')).toEqual([]);
    expect(joinedTo(last([[show]]), 'dna')).toEqual([]);
  });
});

describe('reconnect-strands (RFC 0008 §5)', () => {
  it('writes the two joins and touches nothing else: no strand range, pairing, occupancy or actor state (X1, X7)', () => {
    const compiled = mechanism([DOUBLE_JUNCTION, [TOP_LEFT]]);
    const [before, after] = [compiled.at(0), compiled.at(1)];
    expect(after.timeline[0]).toMatchObject({ type: 'reconnect-strands', primitive: 'reconnect-strands', subject: 'dna.hj-left', presentation: { verb: 'reconnects with' } });
    expect(after.timeline[0]!.changes.map(change => change.key)).toEqual(['joins.dna.top~sister.top']);
    for (const key of ['actors', 'sites', 'interactions', 'occupancy', 'pairings'] as const) expect(after[key], key).toEqual(before[key]);
    // The heteroduplex between the two points was already state, and still is.
    expect(partnerOf(after, after.definition, { acid: 'sister', strand: 'top', from: 0, to: 80 }).map(item => `${item.from}-${item.to}:${item.partner}`)).toEqual(['0-22:cis', '22-58:trans', '58-80:cis']);
  });

  it('takes the strand from the action when a site is on both strands or names none, and from a single-stranded molecule', () => {
    expect(Object.keys(last([[reconnect('both', 'sister', { strand: 'bottom' })]]).joins!)).toEqual(['dna.bottom~sister.bottom']);
    expect(Object.keys(last([[reconnect('bare', 'sister', { strand: 'top' })]]).joins!)).toEqual(['dna.top~sister.top']);
    expect(Object.keys(last([[reconnect('hj-left', 'sister', { strand: 'top' })]]).joins!)).toEqual(['dna.top~sister.top']);
    expect(strands(last([[reconnect('hj-left', 'transcript')]]), 'transcript')).toEqual(['5′ transcript.top 0…21 → dna.top 22…79 3′']);
  });

  it('joins are stored normalised, keyed by strand pair and sorted by coordinate, whatever the order of the actions (X4)', () => {
    const forward = last([[TOP_LEFT, TOP_RIGHT, BOTTOM_RIGHT]]);
    const backward = last([[
      { type: 'reconnect-strands', target: 'sister.hj-right', with: 'dna.hj-right' },
      { type: 'reconnect-strands', target: 'sister.hj-right-top', with: 'dna.hj-right-top' },
      { type: 'reconnect-strands', target: 'sister.hj-left', with: 'dna.hj-left' },
    ]]);
    expect(forward.joins!['dna.top~sister.top']!.map(join => `${join.from.acid}@${join.from.at}`)).toEqual(['dna@22', 'sister@22', 'dna@58', 'sister@58']);
    expect(backward.joins!['dna.top~sister.top']).toEqual(forward.joins!['dna.top~sister.top']);
    expect(backward.joins!['dna.bottom~sister.bottom']).toEqual(forward.joins!['dna.bottom~sister.bottom']);
    // X5: every join has its reciprocal.
    for (const list of Object.values(forward.joins!)) for (const join of list) expect(list).toContainEqual({ from: join.to, to: join.from });
  });

  it('reconnecting twice at the same place restores the previous snapshot exactly, with no joins key (§12.3, D5)', () => {
    const compiled = mechanism([DOUBLE_JUNCTION, [TOP_LEFT], [TOP_LEFT], [TOP_LEFT, { type: 'reconnect-strands', target: 'sister.hj-left', with: 'dna.hj-left' }]]);
    const state = (index: number) => { const { timeline, duration, stepIndex, step, ...rest } = compiled.at(index); return JSON.parse(JSON.stringify(rest)); };
    expect(compiled.at(1)).toHaveProperty('joins');
    for (const index of [2, 3]) {
      expect(compiled.at(index)).not.toHaveProperty('joins');
      expect(Object.keys(compiled.at(index))).toEqual(Object.keys(compiled.at(0)));
      expect(state(index)).toEqual(state(0));
    }
    expect(compiled.at(2).timeline[0]!.changes).toEqual([{ key: 'joins.dna.top~sister.top', from: compiled.at(1).joins!['dna.top~sister.top'], to: undefined }]);
    // One of two reconnections undone leaves the other, and its key.
    expect(last([[TOP_LEFT, BOTTOM_RIGHT, TOP_LEFT]]).joins).toEqual(last([[BOTTOM_RIGHT]]).joins);
  });

  it('is atomic: a break on either site is cleared, because the bond it interrupted no longer exists (D3)', () => {
    const compiled = mechanism([[{ type: 'cleave', target: 'dna.hj-left' }, { type: 'cleave', target: 'sister.hj-left' }], [TOP_LEFT]]);
    expect(compiled.at(0).sites).toMatchObject({ 'dna.hj-left': { lesion: 'single-strand-break' }, 'sister.hj-left': { lesion: 'single-strand-break' } });
    expect(compiled.at(1).sites['dna.hj-left']).toEqual({});
    expect(compiled.at(1).sites['sister.hj-left']).toEqual({});
    expect(compiled.at(1).timeline[0]!.changes.map(change => change.key).sort()).toEqual(['joins.dna.top~sister.top', 'sites.dna.hj-left.lesion', 'sites.sister.hj-left.lesion']);
    // It stands alone too, as a recombinase cuts and joins in one reaction; and one nicked site is enough.
    expect(last([[{ type: 'cleave', target: 'sister.hj-left', lesion: 'nick' }, TOP_LEFT]]).sites['sister.hj-left']).toEqual({});
  });

  it('clears only a break of the strand it reconnects, and no other lesion or site', () => {
    const snapshot = last([[
      { type: 'cleave', target: 'dna.bare' }, { type: 'damage', target: 'sister.bare' }, { type: 'cleave', target: 'dna.far' },
      reconnect('bare', 'sister', { strand: 'bottom' }),
    ]]);
    // An unstranded site holds its break on top (RFC 0004 §3); the bottom strand was reconnected.
    expect(snapshot.sites).toMatchObject({ 'dna.bare': { lesion: 'single-strand-break' }, 'sister.bare': { lesion: 'base-damage' }, 'dna.far': { lesion: 'single-strand-break' } });
    expect(last([[{ type: 'cleave', target: 'dna.bare' }, reconnect('bare', 'sister', { strand: 'top' })]]).sites['dna.bare']).toEqual({});
    expect(() => mechanism([[{ type: 'cleave', target: 'dna.both', lesion: 'double-strand-break' }, reconnect('both', 'sister', { strand: 'top' })]]))
      .toThrow(/"dna.both" carries a double-strand-break, which also cuts the bottom strand; one strand is reconnected at a time/);
  });

  it('does not fail because of pairings or occupants at the point (§6.3)', () => {
    const occupied: ActionNode[] = [{ type: 'bind', actor: 'rag', target: 'dna.hj-left' }, TOP_LEFT];
    expect(last([occupied]).occupancy['rag@dna']).toMatchObject({ acid: 'dna', site: 'hj-left' });
    expect(() => mechanism([[...DOUBLE_JUNCTION, TOP_LEFT, BOTTOM_RIGHT]])).not.toThrow();
  });

  it('two reconnections of the same pair of strands in parallel branches conflict; of different strands they do not', () => {
    expect(() => mechanism([[{ parallel: [TOP_LEFT, TOP_RIGHT] }]])).toThrow(/parallel branches \[0\] and \[1\] both change joins.dna.top~sister.top/);
    expect(() => mechanism([[{ parallel: [TOP_LEFT, BOTTOM_RIGHT] }]])).not.toThrow();
  });
});

describe('sites at a join (RFC 0008 §6.1)', () => {
  it('a point site names one bond: the one of the nucleotide before its coordinate, on its own molecule and strand', () => {
    const snapshot = last([[TOP_LEFT, BOTTOM_RIGHT]]);
    const bond = (acid: string, strand: 'top' | 'bottom', at: number) => bondAt(snapshot, snapshot.definition, { acid, strand, at });
    expect(bond('dna', 'top', 22)).toEqual({ from: nucleotide('dna.top[21]'), to: nucleotide('sister.top[22]') });
    expect(bond('sister', 'top', 22)).toEqual({ from: nucleotide('sister.top[21]'), to: nucleotide('dna.top[22]') });
    expect(bond('dna', 'bottom', 58)).toEqual({ from: nucleotide('sister.bottom[58]'), to: nucleotide('dna.bottom[57]') });
    expect(bond('sister', 'bottom', 58)).toEqual({ from: nucleotide('dna.bottom[58]'), to: nucleotide('sister.bottom[57]') });
    // Away from a join it is ordinary adjacency, and at an excised interval the junction, from either end.
    expect(bond('dna', 'top', 40)).toEqual({ from: nucleotide('dna.top[39]'), to: nucleotide('dna.top[40]') });
    expect(bond('dna', 'bottom', 40)).toEqual({ from: nucleotide('dna.bottom[40]'), to: nucleotide('dna.bottom[39]') });
    const spliced = last([[{ type: 'excise-interval', target: 'rna.intron' }]]);
    for (const at of [12, 24]) expect(bondAt(spliced, spliced.definition, { acid: 'rna', strand: 'top', at })).toEqual({ from: nucleotide('rna.top[11]'), to: nucleotide('rna.top[24]') });
    expect(bondAt(snapshot, snapshot.definition, { acid: 'dna', strand: 'top', at: 0 })).toBeUndefined();
  });

  it('cleave breaks that bond and ligate reseals it; break state stays per site, and nothing is aliased (X10)', () => {
    const compiled = mechanism([[TOP_LEFT, { type: 'cleave', target: 'dna.hj-left' }], [{ type: 'ligate', target: 'dna.hj-left' }]]);
    expect(compiled.at(0).sites['dna.hj-left']).toEqual({ lesion: 'single-strand-break' });
    expect(compiled.at(0).sites['sister.hj-left']).toEqual({});
    expect(compiled.at(0).joins).toEqual(last([[TOP_LEFT]]).joins);
    expect(compiled.at(1).sites['dna.hj-left']).toEqual({});
    expect(compiled.at(1).joins).toEqual(compiled.at(0).joins);
    // The other site names the other bond, which was never cut.
    expect(() => mechanism([[TOP_LEFT, { type: 'cleave', target: 'dna.hj-left' }, { type: 'ligate', target: 'sister.hj-left' }]])).toThrow(/no strand break to ligate at "sister.hj-left"/);
    // Nor is it shared with a site at the same coordinate on the other strand.
    expect(() => mechanism([[TOP_LEFT, { type: 'cleave', target: 'dna.hj-left' }, { type: 'ligate', target: 'dna.hj-left-bottom' }]])).toThrow(/no strand break to ligate at "dna.hj-left-bottom"/);
  });

  it('ligate keeps its rule on the bond the site names: it refuses while an end of that bond is missing, on whichever molecule it is', () => {
    // dna.hj-left names dna.top[21] → sister.top[22]; sister.hj-left names sister.top[21] → dna.top[22].
    const gapped: ActionNode[] = [TOP_LEFT, { type: 'cleave', target: 'dna.hj-left' }, { type: 'cleave', target: 'sister.hj-left' }, { type: 'resect', target: 'sister.hj-left', length: 4 }];
    const snapshot = last([gapped]);
    expect(snapshot.actors.sister!.nucleic!.missing).toEqual([{ strand: 'top', from: 22, to: 26 }]);
    expect(bondAt(snapshot, snapshot.definition, { acid: 'dna', strand: 'top', at: 22 })).toBeUndefined();
    expect(() => mechanism([[...gapped, { type: 'ligate', target: 'dna.hj-left' }]])).toThrow(/the top strand is missing nucleotides at "dna.hj-left"; fill the gap with extend before ligating/);
    expect(last([[...gapped, { type: 'ligate', target: 'sister.hj-left' }]]).sites['sister.hj-left']).toEqual({});
    // On bottom the site's nucleotide is the destination: dna.hj-right names sister.bottom[58] → dna.bottom[57].
    const below: ActionNode[] = [BOTTOM_RIGHT, { type: 'cleave', target: 'dna.hj-right' }, { type: 'cleave', target: 'sister.hj-right' }];
    expect(() => mechanism([[...below, { type: 'resect', target: 'dna.hj-right', length: 4 }, { type: 'ligate', target: 'dna.hj-right' }]])).toThrow(/the bottom strand is missing nucleotides at "dna.hj-right"/);
    expect(last([[...below, { type: 'resect', target: 'dna.hj-right', length: 4 }, { type: 'ligate', target: 'sister.hj-right' }]]).sites['sister.hj-right']).toEqual({});
  });

  it('read as a base a site still denotes its own nucleotide', () => {
    expect(last([[TOP_LEFT, { type: 'damage', target: 'dna.hj-left' }]]).sites['dna.hj-left']).toEqual({ lesion: 'base-damage' });
  });
});

describe('products (RFC 0008 §5.1)', () => {
  const junction = (...resolution: ActionNode[]) => last([[...DOUBLE_JUNCTION, ...resolution]]);

  it('the double Holliday junction is reached with existing actions, and is not a covalent structure (§1)', () => {
    const snapshot = junction();
    expect(snapshot).not.toHaveProperty('joins');
    expect(Object.values(snapshot.sites).every(site => !site.lesion)).toBe(true);
    const partners = (acid: string, strand: 'top' | 'bottom') => partnerOf(snapshot, snapshot.definition, { acid, strand, from: 0, to: 80 })
      .map(item => `${item.from}–${item.to} ${item.partner}${item.partner === 'trans' ? ` → ${item.with.acid}.${item.with.strand}` : ''}`);
    expect(partners('dna', 'top')).toEqual(['0–22 cis', '22–58 trans → sister.bottom', '58–80 cis']);
    expect(partners('dna', 'bottom')).toEqual(['0–22 cis', '22–58 trans → sister.top', '58–80 cis']);
    expect(partners('sister', 'top')).toEqual(['0–22 cis', '22–58 trans → dna.bottom', '58–80 cis']);
    expect(partners('sister', 'bottom')).toEqual(['0–22 cis', '22–58 trans → dna.top', '58–80 cis']);
    expect(strands(snapshot, 'dna', 'sister')).toEqual(UNTOUCHED);
    expect(products(snapshot, 'dna', 'sister')).toEqual(['dna.top[0,80) + dna.bottom[0,80) + sister.top[0,80) + sister.bottom[0,80)']);
  });

  it('one junction alone gives one product: the molecules are still joined by the second', () => {
    for (const one of [TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT]) expect(products(junction(one), 'dna', 'sister')).toHaveLength(1);
  });

  it('the same strand at both junctions gives two products: a non-crossover, with a patch of the sister\'s strand', () => {
    expect(products(junction(TOP_LEFT, TOP_RIGHT), 'dna', 'sister')).toEqual([
      'dna.top[0,22) + dna.top[58,80) + dna.bottom[0,80) + sister.top[22,58)',
      'dna.top[22,58) + sister.top[0,22) + sister.top[58,80) + sister.bottom[0,80)',
    ]);
    expect(products(junction(BOTTOM_LEFT, BOTTOM_RIGHT), 'dna', 'sister')).toEqual([
      'dna.top[0,80) + dna.bottom[0,22) + dna.bottom[58,80) + sister.bottom[22,58)',
      'dna.bottom[22,58) + sister.top[0,80) + sister.bottom[0,22) + sister.bottom[58,80)',
    ]);
  });

  it('different strands at the two junctions give two products: a crossover, with the arms swapped (§12.1)', () => {
    const snapshot = junction({ type: 'cleave', target: 'dna.hj-left' }, { type: 'cleave', target: 'sister.hj-left' }, TOP_LEFT, BOTTOM_RIGHT);
    expect(products(snapshot, 'dna', 'sister')).toEqual([
      'dna.top[0,22) + dna.bottom[0,58) + sister.top[22,80) + sister.bottom[58,80)',
      'dna.top[22,80) + dna.bottom[58,80) + sister.top[0,22) + sister.bottom[0,58)',
    ]);
    expect(products(junction(BOTTOM_LEFT, TOP_RIGHT), 'dna', 'sister')).toEqual([
      'dna.top[0,58) + dna.bottom[0,22) + sister.top[58,80) + sister.bottom[22,80)',
      'dna.top[58,80) + dna.bottom[22,80) + sister.top[0,58) + sister.bottom[0,22)',
    ]);
    // §12.1: the four joins, no lesion on any of the four sites, and the strand from dna.top[0] ends at sister.top[79].
    expect(Object.values(snapshot.joins!).flat()).toHaveLength(4);
    for (const site of ['dna.hj-left', 'sister.hj-left', 'dna.hj-right', 'sister.hj-right']) expect(snapshot.sites[site]).toEqual({});
    expect(strands(snapshot, 'dna')[0]).toBe('5′ dna.top 0…21 → sister.top 22…79 3′');
    expect(snapshot.actors.dna!.nucleic).toEqual(junction().actors.dna!.nucleic);
    expect(snapshot.pairings).toEqual(junction().pairings);
  });

  it('without the pairing a crossover does not separate: the reconnection does not imply it (§5.2)', () => {
    expect(products(last([[TOP_LEFT, BOTTOM_RIGHT]]), 'dna', 'sister')).toHaveLength(1);
    expect(products(last([[show]]), 'dna', 'sister', 'rna')).toEqual(['dna.top[0,80) + dna.bottom[0,80)', 'sister.top[0,80) + sister.bottom[0,80)', 'rna.top[0,36) + rna.bottom[0,36)']);
  });
});

describe('invalid reconnections (RFC 0008 §8)', () => {
  const failing = (action: Record<string, unknown>, initial?: Record<string, unknown>, before: ActionNode[] = []) =>
    () => mechanism([[...before, { type: 'reconnect-strands', ...action } as ActionNode]], initial);

  it.each([
    [{ target: 'dna.window', with: 'sister.hj-left' }, /"dna.window" is not a point site of a nucleic acid: reconnect-strands needs a site with a point coordinate \(at\) on each molecule/],
    [{ target: 'dna.hj-left', with: 'sister.window' }, /"sister.window" is not a point site of a nucleic acid/],
    [{ target: 'dna.hj-left', with: 'rag.pocket' }, /"rag.pocket" is not a point site of a nucleic acid/],
    [{ target: 'dna.hj-left', with: 'sister' }, /with must reference a site \(actor.site\)/],
    [{ target: 'dna.hj-left', with: 'dna.hj-right-top' }, /are on the same molecule: reconnection is between two molecules; a deletion is excise-interval/],
    [{ target: 'dna.hj-left', with: 'lone.hj-left' }, /no alignment relates "dna" and "lone"; declare one in alignments/],
    [{ target: 'sister.hj-left', with: 'mirror.hj-right-top' }, /every alignment between "sister" and "mirror" is mirrored \(orientation: opposite\): reconnection across a mirrored alignment is not supported/],
    [{ target: 'dna.both', with: 'sister.both' }, /name the strand: one strand is reconnected at a time, and site "dna.both" is on both; set strand/],
    [{ target: 'dna.bare', with: 'sister.bare' }, /name the strand: one strand is reconnected at a time, and site "dna.bare" names none; set strand/],
    [{ target: 'dna.far', with: 'sister.bare' }, /name the strand: one strand is reconnected at a time, and site "sister.bare" names none/],
    [{ target: 'dna.hj-left', with: 'sister.hj-left-bottom' }, /"dna.hj-left" is on the top strand and "sister.hj-left-bottom" on the bottom strand: a join connects strands of the same name/],
    [{ target: 'dna.hj-left', with: 'sister.hj-left', strand: 'bottom' }, /site "dna.hj-left" is on the top strand, not the bottom strand/],
    [{ target: 'dna.both', with: 'transcript.hj-left', strand: 'bottom' }, /"transcript" is single-stranded and has no bottom strand/],
  ])('rejects the document %#', (action, message) => {
    expect(() => parseMechanism(document([[{ type: 'reconnect-strands', ...action } as ActionNode]]))).toThrow(message);
  });

  it('the sites are not opposite each other under any alignment', () => {
    expect(failing({ target: 'dna.hj-left', with: 'sister.far' })).toThrow(/"dna.hj-left" \(dna 22\) and "sister.far" \(sister 30\) are not opposite each other under any alignment/);
    // An alignment that relates the molecules elsewhere does not help.
    expect(failing({ target: 'dna.x45', with: 'short.join' })).toThrow(/are not opposite each other under any alignment/);
  });

  it('the only alignment that puts the sites opposite each other is mirrored (D12)', () => {
    expect(failing({ target: 'dna.hj-left', with: 'mirror.hj-right-top' }))
      .toThrow(/"dna.hj-left" and "mirror.hj-right-top" are opposite each other only under alignment "mirror", which is mirrored \(orientation: opposite\): reconnection across a mirrored alignment is not supported/);
  });

  it('a nucleotide next to the point is missing or excised: nothing to join there', () => {
    expect(failing({ target: 'dna.hj-left', with: 'sister.hj-left' }, { sister: { nucleic: { missing: [{ strand: 'top', from: 22, to: 30 }] } } }))
      .toThrow(/nothing to join at "sister.hj-left": nucleotide 22 is missing on the top strand/);
    expect(failing({ target: 'dna.hj-left', with: 'sister.hj-left' }, { dna: { nucleic: { missing: [{ strand: 'top', from: 10, to: 22 }] } } }))
      .toThrow(/nothing to join at "dna.hj-left": nucleotide 21 is missing on the top strand/);
    // The other strand may be missing: one strand is reconnected at a time.
    expect(failing({ target: 'dna.hj-left', with: 'sister.hj-left' }, { sister: { nucleic: { missing: [{ strand: 'bottom', from: 10, to: 30 }] } } })).not.toThrow();
    const excised = { sister: { nucleic: { excised: [{ from: 40, to: 50 }] } } };
    expect(failing({ target: 'dna.x40', with: 'sister.x40' }, excised)).toThrow(/nothing to join at "sister.x40": nucleotide 40 was excised/);
    expect(failing({ target: 'dna.x50', with: 'sister.x50' }, excised)).toThrow(/nothing to join at "sister.x50": nucleotide 49 was excised/);
    expect(failing({ target: 'dna.x45', with: 'sister.x45' }, excised)).toThrow(/site "sister.x45" was excised/);
    expect(failing({ target: 'dna.start', with: 'sister.start' })).toThrow(/nothing to join at "dna.start": it is at the end of "dna"/);
    expect(failing({ target: 'dna.end', with: 'sister.end' })).toThrow(/nothing to join at "dna.end": it is at the end of "dna"/);
  });

  it('the same holds for undoing: it seals two bonds as well', () => {
    const resected: ActionNode[] = [TOP_LEFT, { type: 'cleave', target: 'sister.hj-left' }, { type: 'resect', target: 'sister.hj-left', length: 4 }];
    expect(() => mechanism([[...resected, TOP_LEFT]])).toThrow(/nothing to join at "sister.hj-left": nucleotide 22 is missing on the top strand/);
  });

  it('the strand already has a join there with a third molecule (X3)', () => {
    expect(failing({ target: 'dna.hj-left', with: 'third.hj-left' }, undefined, [TOP_LEFT]))
      .toThrow(/the top strand of "dna" is already joined to "sister" at "dna.hj-left" \(sister 22\); undo that reconnection first/);
    expect(failing({ target: 'third.hj-left', with: 'dna.hj-left' }, undefined, [TOP_LEFT])).toThrow(/the top strand of "dna" is already joined to "sister" at "dna.hj-left"/);
    // The other strand at the same coordinate, and the same strand elsewhere, are free.
    expect(failing({ target: 'dna.hj-left-bottom', with: 'third.hj-left-bottom' }, undefined, [TOP_LEFT])).not.toThrow();
    expect(failing({ target: 'dna.hj-right-top', with: 'third.hj-right-top' }, undefined, [TOP_LEFT])).not.toThrow();
  });

  it('both molecules must be present (X8)', () => {
    expect(failing({ target: 'dna.hj-left', with: 'product.hj-left' })).toThrow(/"product" is not present/);
    expect(failing({ target: 'dna.hj-left', with: 'sister.hj-left' }, undefined, [{ type: 'degrade', actor: 'sister' }])).toThrow(/"sister" is not present/);
  });
});

describe('the rest of the model at a join (RFC 0008 §6)', () => {
  it('degrade of a joined molecule fails: its result cannot be represented (§6.4, D7b, X11)', () => {
    expect(() => mechanism([[TOP_LEFT, { type: 'degrade', actor: 'dna' }]])).toThrow(/"dna" is covalently joined to "sister"; undo the reconnection first/);
    expect(() => mechanism([[TOP_LEFT, { type: 'degrade', actor: 'sister' }]])).toThrow(/"sister" is covalently joined to "dna"; undo the reconnection first/);
    expect(() => mechanism([[TOP_LEFT, reconnect('hj-right-top', 'third'), { type: 'degrade', actor: 'dna' }]])).toThrow(/"dna" is covalently joined to "sister" and "third"; undo the reconnection first/);
    // A molecule with no join of its own is degraded as always, and so is one whose reconnection was undone.
    expect(last([[TOP_LEFT, { type: 'degrade', actor: 'third' }]]).actors.third).toMatchObject({ present: false });
    const undone = last([[TOP_LEFT, TOP_LEFT, { type: 'degrade', actor: 'dna' }]]);
    expect(undone.actors.dna).toMatchObject({ present: false });
    expect(undone).not.toHaveProperty('joins');
  });

  it('translocate is unchanged: it sets the compartment of the molecule it names, and includeBound does not follow joins (D7a)', () => {
    for (const includeBound of [false, true]) {
      const compiled = mechanism([[TOP_LEFT, BOTTOM_RIGHT], [{ type: 'translocate', actor: 'dna', to: 'cytoplasm', includeBound }]]);
      expect(compiled.at(1).timeline[0]!.changes).toEqual([{ key: 'actors.dna.compartment', from: 'nucleus', to: 'cytoplasm' }]);
      expect(compiled.at(1).actors.dna!.compartment).toBe('cytoplasm');
      expect(compiled.at(1).actors.sister!.compartment).toBe('nucleus');
      expect(compiled.at(1).joins).toEqual(compiled.at(0).joins);
    }
  });

  it('the rest of an actor\'s state stays on the authored molecule named (D7c)', () => {
    const snapshot = last([[TOP_LEFT, { type: 'hide', actor: 'dna' }, { type: 'phosphorylate', actor: 'dna' }]]);
    expect(snapshot.actors.dna).toMatchObject({ visible: false, modifications: [{ kind: 'phosphorylation' }] });
    expect(snapshot.actors.sister).toMatchObject({ visible: true, modifications: [] });
  });

  it('resect reaches a join and starts from one, but does not pass it: the strand continues in another molecule (§6.2)', () => {
    const cut: ActionNode[] = [TOP_LEFT, { type: 'cleave', target: 'dna.cut' }];
    expect(last([[...cut, { type: 'resect', target: 'dna.cut', length: 12 }]]).actors.dna!.nucleic!.missing).toEqual([{ strand: 'top', from: 10, to: 22 }]);
    expect(() => mechanism([[...cut, { type: 'resect', target: 'dna.cut', length: 13 }]]))
      .toThrow(/cannot resect past dna 22 on the top strand: the strand continues in another molecule \("sister"\); resect up to the join, then name a site of "sister" to go on/);
    // To go on, the author names a site of the other molecule: the covalent strand is dna.top 0…21 → sister.top 22…79.
    const onward = last([[...cut, { type: 'resect', target: 'dna.cut', length: 12 }, { type: 'cleave', target: 'sister.hj-left' }, { type: 'resect', target: 'sister.hj-left', length: 6 }]]);
    expect(onward.actors.sister!.nucleic!.missing).toEqual([{ strand: 'top', from: 22, to: 28 }]);
    expect(onward.actors.dna!.nucleic!.missing).toEqual([{ strand: 'top', from: 10, to: 22 }]);
    // A gap that reaches the join from both sides is still two strands: resection does not run through it.
    const both: ActionNode[] = [...cut, { type: 'resect', target: 'dna.cut', length: 12 }, { type: 'cleave', target: 'dna.hj-left' }, { type: 'resect', target: 'dna.hj-left', length: 4 }];
    expect(last([both]).actors.dna!.nucleic!.missing).toEqual([{ strand: 'top', from: 10, to: 26 }]);
    expect(() => mechanism([[...both, { type: 'resect', target: 'dna.cut', length: 1 }]])).toThrow(/cannot resect past dna 22 on the top strand/);
    // On bottom the 5′ end faces decreasing coordinates.
    const below: ActionNode[] = [BOTTOM_RIGHT, { type: 'cleave', target: 'dna.low' }];
    expect(last([[...below, { type: 'resect', target: 'dna.low', length: 12 }]]).actors.dna!.nucleic!.missing).toEqual([{ strand: 'bottom', from: 58, to: 70 }]);
    expect(() => mechanism([[...below, { type: 'resect', target: 'dna.low', length: 13 }]])).toThrow(/cannot resect past dna 58 on the bottom strand: the strand continues in another molecule \("sister"\)/);
    // A join on the other strand is not in the way.
    expect(() => mechanism([[BOTTOM_LEFT, { type: 'cleave', target: 'dna.cut' }, { type: 'resect', target: 'dna.cut', length: 20 }]])).not.toThrow();
  });

  it('excise-interval fails over or beside a join (§6.2)', () => {
    const excise = (from: number, to: number, acid = 'dna'): ActionNode => ({ type: 'excise-interval', target: acid, span: [from, to] });
    expect(() => mechanism([[TOP_LEFT, excise(18, 26)]])).toThrow(/the top strand of "dna" is joined to "sister" at 22, within dna 18–26; undo the reconnection first/);
    expect(() => mechanism([[TOP_LEFT, excise(22, 30)]])).toThrow(/the top strand of "dna" is joined to "sister" at 22, beside dna 22–30; undo the reconnection first/);
    expect(() => mechanism([[TOP_LEFT, excise(10, 22)]])).toThrow(/the top strand of "dna" is joined to "sister" at 22, beside dna 10–22; undo the reconnection first/);
    expect(() => mechanism([[TOP_LEFT, excise(18, 26, 'sister')]])).toThrow(/the top strand of "sister" is joined to "dna" at 22, within sister 18–26/);
    expect(() => mechanism([[BOTTOM_RIGHT, excise(50, 60)]])).toThrow(/the bottom strand of "dna" is joined to "sister" at 58, within dna 50–60/);
    // Away from the join, on the joined molecule or another, it excises as always; and after undoing, anywhere.
    expect(last([[TOP_LEFT, excise(30, 36)]]).actors.dna!.nucleic!.excised).toEqual([{ from: 30, to: 36 }]);
    expect(last([[TOP_LEFT, excise(18, 26, 'third')]]).actors.third!.nucleic!.excised).toEqual([{ from: 18, to: 26 }]);
    expect(last([[TOP_LEFT, TOP_LEFT, excise(18, 26)]]).actors.dna!.nucleic!.excised).toEqual([{ from: 18, to: 26 }]);
  });

  it('extend across a join names the other molecule\'s site: the 3′-terminal nucleotide is found covalently (§6.2)', () => {
    // dna.top 0…21 → sister.top 22…79, with sister.top 22–30 removed: the 3′ end is dna.top[21], the gap is the sister's.
    const gapped: ActionNode[] = [TOP_LEFT, { type: 'cleave', target: 'sister.hj-left' }, { type: 'resect', target: 'sister.hj-left', length: 8 }];
    expect(strands(last([gapped]), 'dna')[0]).toBe('5′ dna.top 0…21 3′');
    const snapshot = last([[...gapped, { type: 'extend', target: 'sister.hj-left', length: 8 }]]);
    expect(snapshot.actors.sister!.nucleic).toEqual({ missing: [], nascent: [{ strand: 'top', from: 22, to: 30 }], open: [] });
    expect(snapshot.actors.dna).not.toHaveProperty('nucleic');
    expect(strands(snapshot, 'dna')[0]).toBe('5′ dna.top 0…21 → sister.top 22…79 3′');
    // The molecule that holds the 3′ end has no gap of its own to fill.
    expect(() => mechanism([[...gapped, { type: 'extend', target: 'dna.hj-left', length: 8 }]])).toThrow(/no 3′ end facing a gap at "dna.hj-left"/);
    // Without the 3′ end there is nothing to extend from: here dna.top[21] was resected away too.
    const noEnd: ActionNode[] = [...gapped, { type: 'cleave', target: 'dna.cut' }, { type: 'resect', target: 'dna.cut', length: 12 }];
    expect(() => mechanism([[...noEnd, { type: 'extend', target: 'sister.hj-left', length: 8 }]])).toThrow(/no 3′ end facing a gap at "sister.hj-left"/);
  });

  it('extend across a join prolongs the pairing that holds the 3′ end, on the coordinates of the molecule it fills', () => {
    // dna 30 is opposite short 10. The 3′ end dna.top[29] is paired with the template; the gap is short.top 10–20.
    const snapshot = last([[
      { type: 'reconnect-strands', target: 'dna.far', with: 'short.join' },
      { type: 'cleave', target: 'short.join' }, { type: 'resect', target: 'short.join', length: 10 },
      { type: 'unwind', target: 'template.bubble' }, { type: 'unwind', target: 'dna.far', length: 20 },
      { type: 'pair', target: 'dna', strand: 'top', span: [20, 30], with: 'template', alignment: 'dna-template' },
      { type: 'extend', target: 'short.join', length: 10 },
    ]]);
    expect(snapshot.pairings['short.top~template.bottom']).toEqual([{ ends: [{ acid: 'short', strand: 'top', from: 10, to: 20 }, { acid: 'template', strand: 'bottom', from: 30, to: 40 }] }]);
    expect(snapshot.actors.short!.nucleic).toEqual({ missing: [], nascent: [{ strand: 'top', from: 10, to: 20 }], open: [{ from: 10, to: 20 }] });
    expect(strands(snapshot, 'dna')[0]).toBe('5′ dna.top 0…29 → short.top 10…39 3′');
  });

  it('extend fills a gap of its own molecule and stops at a join inside it', () => {
    const gap: ActionNode[] = [
      TOP_LEFT, { type: 'cleave', target: 'dna.cut' }, { type: 'resect', target: 'dna.cut', length: 12 },
      { type: 'cleave', target: 'dna.hj-left' }, { type: 'resect', target: 'dna.hj-left', length: 4 },
    ];
    expect(() => mechanism([[...gap, { type: 'extend', target: 'dna.cut', length: 16 }]])).toThrow(/cannot extend past dna 22 on the top strand: the strand continues in another molecule \("sister"\)/);
    expect(last([[...gap, { type: 'extend', target: 'dna.cut', length: 12 }]]).actors.dna!.nucleic).toEqual({ missing: [{ strand: 'top', from: 22, to: 26 }], nascent: [{ strand: 'top', from: 10, to: 22 }], open: [] });
  });

  it('unwind and anneal read one molecule by coordinate, across a join as anywhere (X6)', () => {
    const compiled = mechanism([[TOP_LEFT, { type: 'unwind', target: 'dna.hj-left', length: 8 }], [{ type: 'anneal', target: 'dna.hj-left' }]]);
    expect(compiled.at(0).actors.dna!.nucleic!.open).toEqual([{ from: 18, to: 26 }]);
    expect(compiled.at(0).actors.sister).not.toHaveProperty('nucleic');
    expect(compiled.at(1).actors.dna).not.toHaveProperty('nucleic');
  });
});

describe('v6 documents (RFC 0008 X9)', () => {
  it('produce the snapshots they produced: no joins key appears', () => {
    const snapshot = compileMechanism({ ...document([[{ type: 'cleave', target: 'dna.cut' }, { type: 'resect', target: 'dna.cut', length: 4 }]]), schemaVersion: 6 }).at(0);
    expect(Object.keys(snapshot)).toEqual(['stepIndex', 'step', 'definition', 'actors', 'sites', 'interactions', 'occupancy', 'pairings', 'timeline', 'duration']);
    expect(snapshot.actors.dna!.nucleic).toEqual({ missing: [{ strand: 'top', from: 10, to: 14 }], nascent: [], open: [] });
  });

  it.each(['parp1-ssb-repair', 'homologous-recombination', 'egfr-dimerization', 'gene-expression'])('frozen v6 %s migrates to v7 and no snapshot or timeline change mentions joins', name => {
    const compiled = compileMechanism(parseMechanism(readFileSync(new URL(`./fixtures/v6/${name}.yaml`, import.meta.url), 'utf8')));
    expect(compiled.definition.schemaVersion).toBe(7);
    for (let index = 0; index < compiled.length; index += 1) expect(compiled.at(index)).not.toHaveProperty('joins');
    expect(JSON.stringify(allStates(compiled))).not.toContain('joins');
    // And it is the same document as its v7 copy, step for step.
    const current = compileMechanism(parseMechanism(readFileSync(new URL(`./fixtures/v7/${name}.yaml`, import.meta.url), 'utf8')));
    expect(allStates(current)).toEqual(allStates(compiled));
  });

  it('the v7 fixture reaches the double junction with v6 actions and resolves it as a crossover', () => {
    const compiled = compileMechanism(parseMechanism(readFileSync(new URL('./fixtures/v7/double-holliday-junction.yaml', import.meta.url), 'utf8')));
    for (const step of ['break', 'resection', 'invasion', 'synthesis', 'second-end-capture', 'second-synthesis', 'ligation', 'nicking']) expect(compiled.at(step), step).not.toHaveProperty('joins');
    const resolved = compiled.at('resolution');
    expect(Object.keys(resolved.joins!)).toEqual(['dna.top~sister.top', 'dna.bottom~sister.bottom']);
    expect(Object.values(resolved.sites).every(site => !site.lesion)).toBe(true);
    expect(products(resolved, 'dna', 'sister')).toEqual([
      'dna.top[0,22) + dna.bottom[0,58) + sister.top[22,80) + sister.bottom[58,80)',
      'dna.top[22,80) + dna.bottom[58,80) + sister.top[0,22) + sister.bottom[0,58)',
    ]);
  });
});
