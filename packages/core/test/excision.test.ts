import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  compileMechanism, excisedOf, extantLength, migrateV5, partnerOf, toJsonSchema,
  type ActionNode, type MechanismSnapshot,
} from '../src';
import { parseMechanism } from '../src/yaml';
import { EXAMPLES, allStates } from './helpers';

/** A gene and its transcript on pre-mRNA coordinates (intron 12–24), a recombining locus, and things that rest on them. */
const PRE_MRNA_SITES = [
  { id: 'five', at: 4 }, { id: 'cut', at: 8 }, { id: 'donor', at: 12 }, { id: 'branch', at: 18 }, { id: 'acceptor', at: 24 }, { id: 'junction', at: 24 },
  { id: 'intron', span: [12, 24] }, { id: 'inside', span: [14, 20] }, { id: 'exon1', span: [0, 12] }, { id: 'exon2', span: [24, 36] }, { id: 'across', span: [8, 28] },
];
const ACTORS = [
  { id: 'gene', type: 'dna', nucleic: { length: 80 }, sites: [{ id: 'w1', span: [40, 56] }, { id: 'body', span: [40, 76] }] },
  { id: 'pre-mrna', type: 'rna', nucleic: { length: 36 }, sites: PRE_MRNA_SITES },
  {
    id: 'locus', type: 'dna', nucleic: { length: 120 },
    sites: [
      { id: 'v', span: [10, 40] }, { id: 'intervening', span: [40, 80] }, { id: 'j', span: [80, 110] }, { id: 'around', span: [36, 84] },
      { id: 'heptamer', at: 40 }, { id: 'coding-end', at: 80 }, { id: 'signal', at: 60 }, { id: 'upstream', at: 30, strand: 'top' },
    ],
  },
  { id: 'ribosome', type: 'protein', footprint: { length: 8, form: 'single' } },
  { id: 'ejc', type: 'protein', copies: 3, footprint: { length: 4 } },
  { id: 'rag', type: 'protein' },
  { id: 'tf', type: 'protein', footprint: { length: 6, form: 'duplex' } },
];
/** The actors, each with the `initial` given for its id. */
const actors = (initial: Record<string, unknown> = {}) => ACTORS.map(actor => initial[actor.id] ? { ...actor, initial: initial[actor.id] } : actor);
const ALIGNMENTS = [{ id: 'transcript', a: { acid: 'pre-mrna', span: [0, 36] }, b: { acid: 'gene', span: [40, 76] } }];
const document = (steps: ActionNode[][], initial?: Record<string, unknown>) => ({
  schemaVersion: 6, mechanism: { id: 'x', name: 'X' }, actors: actors(initial), alignments: ALIGNMENTS,
  steps: steps.map((actions, index) => ({ id: `s${index}`, title: `S${index}`, actions })),
});
const mechanism = (steps: ActionNode[][], initial?: Record<string, unknown>) => compileMechanism(document(steps, initial));
const last = (steps: ActionNode[][], initial?: Record<string, unknown>) => mechanism(steps, initial).at(steps.length - 1);
const nucleic = (snapshot: MechanismSnapshot, acid = 'pre-mrna') => snapshot.actors[acid]!.nucleic;
const show: ActionNode = { type: 'show', actor: 'rag' };
const splice: ActionNode = { type: 'excise-interval', target: 'pre-mrna.intron' };
const SPLICED = { 'pre-mrna': { nucleic: { excised: [{ from: 12, to: 24 }] } } };
const NASCENT = { 'pre-mrna': { nucleic: { missing: [{ strand: 'top', from: 4, to: 36 }] } } };

describe('schema v6 (RFC 0007 §11)', () => {
  it('migrates v5 by moving only the version', () => {
    const v5 = { schemaVersion: 5, actors: [{ id: 'a', type: 'protein' }], steps: [] };
    expect(migrateV5(v5)).toEqual({ ...v5, schemaVersion: 6 });
    const v6 = { schemaVersion: 6 };
    expect(migrateV5(v6)).toBe(v6);
    expect(parseMechanism({ ...document([[show]]), schemaVersion: 5 }).schemaVersion).toBe(6);
  });

  it('declares the initial strand state and excise-interval in the generated schema, and keeps the base-excision alias', () => {
    const schema = toJsonSchema() as { $defs: { actor: { properties: { initial: { properties: Record<string, unknown> } } }; action: { oneOf: Array<{ properties: { type: { const: string } } }> } } };
    expect(schema.$defs.actor.properties.initial.properties.nucleic).toEqual({ $ref: '#/$defs/nucleicState' });
    expect(schema.$defs.action.oneOf.map(action => action.properties.type.const)).toEqual(expect.arrayContaining(['excise-interval', 'excise']));
  });
});

describe('initial strand state (RFC 0007 §3)', () => {
  it('is state, not an event: the first snapshot has it, with no lesion and nothing on the timeline', () => {
    const snapshot = last([[show]], { 'pre-mrna': { nucleic: { missing: [{ strand: 'top', from: 4, to: 36 }], nascent: [{ strand: 'top', from: 0, to: 4 }] } } });
    expect(nucleic(snapshot)).toEqual({ missing: [{ strand: 'top', from: 4, to: 36 }], nascent: [{ strand: 'top', from: 0, to: 4 }], open: [] });
    expect(Object.values(snapshot.sites).every(site => site.lesion === undefined)).toBe(true);
    expect(snapshot.timeline.map(action => action.type)).toEqual(['show']);
    expect(snapshot.timeline[0]!.changes.map(change => change.key)).toEqual(['actors.rag.visible']);
  });

  it('is normalised as action results are, and an intact molecule still has no strand state', () => {
    const snapshot = last([[show]], { locus: { nucleic: {
      missing: [{ strand: 'bottom', from: 5, to: 9 }, { strand: 'top', from: 20, to: 30 }, { strand: 'top', from: 10, to: 20 }],
      open: [{ from: 60, to: 70 }, { from: 50, to: 60 }], excised: [],
    } } });
    expect(nucleic(snapshot, 'locus')).toEqual({ missing: [{ strand: 'top', from: 10, to: 30 }, { strand: 'bottom', from: 5, to: 9 }], nascent: [], open: [{ from: 50, to: 70 }] });
    expect(snapshot.actors['pre-mrna']).not.toHaveProperty('nucleic');
    expect(last([[show]], { locus: { nucleic: {} } }).actors.locus).not.toHaveProperty('nucleic');
  });

  it('a transcript begins as its first nucleotides and extend continues from that 3′ end (§12.1)', () => {
    const compiled = mechanism([
      [{ type: 'unwind', target: 'gene.w1' }, { type: 'pair', target: 'pre-mrna', span: [0, 4], with: 'gene' }],
      [{ type: 'extend', target: 'pre-mrna.five', length: 8 }],
    ], NASCENT);
    expect(nucleic(compiled.at(1))).toEqual({ missing: [{ strand: 'top', from: 12, to: 36 }], nascent: [{ strand: 'top', from: 4, to: 12 }], open: [] });
    expect(compiled.at(1).pairings).toEqual({ 'gene.bottom~pre-mrna.top': [{ ends: [{ acid: 'gene', strand: 'bottom', from: 40, to: 52 }, { acid: 'pre-mrna', strand: 'top', from: 0, to: 12 }] }] });
    expect(compiled.at(1).sites['pre-mrna.five']).toEqual({});
    // Still refused past the bubble: the template there is paired with its own strand.
    expect(() => mechanism([[{ type: 'unwind', target: 'gene.w1' }, { type: 'pair', target: 'pre-mrna', span: [0, 4], with: 'gene' }, { type: 'extend', target: 'pre-mrna.five', length: 14 }]], NASCENT))
      .toThrow(/no template: gene bottom strand 56–58 is paired with its own top strand/);
  });

  it('an RNA that begins as [0, 4) is paired and extended with no break lesion and no break action at any step', () => {
    const compiled = mechanism([
      [{ type: 'unwind', target: 'gene.w1' }],
      [{ type: 'pair', target: 'pre-mrna', span: [0, 4], with: 'gene' }],
      [{ type: 'extend', target: 'pre-mrna.five', length: 4 }],
      [{ type: 'extend', target: 'pre-mrna.five', length: 4 }],
    ], NASCENT);
    const present = (snapshot: MechanismSnapshot) => partnerOf(snapshot, snapshot.definition, { acid: 'pre-mrna', strand: 'top', from: 0, to: 36 })
      .filter(item => item.partner !== 'absent').map(item => `${item.from}-${item.to}:${item.partner}`);
    expect([0, 1, 2, 3].map(step => present(compiled.at(step)))).toEqual([['0-4:unpaired'], ['0-4:trans'], ['0-8:trans'], ['0-12:trans']]);
    for (let step = 0; step < compiled.length; step += 1) {
      const snapshot = compiled.at(step);
      expect(Object.entries(snapshot.sites).filter(([, site]) => site.lesion), `step ${step}`).toEqual([]);
      expect(snapshot.timeline.map(action => action.primitive)).not.toEqual(expect.arrayContaining(['cleave']));
      expect(snapshot.timeline.flatMap(action => action.changes.map(change => change.key)).filter(key => key.startsWith('sites.'))).toEqual([]);
    }
    expect(nucleic(compiled.at(3))).toEqual({ missing: [{ strand: 'top', from: 12, to: 36 }], nascent: [{ strand: 'top', from: 4, to: 12 }], open: [] });
  });

  it('a molecule may begin gapped, unwound or spliced without any action producing it (§3.3, §12.4)', () => {
    const snapshot = last([[show]], SPLICED);
    expect(nucleic(snapshot)).toEqual({ missing: [], nascent: [], open: [], excised: [{ from: 12, to: 24 }] });
    expect(extantLength(excisedOf(snapshot.actors['pre-mrna']), { from: 0, to: 36 })).toBe(24);
    expect(last([[{ type: 'occupy', actor: 'ribosome', target: 'pre-mrna.across' }]], SPLICED).occupancy['ribosome@pre-mrna']).toMatchObject({ span: { from: 8, to: 28 }, strand: 'top' });
    expect(last([[{ type: 'cleave', target: 'pre-mrna.junction' }]], SPLICED).sites['pre-mrna.junction']).toEqual({ lesion: 'single-strand-break' });
    expect(() => mechanism([[{ type: 'pair', target: 'pre-mrna', span: [14, 20], with: 'gene' }]], SPLICED)).toThrow(/pre-mrna 14–20 was excised: nothing is there/);
  });

  it('a definition may point at coordinates that begin excised: a stable reference no action can use (§6.8)', () => {
    expect(() => mechanism([[show]], SPLICED)).not.toThrow();
    expect(() => mechanism([[{ type: 'cleave', target: 'pre-mrna.branch' }]], SPLICED)).toThrow(/site "pre-mrna.branch" was excised/);
  });

  it.each([
    [{ rag: { nucleic: { missing: [] } } }, /initial\.nucleic is only allowed on dna and rna actors/],
    [{ 'pre-mrna': { nucleic: { missing: [{ strand: 'top', from: 30, to: 40 }] } } }, /missing\[0\] is empty or runs past the molecule: it needs 0 ≤ from < to ≤ 36/],
    [{ 'pre-mrna': { nucleic: { nascent: [{ strand: 'top', from: 6, to: 6 }] } } }, /nascent\[0\] is empty or runs past the molecule/],
    [{ 'pre-mrna': { nucleic: { missing: [{ strand: 'top', from: 1.5, to: 6 }] } } }, /missing\[0\] must be \{ strand, from, to \} with integer coordinates/],
    [{ 'pre-mrna': { nucleic: { missing: [{ strand: 'bottom', from: 4, to: 36 }] } } }, /a single-stranded molecule has no bottom strand/],
    [{ 'pre-mrna': { nucleic: { missing: [{ strand: 'top', from: 4, to: 36 }], nascent: [{ strand: 'top', from: 0, to: 6 }] } } }, /missing and nascent overlap on the top strand around 0–6; a nucleotide cannot be both absent and newly made/],
    [{ 'pre-mrna': { nucleic: { open: [{ from: 4, to: 8 }] } } }, /a bubble needs both strands present, and this molecule is single-stranded/],
    [{ locus: { nucleic: { missing: [{ strand: 'top', from: 50, to: 60 }], open: [{ from: 55, to: 70 }] } } }, /open 55–70: a bubble needs both strands present, but the top strand is missing there/],
    [{ 'pre-mrna': { nucleic: { missing: [{ strand: 'top', from: 0, to: 36 }] } } }, /nothing is present; use initial: \{ present: false \}/],
    [{ locus: { nucleic: { missing: [{ strand: 'top', from: 0, to: 120 }, { strand: 'bottom', from: 0, to: 120 }] } } }, /nothing is present/],
    [{ 'pre-mrna': { present: false, nucleic: { missing: [{ strand: 'top', from: 4, to: 36 }] } } }, /not allowed with present: false: a product that does not exist yet has no strand state/],
    [{ 'pre-mrna': { nucleic: { excised: [{ from: 0, to: 12 }] } } }, /excised 0–12 is not internal: removing an end of the molecule is truncation, not excision/],
    [{ 'pre-mrna': { nucleic: { excised: [{ from: 24, to: 36 }] } } }, /excised 24–36 is not internal/],
    [{ 'pre-mrna': { nucleic: { excised: [{ from: 12, to: 24 }], missing: [{ strand: 'top', from: 20, to: 30 }] } } }, /excised 12–24 overlaps missing/],
    [{ locus: { nucleic: { excised: [{ from: 40, to: 80 }], open: [{ from: 70, to: 90 }] } } }, /excised 40–80 overlaps open/],
    [{ 'pre-mrna': { nucleic: { length: 4 } } }, /initial\.nucleic\.length is not supported/],
  ])('rejects an invalid initial state %#', (initial, message) => {
    expect(() => parseMechanism(document([[show]], initial as Record<string, unknown>))).toThrow(message);
  });

  it('one strand of a duplex may begin wholly missing, and the junction of an initial state may be the edge of a gap (I6)', () => {
    expect(() => mechanism([[show]], { locus: { nucleic: { missing: [{ strand: 'top', from: 0, to: 120 }] } } })).not.toThrow();
    expect(() => mechanism([[show]], { 'pre-mrna': { nucleic: { excised: [{ from: 12, to: 24 }], missing: [{ strand: 'top', from: 24, to: 36 }] } } })).not.toThrow();
  });
});

describe('excise-interval (RFC 0007 §4)', () => {
  it('removes the intron and joins the exons on the same molecule, clearing the breaks at its boundaries (§12.2)', () => {
    const compiled = mechanism([[{ type: 'cleave', target: 'pre-mrna.donor' }, { type: 'cleave', target: 'pre-mrna.acceptor' }], [splice]]);
    expect(compiled.at(0).sites['pre-mrna.donor']).toEqual({ lesion: 'single-strand-break' });
    const snapshot = compiled.at(1);
    expect(nucleic(snapshot)).toEqual({ missing: [], nascent: [], open: [], excised: [{ from: 12, to: 24 }] });
    expect(snapshot.sites['pre-mrna.donor']).toEqual({});
    expect(snapshot.sites['pre-mrna.acceptor']).toEqual({});
    expect(snapshot.actors['pre-mrna']).toMatchObject({ present: true });
    expect(snapshot.timeline[0]).toMatchObject({ type: 'excise-interval', primitive: 'excise-interval', subject: 'pre-mrna.intron', presentation: { verb: 'excises' } });
    expect(snapshot.timeline[0]!.changes.map(change => change.key).sort()).toEqual(['actors.pre-mrna.nucleic.excised', 'sites.pre-mrna.acceptor.lesion', 'sites.pre-mrna.donor.lesion']);
    expect(snapshot.definition.actors.find(actor => actor.id === 'pre-mrna')!.nucleic!.length).toBe(36);
  });

  it('stands alone, takes an explicit interval, and answers "excised" for what it removed (§6.8)', () => {
    const snapshot = last([[{ type: 'excise-interval', target: 'pre-mrna', span: [12, 24] }]]);
    expect(nucleic(snapshot)!.excised).toEqual([{ from: 12, to: 24 }]);
    expect(partnerOf(snapshot, snapshot.definition, { acid: 'pre-mrna', strand: 'top', from: 8, to: 28 }).map(item => `${item.from}-${item.to}:${item.partner}`))
      .toEqual(['8-12:unpaired', '12-24:excised', '24-28:unpaired']);
  });

  it('on a duplex removes both strands: the coding joint of V(D)J, with V and J at their coordinates (§12.3)', () => {
    const snapshot = last([[{ type: 'excise-interval', target: 'locus.intervening' }]]);
    expect(nucleic(snapshot, 'locus')).toEqual({ missing: [], nascent: [], open: [], excised: [{ from: 40, to: 80 }] });
    for (const strand of ['top', 'bottom'] as const) {
      expect(partnerOf(snapshot, snapshot.definition, { acid: 'locus', strand, from: 39, to: 81 }).map(item => `${item.from}-${item.to}:${item.partner}`)).toEqual(['39-40:cis', '40-80:excised', '80-81:cis']);
    }
    expect(() => mechanism([[{ type: 'excise-interval', target: 'locus.intervening' }, { type: 'occupy', actor: 'tf', target: 'locus', span: [37, 83] }]])).not.toThrow();
  });

  it('an interval that contains an earlier one merges with it; one whose flank is excised fails (I4)', () => {
    expect(nucleic(last([[splice, { type: 'excise-interval', target: 'pre-mrna', span: [8, 28] }]]))!.excised).toEqual([{ from: 8, to: 28 }]);
    expect(nucleic(last([[splice, { type: 'excise-interval', target: 'pre-mrna', span: [2, 6] }]]))!.excised).toEqual([{ from: 2, to: 6 }, { from: 12, to: 24 }]);
    expect(() => mechanism([[splice, splice]])).toThrow(/pre-mrna 12–24 was already excised: nothing left to excise there/);
    expect(() => mechanism([[splice, { type: 'excise-interval', target: 'pre-mrna.inside' }]])).toThrow(/nothing left to excise there/);
    expect(() => mechanism([[splice, { type: 'excise-interval', target: 'pre-mrna', span: [24, 30] }]])).toThrow(/nothing to join at pre-mrna 24–30: nucleotide 23 was excised; excise one interval that covers both/);
    expect(() => mechanism([[splice, { type: 'excise-interval', target: 'pre-mrna', span: [8, 20] }]])).toThrow(/nothing to join at pre-mrna 8–20: nucleotide 20 was excised/);
  });

  it('clips what was newly made or unwound inside the interval (I3)', () => {
    const snapshot = last([[{ type: 'unwind', target: 'locus.signal', length: 10 }, { type: 'excise-interval', target: 'locus.intervening' }]]);
    expect(nucleic(snapshot, 'locus')).toEqual({ missing: [], nascent: [], open: [], excised: [{ from: 40, to: 80 }] });
    const made = last([[splice]], { 'pre-mrna': { nucleic: { nascent: [{ strand: 'top', from: 4, to: 30 }] } } });
    expect(nucleic(made)).toEqual({ missing: [], nascent: [{ strand: 'top', from: 4, to: 12 }, { strand: 'top', from: 24, to: 30 }], open: [], excised: [{ from: 12, to: 24 }] });
  });

  it.each([
    [[{ type: 'excise-interval', target: 'rag', span: [2, 4] }], /"rag" is not a nucleic acid; excise-interval needs a nucleic acid and an interval/],
    [[{ type: 'excise-interval', target: 'pre-mrna' }], /excise-interval needs an interval: a site with a span, or span/],
    [[{ type: 'excise-interval', target: 'pre-mrna.donor' }], /excise-interval needs an interval/],
    [[{ type: 'excise-interval', target: 'pre-mrna.exon1' }], /0–12 is not internal: removing an end of "pre-mrna" is truncation, not excision/],
    [[{ type: 'excise-interval', target: 'pre-mrna.exon2' }], /24–36 is not internal/],
    [[{ type: 'excise-interval', target: 'pre-mrna', span: [30, 40] }], /30–40 runs past the molecule \(0–36\)/],
    [[{ type: 'bind', actor: 'rag', target: 'pre-mrna.branch' }, splice], /"rag" rests on "pre-mrna.branch", within pre-mrna 12–24; release it first/],
    [[{ type: 'occupy', actor: 'ribosome', target: 'pre-mrna.cut' }, splice], /"ribosome" occupies pre-mrna 8–16, within pre-mrna 12–24; vacate it first/],
    [[{ type: 'unwind', target: 'locus.heptamer', length: 8 }, { type: 'excise-interval', target: 'locus.intervening' }], /locus 40–80 overlaps the unwound region 36–44 only in part; anneal it, or excise the whole bubble/],
  ])('refuses %#', (actions, message) => {
    expect(() => mechanism([actions as ActionNode[]])).toThrow(message);
  });

  it('needs the interval and both flanks present: a gap is filled or resected, not excised', () => {
    const gapped = (from: number, to: number) => ({ 'pre-mrna': { nucleic: { missing: [{ strand: 'top', from, to }] } } });
    expect(() => mechanism([[splice]], gapped(14, 18))).toThrow(/the top strand is missing within pre-mrna 12–24: the interval must be present; a gap is filled or resected, not excised/);
    expect(() => mechanism([[splice]], gapped(8, 12))).toThrow(/nothing to join at pre-mrna 12–24: nucleotide 11 is missing on the top strand; fill the gap first/);
    expect(() => mechanism([[splice]], gapped(24, 30))).toThrow(/nucleotide 24 is missing on the top strand/);
    expect(() => mechanism([[{ type: 'excise-interval', target: 'locus.intervening' }]], { locus: { nucleic: { missing: [{ strand: 'bottom', from: 30, to: 40 }] } } }))
      .toThrow(/nucleotide 39 is missing on the bottom strand/);
  });

  it('fails while a strand of the interval is paired in trans', () => {
    const paired: ActionNode[] = [{ type: 'unwind', target: 'gene.body' }, { type: 'pair', target: 'pre-mrna', span: [8, 16], with: 'gene' }];
    expect(() => mechanism([[...paired, splice]])).toThrow(/pre-mrna top strand 8–16 is paired with gene bottom strand 48–56, within pre-mrna 12–24; unpair it first/);
    expect(() => mechanism([[...paired, { type: 'excise-interval', target: 'gene', span: [50, 60] }]])).toThrow(/gene bottom strand 48–56 is paired with pre-mrna top strand 8–16, within gene 50–60; unpair it first/);
    expect(() => mechanism([[...paired, { type: 'unpair', target: 'pre-mrna' }, splice]])).not.toThrow();
  });
});

describe('sites after an excision (RFC 0007 §6.1)', () => {
  it('a site wholly inside cannot be a target of any action', () => {
    for (const action of [
      { type: 'cleave', target: 'pre-mrna.branch' }, { type: 'ligate', target: 'pre-mrna.branch' }, { type: 'damage', target: 'pre-mrna.branch' },
      { type: 'repair', target: 'pre-mrna.branch' }, { type: 'fill-gap', target: 'pre-mrna.branch' }, { type: 'resect', target: 'pre-mrna.branch', length: 2 },
      { type: 'extend', target: 'pre-mrna.branch', length: 2 }, { type: 'bind', actor: 'rag', target: 'pre-mrna.branch' },
      { type: 'occupy', actor: 'ribosome', target: 'pre-mrna.branch' }, { type: 'occupy', actor: 'rag', target: 'pre-mrna.inside' },
      { type: 'coat', actors: ['ejc#1'], target: 'pre-mrna.inside' }, { type: 'pair', target: 'pre-mrna.inside', with: 'gene' },
    ]) expect(() => mechanism([[splice, action]]), action.type).toThrow(/site "pre-mrna\.(branch|inside)" was excised/);
    expect(() => mechanism([[{ type: 'excise-interval', target: 'locus.intervening' }, { type: 'unwind', target: 'locus.signal', length: 4 }]])).toThrow(/site "locus.signal" was excised/);
    expect(() => mechanism([[{ type: 'excise-interval', target: 'locus.intervening' }, { type: 'anneal', target: 'locus.signal' }]])).toThrow(/site "locus.signal" was excised/);
  });

  it('a boundary site read as a boundary is the junction; read as a base it is still its own nucleotide (D14)', () => {
    expect(last([[splice, { type: 'cleave', target: 'pre-mrna.donor' }]]).sites['pre-mrna.donor']).toEqual({ lesion: 'single-strand-break' });
    expect(last([[splice, { type: 'cleave', target: 'pre-mrna.acceptor' }, { type: 'ligate', target: 'pre-mrna.acceptor' }]]).sites['pre-mrna.acceptor']).toEqual({});
    expect(last([[splice, { type: 'fill-gap', target: 'pre-mrna.donor' }]]).sites['pre-mrna.donor']).toEqual({ lesion: 'nick' });
    // Base readings: nucleotide 12 left with the intron, nucleotide 24 is the first of exon 2.
    expect(() => mechanism([[splice, { type: 'damage', target: 'pre-mrna.donor' }]])).toThrow(/the nucleotide at "pre-mrna.donor" was excised/);
    expect(() => mechanism([[splice, { type: 'excise', target: 'pre-mrna.donor' }]])).toThrow(/the nucleotide at "pre-mrna.donor" was excised/);
    expect(() => mechanism([[splice, { type: 'repair', target: 'pre-mrna.donor' }]])).toThrow(/the nucleotide at "pre-mrna.donor" was excised/);
    expect(last([[splice, { type: 'damage', target: 'pre-mrna.acceptor' }]]).sites['pre-mrna.acceptor']).toEqual({ lesion: 'base-damage' });
    // Clearing follows the lesion that is there: a break at the junction is repaired through the site that holds it.
    expect(last([[splice, { type: 'cleave', target: 'pre-mrna.donor' }, { type: 'repair', target: 'pre-mrna.donor' }]]).sites['pre-mrna.donor']).toEqual({});
  });

  it('a lesion on a nucleotide that leaves goes with it; a base lesion on the nucleotide after the interval stays', () => {
    const snapshot = last([[
      { type: 'damage', target: 'pre-mrna.branch' }, { type: 'damage', target: 'pre-mrna.donor' }, { type: 'damage', target: 'pre-mrna.acceptor' },
      { type: 'cleave', target: 'pre-mrna.junction' }, { type: 'cleave', target: 'pre-mrna.cut' }, splice,
    ]]);
    expect(snapshot.sites).toMatchObject({ 'pre-mrna.branch': {}, 'pre-mrna.donor': {}, 'pre-mrna.junction': {}, 'pre-mrna.acceptor': { lesion: 'base-damage' }, 'pre-mrna.cut': { lesion: 'single-strand-break' } });
    expect(snapshot.sites['pre-mrna.branch']).toEqual({});
  });

  it('break state stays per site: two sites that name one junction do not share it (D15)', () => {
    expect(() => mechanism([[splice, { type: 'cleave', target: 'pre-mrna.donor' }, { type: 'ligate', target: 'pre-mrna.acceptor' }]])).toThrow(/no strand break to ligate at "pre-mrna.acceptor"/);
    expect(() => mechanism([[splice, { type: 'cleave', target: 'pre-mrna.junction' }, { type: 'ligate', target: 'pre-mrna.acceptor' }]])).toThrow(/no strand break to ligate at "pre-mrna.acceptor"/);
  });

  it('ligate at a junction keeps its rule: it refuses while a flank is missing', () => {
    const edge = { 'pre-mrna': { nucleic: { excised: [{ from: 12, to: 24 }], missing: [{ strand: 'top', from: 8, to: 12 }] } } };
    expect(() => mechanism([[{ type: 'cleave', target: 'pre-mrna.acceptor' }, { type: 'ligate', target: 'pre-mrna.acceptor' }]], edge))
      .toThrow(/the top strand is missing nucleotides at "pre-mrna.acceptor"; fill the gap with extend before ligating/);
  });
});

describe('occupancy across a junction (RFC 0007 §6.2)', () => {
  it('a footprint counts extant nucleotides: a ribosome placed from coordinate 8 rests on the exon–exon junction', () => {
    const snapshot = last([[splice, { type: 'occupy', actor: 'ribosome', target: 'pre-mrna.cut' }]]);
    expect(snapshot.occupancy['ribosome@pre-mrna']).toMatchObject({ span: { from: 8, to: 28 }, strand: 'top' });
    expect(last([[splice, { type: 'occupy', actor: 'ribosome', target: 'pre-mrna.cut', orientation: 'reverse' }]]).occupancy['ribosome@pre-mrna']!.span).toEqual({ from: 0, to: 8 });
  });

  it('anchored at either boundary it starts at the junction: forward from the nucleotide after it, reverse ending before it', () => {
    for (const site of ['donor', 'acceptor']) {
      expect(last([[splice, { type: 'occupy', actor: 'ribosome', target: `pre-mrna.${site}` }]]).occupancy['ribosome@pre-mrna']!.span, site).toEqual({ from: 24, to: 32 });
      expect(last([[splice, { type: 'occupy', actor: 'ribosome', target: `pre-mrna.${site}`, orientation: 'reverse' }]]).occupancy['ribosome@pre-mrna']!.span, site).toEqual({ from: 4, to: 12 });
    }
  });

  it('a span is cut back to its extant nucleotides, and the footprint is checked against them', () => {
    expect(last([[splice, { type: 'occupy', actor: 'rag', target: 'pre-mrna', span: [10, 20] }]]).occupancy['rag@pre-mrna']!.span).toEqual({ from: 10, to: 12 });
    expect(last([[splice, { type: 'occupy', actor: 'ribosome', target: 'pre-mrna.across' }]]).occupancy['ribosome@pre-mrna']!.span).toEqual({ from: 8, to: 28 });
    expect(() => mechanism([[{ type: 'occupy', actor: 'ribosome', target: 'pre-mrna.across' }]])).toThrow(/"ribosome" covers 8 nt but "pre-mrna.across" spans 20/);
    expect(() => mechanism([[splice, { type: 'occupy', actor: 'rag', target: 'pre-mrna', span: [14, 20] }]])).toThrow(/pre-mrna 14–20 was excised: nothing is there/);
    expect(() => mechanism([[splice, { type: 'occupy', actor: 'ribosome', target: 'pre-mrna.exon2', span: [30, 34] }, { type: 'occupy', actor: 'rag', target: 'pre-mrna', span: [20, 32] }]]))
      .toThrow(/"rag" would overlap "ribosome" on pre-mrna 30–34/);
  });

  it('coat places copies side by side along the covalent order, counting the room in extant nucleotides', () => {
    expect(() => mechanism([[splice, { type: 'coat', actors: ['ejc#1', 'ejc#2', 'ejc#3'], target: 'pre-mrna.across' }]])).toThrow(/3 instances need 12 nt but pre-mrna 8–28 has 8/);
    const snapshot = last([[splice, { type: 'coat', actors: ['ejc#1', 'ejc#2', 'ejc#3'], target: 'pre-mrna', span: [6, 34] }]]);
    expect(Object.values(snapshot.occupancy).map(item => item.span)).toEqual([{ from: 6, to: 10 }, { from: 10, to: 26 }, { from: 26, to: 30 }]);
    const reverse = last([[splice, { type: 'coat', actors: ['ejc#1', 'ejc#2'], target: 'pre-mrna', span: [6, 26], orientation: 'reverse' }]]);
    expect(Object.values(reverse.occupancy).map(item => item.span)).toEqual([{ from: 10, to: 26 }, { from: 6, to: 10 }]);
  });
});

describe('strands across a junction (RFC 0007 §6.3–6.6)', () => {
  it('pairing across a junction is one pairing per flank, and the alignment still holds for both', () => {
    expect(() => mechanism([[splice, { type: 'unwind', target: 'gene.body' }, { type: 'pair', target: 'pre-mrna.across', with: 'gene' }]])).toThrow(/pre-mrna 8–28 crosses a junction; pair each flank separately/);
    const snapshot = last([[splice, { type: 'unwind', target: 'gene.body' }, { type: 'pair', target: 'pre-mrna', span: [8, 12], with: 'gene' }, { type: 'pair', target: 'pre-mrna.exon2', with: 'gene' }]]);
    expect(snapshot.pairings['gene.bottom~pre-mrna.top']!.map(({ ends: [a, b] }) => `${a.from}-${a.to}~${b.from}-${b.to}`)).toEqual(['48-52~8-12', '64-76~24-36']);
    // The partner's side is checked too: the gene lost what the transcript still has.
    expect(() => mechanism([[{ type: 'excise-interval', target: 'gene', span: [50, 60] }, { type: 'unwind', target: 'gene.w1' }, { type: 'pair', target: 'pre-mrna', span: [8, 12], with: 'gene' }]]))
      .toThrow(/gene 48–52 crosses a junction; pair each flank separately/);
  });

  it('extend follows its template by coordinate and stops at a junction on it: no template (§6.5)', () => {
    const steps: ActionNode[] = [{ type: 'excise-interval', target: 'gene', span: [48, 60] }, { type: 'unwind', target: 'gene.w1' }, { type: 'pair', target: 'pre-mrna', span: [0, 4], with: 'gene' }];
    expect(nucleic(last([[...steps, { type: 'extend', target: 'pre-mrna.five', length: 4 }]], NASCENT))!.nascent).toEqual([{ strand: 'top', from: 4, to: 8 }]);
    expect(() => mechanism([[...steps, { type: 'extend', target: 'pre-mrna.five', length: 5 }]], NASCENT)).toThrow(/no template: gene bottom strand 48–49 was excised/);
  });

  it('extend finds the 3′ end that faces a gap across a junction of its own molecule', () => {
    const initial = { 'pre-mrna': { nucleic: { excised: [{ from: 12, to: 24 }], missing: [{ strand: 'top', from: 24, to: 36 }] } } };
    const snapshot = last([[{ type: 'unwind', target: 'gene.body' }, { type: 'pair', target: 'pre-mrna', span: [8, 12], with: 'gene' }, { type: 'extend', target: 'pre-mrna.donor', length: 6 }]], initial);
    expect(nucleic(snapshot)).toEqual({ missing: [{ strand: 'top', from: 30, to: 36 }], nascent: [{ strand: 'top', from: 24, to: 30 }], open: [], excised: [{ from: 12, to: 24 }] });
    expect(snapshot.pairings['gene.bottom~pre-mrna.top']!.map(({ ends: [a, b] }) => `${a.from}-${a.to}~${b.from}-${b.to}`)).toEqual(['48-52~8-12', '64-70~24-30']);
  });

  it('resect counts extant nucleotides, so the gap it leaves lies either side of the excised interval', () => {
    const snapshot = last([[splice, { type: 'cleave', target: 'pre-mrna.cut' }, { type: 'resect', target: 'pre-mrna.cut', length: 8 }]]);
    expect(nucleic(snapshot)).toEqual({ missing: [{ strand: 'top', from: 8, to: 12 }, { strand: 'top', from: 24, to: 28 }], nascent: [], open: [], excised: [{ from: 12, to: 24 }] });
    expect(nucleic(last([[splice, { type: 'cleave', target: 'pre-mrna.donor' }, { type: 'resect', target: 'pre-mrna.donor', length: 3 }]]))!.missing).toEqual([{ strand: 'top', from: 24, to: 27 }]);
    expect(() => mechanism([[splice, { type: 'cleave', target: 'pre-mrna.cut' }, { type: 'resect', target: 'pre-mrna.cut', length: 17 }]])).toThrow(/runs past the molecule end \(16 nt left\)/);
    // On the bottom strand the 5′ end faces decreasing coordinates.
    const joint = last([[{ type: 'excise-interval', target: 'locus.intervening' }, { type: 'cleave', target: 'locus.coding-end', lesion: 'double-strand-break' }, { type: 'resect', target: 'locus.coding-end', length: 5 }]]);
    expect(nucleic(joint, 'locus')!.missing).toEqual([{ strand: 'top', from: 80, to: 85 }, { strand: 'bottom', from: 35, to: 40 }]);
  });

  it('unwind opens the extant nucleotides, one interval per flank, and anneal closes them as one bubble', () => {
    const joint: ActionNode = { type: 'excise-interval', target: 'locus.intervening' };
    const compiled = mechanism([[joint, { type: 'unwind', target: 'locus.around' }], [{ type: 'anneal', target: 'locus.heptamer' }]]);
    expect(nucleic(compiled.at(0), 'locus')!.open).toEqual([{ from: 36, to: 40 }, { from: 80, to: 84 }]);
    expect(nucleic(compiled.at(1), 'locus')).toEqual({ missing: [], nascent: [], open: [], excised: [{ from: 40, to: 80 }] });
    expect(nucleic(last([[joint, { type: 'unwind', target: 'locus.heptamer', length: 6 }]]), 'locus')!.open).toEqual([{ from: 37, to: 40 }, { from: 80, to: 83 }]);
    expect(nucleic(last([[joint, { type: 'unwind', target: 'locus.around' }, { type: 'anneal', target: 'locus.around', span: [80, 84] }]]), 'locus')!.open).toEqual([{ from: 36, to: 40 }]);
    expect(() => mechanism([[joint, { type: 'unwind', target: 'locus.around' }, { type: 'unwind', target: 'locus.coding-end', length: 4 }]])).toThrow(/38–82 is already unwound/);
  });

  it('a duplex footprint reads the pairing of the extant nucleotides either side of the joint', () => {
    const joint: ActionNode = { type: 'excise-interval', target: 'locus.intervening' };
    expect(last([[joint, { type: 'occupy', actor: 'tf', target: 'locus.heptamer' }]]).occupancy['tf@locus']).toMatchObject({ span: { from: 80, to: 86 }, strand: 'both' });
    expect(last([[joint, { type: 'occupy', actor: 'tf', target: 'locus', span: [37, 83] }]]).occupancy['tf@locus']!.span).toEqual({ from: 37, to: 83 });
    expect(() => mechanism([[joint, { type: 'occupy', actor: 'tf', target: 'locus', span: [37, 83] }, { type: 'unwind', target: 'locus.upstream', length: 20 }]]))
      .toThrow(/"tf" occupies locus 37–83 and would no longer fit \(it needs paired DNA, but 37–83 is unwound\); vacate it first/);
  });
});

describe('v5 documents (RFC 0007 I9)', () => {
  it('produce the snapshots they produced: no excised list appears in strand state', () => {
    const snapshot = compileMechanism({ ...document([[{ type: 'cleave', target: 'pre-mrna.cut' }, { type: 'resect', target: 'pre-mrna.cut', length: 4 }]]), schemaVersion: 5 }).at(0);
    expect(nucleic(snapshot)).toEqual({ missing: [{ strand: 'top', from: 8, to: 12 }], nascent: [], open: [] });
    expect(Object.keys(nucleic(snapshot)!)).toEqual(['missing', 'nascent', 'open']);
  });

  it.each(EXAMPLES)('frozen v5 %s migrates to v6 and no snapshot or timeline change mentions excised', name => {
    const compiled = compileMechanism(parseMechanism(readFileSync(new URL(`./fixtures/v5/${name}.yaml`, import.meta.url), 'utf8')));
    expect(compiled.definition.schemaVersion).toBe(6);
    const states = allStates(compiled);
    expect(JSON.stringify(states)).not.toContain('excised');
    for (const state of states) for (const actor of Object.values(state.actors) as Array<{ nucleic?: object }>) {
      if (actor.nucleic) expect(Object.keys(actor.nucleic)).toEqual(['missing', 'nascent', 'open']);
    }
  });
});
