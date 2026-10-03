import { describe, expect, it } from 'vitest';
import {
  compileMechanism, migrateV4, normalizePairings, pairingConflicts, parseMechanism, partnerOf, toJsonSchema,
  type ActionNode, type MechanismSnapshot, type Pairing,
} from '../src';

/** A chromosome broken at 40 and its intact sister, aligned over their whole length; an oligo and a guide RNA. */
const ACTORS = [
  {
    id: 'chromosome', type: 'dna', nucleic: { length: 80 },
    sites: [{ id: 'break', at: 40 }, { id: 'right-overhang', span: [40, 58] }, { id: 'left-overhang', span: [22, 40] }],
  },
  { id: 'sister', type: 'dna', nucleic: { length: 80 }, sites: [{ id: 'donor', span: [40, 58] }, { id: 'ahead', span: [22, 40] }, { id: 'far', span: [60, 70] }] },
  { id: 'oligo', type: 'dna', nucleic: { length: 20, form: 'single' }, sites: [{ id: 'all', span: [0, 20] }] },
  { id: 'probe', type: 'dna', nucleic: { length: 20, form: 'single' }, sites: [{ id: 'all', span: [0, 20] }] },
  { id: 'guide', type: 'rna', nucleic: { length: 20 }, sites: [{ id: 'spacer', span: [0, 20] }] },
  { id: 'nuclease', type: 'protein' },
  { id: 'rad51', type: 'protein', copies: 2, footprint: { length: 3, form: 'any' } },
  { id: 'rpa', type: 'protein', copies: 2, footprint: { length: 6, form: 'single' } },
  { id: 'tf', type: 'protein', footprint: { length: 4, form: 'duplex' } },
];
const ALIGNMENTS = [
  { id: 'sister', between: ['chromosome', 'sister'], range: [0, 80] },
  { id: 'duplex', a: { acid: 'oligo', span: [0, 20] }, b: { acid: 'probe', span: [0, 20] }, orientation: 'opposite' },
  { id: 'target', a: { acid: 'guide', span: [0, 20] }, b: { acid: 'sister', span: [50, 70] } },
];
const document = (steps: ActionNode[][], alignments: unknown[] = ALIGNMENTS) => ({
  schemaVersion: 5, mechanism: { id: 'x', name: 'X' }, actors: ACTORS, alignments,
  steps: steps.map((actions, index) => ({ id: `s${index}`, title: `S${index}`, actions })),
});
const mechanism = (steps: ActionNode[][], alignments?: unknown[]) => compileMechanism(document(steps, alignments));
const resected: ActionNode[] = [{ type: 'cleave', target: 'chromosome.break', lesion: 'double-strand-break' }, { type: 'resect', target: 'chromosome.break', length: 18 }];
const invaded: ActionNode[] = [...resected, { type: 'unwind', target: 'sister.donor' }, { type: 'invade', target: 'chromosome.right-overhang', with: 'sister' }];
const pairs = (snapshot: MechanismSnapshot) => Object.fromEntries(Object.entries(snapshot.pairings).map(([key, list]) =>
  [key, list.map(({ ends: [a, b] }) => `${a.from}-${a.to}~${b.from}-${b.to}`)]));
const partners = (snapshot: MechanismSnapshot, acid: string, strand: 'top' | 'bottom', from: number, to: number) =>
  partnerOf(snapshot, snapshot.definition, { acid, strand, from, to }).map(item => `${item.from}-${item.to}:${item.partner}`);

describe('schema v5 and alignments (RFC 0006 §4)', () => {
  it('migrates v4 by moving only the version', () => {
    const v4 = { schemaVersion: 4, actors: [{ id: 'a', type: 'protein' }], steps: [] };
    expect(migrateV4(v4)).toEqual({ ...v4, schemaVersion: 5 });
    const v5 = { schemaVersion: 5 };
    expect(migrateV4(v5)).toBe(v5);
    const legacy = compileMechanism({ ...document([[{ type: 'bind', actor: 'nuclease', target: 'sister' }]], []), schemaVersion: 4 });
    expect(legacy.definition.schemaVersion).toBe(5);
    expect(legacy.definition.alignments).toEqual([]);
    expect(legacy.at(0).pairings).toEqual({});
  });

  it('normalises both authoring forms to two sides and defaults the orientation', () => {
    expect(parseMechanism(document([[{ type: 'show', actor: 'nuclease' }]])).alignments).toEqual([
      { id: 'sister', a: { acid: 'chromosome', span: [0, 80] }, b: { acid: 'sister', span: [0, 80] }, orientation: 'same' },
      { id: 'duplex', a: { acid: 'oligo', span: [0, 20] }, b: { acid: 'probe', span: [0, 20] }, orientation: 'opposite' },
      { id: 'target', a: { acid: 'guide', span: [0, 20] }, b: { acid: 'sister', span: [50, 70] }, orientation: 'same' },
    ]);
  });

  it.each([
    [{ id: 'x', between: ['chromosome', 'nuclease'], range: [0, 10] }, /references "nuclease", which is not a dna or rna actor/],
    [{ id: 'x', between: ['chromosome', 'sister'], range: [0, 90] }, /range must be \[from, to\] with 0 ≤ from < to ≤ 80 on "chromosome"/],
    [{ id: 'x', a: { acid: 'guide', span: [0, 20] }, b: { acid: 'sister', span: [50, 60] } }, /aligns 20 nt with 10 nt; both ranges must have the same length/],
    [{ id: 'x', a: { acid: 'sister', span: [0, 20] }, b: { acid: 'sister', span: [10, 30] } }, /aligns "sister" with itself over overlapping ranges/],
    [{ id: 'x', between: ['chromosome', 'sister'], range: [0, 10], a: { acid: 'guide', span: [0, 10] } }, /needs either between and range, or a and b/],
    [{ id: 'x', between: ['chromosome', 'sister'], range: [0, 10], orientation: 'flipped' }, /orientation must be one of: same, opposite/],
    [{ id: 'x', between: ['chromosome', 'sister'], range: [0, 10], homology: true }, /alignments\[0\]\.homology is not supported/],
  ])('rejects a malformed alignment %#', (alignment, message) => {
    expect(() => parseMechanism(document([[{ type: 'show', actor: 'nuclease' }]], [alignment]))).toThrow(message);
  });

  it('declares alignments and the pairing actions in the generated schema', () => {
    const schema = toJsonSchema() as { properties: Record<string, unknown>; $defs: { action: { oneOf: Array<{ properties: { type: { const: string } } }> } } };
    expect(schema.properties.schemaVersion).toEqual({ const: 5 });
    expect(schema.properties.alignments).toBeDefined();
    expect(schema.$defs.action.oneOf.map(action => action.properties.type.const)).toEqual(expect.arrayContaining(['pair', 'unpair', 'invade']));
  });

  it('an alignment alone changes no state', () => {
    expect(mechanism([resected]).at(0).pairings).toEqual({});
  });
});

describe('pairing between strands of two molecules (RFC 0006 §3, §5)', () => {
  it('pairs the unpaired strand with the aligned strand of the other molecule, stored once', () => {
    const snapshot = mechanism([invaded]).at(0);
    expect(snapshot.pairings).toEqual({
      'chromosome.bottom~sister.top': [{ ends: [{ acid: 'chromosome', strand: 'bottom', from: 40, to: 58 }, { acid: 'sister', strand: 'top', from: 40, to: 58 }] }],
    });
    const action = snapshot.timeline.at(-1)!;
    expect([action.type, action.primitive, action.presentation.verb, action.subject]).toEqual(['invade', 'pair', 'invades', 'chromosome.right-overhang']);
    expect(action.changes.map(change => change.key)).toEqual(['pairings.chromosome.bottom~sister.top']);
  });

  it('derives the partner of every nucleotide: absent, unpaired, cis or trans', () => {
    const snapshot = mechanism([invaded]).at(0);
    expect(partners(snapshot, 'chromosome', 'bottom', 0, 80)).toEqual(['0-22:cis', '22-40:absent', '40-58:trans', '58-80:cis']);
    expect(partners(snapshot, 'chromosome', 'top', 0, 80)).toEqual(['0-22:cis', '22-40:unpaired', '40-58:absent', '58-80:cis']);
    expect(partners(snapshot, 'sister', 'top', 30, 70)).toEqual(['30-40:cis', '40-58:trans', '58-70:cis']);
    // The displaced strand is not stored: it is whatever is left unpaired in the bubble.
    expect(partners(snapshot, 'sister', 'bottom', 30, 70)).toEqual(['30-40:cis', '40-58:unpaired', '58-70:cis']);
    expect(partners(snapshot, 'oligo', 'top', 0, 20)).toEqual(['0-20:unpaired']);
    expect(partners(snapshot, 'oligo', 'bottom', 0, 20)).toEqual(['0-20:absent']);
    expect(partnerOf(snapshot, snapshot.definition, { acid: 'sister', strand: 'top', from: 44, to: 50 }))
      .toEqual([{ from: 44, to: 50, partner: 'trans', with: { acid: 'chromosome', strand: 'bottom', from: 44, to: 50 } }]);
  });

  it('never unwinds or displaces: both spans must already be unpaired', () => {
    expect(() => mechanism([[...resected, { type: 'invade', target: 'chromosome.right-overhang', with: 'sister' }]]))
      .toThrow(/cannot pair chromosome bottom strand 40–58 with sister top strand 40–58: sister top strand 40–58 is paired with its own bottom strand; unwind it first/);
    expect(() => mechanism([[{ type: 'unwind', target: 'sister.donor' }, { type: 'pair', target: 'chromosome.right-overhang', with: 'sister' }]]))
      .toThrow(/no strand is unpaired across chromosome 40–58: chromosome top strand 40–58 is paired with its own bottom strand; unwind it first/);
    // The displaced strand in the bubble is free, so another molecule may pair with it; outside the bubble it is not.
    expect(pairs(mechanism([[...invaded, { type: 'pair', target: 'guide.spacer', with: 'sister', span: [0, 8] }]]).at(0))['guide.top~sister.bottom']).toEqual(['0-8~50-58']);
    expect(() => mechanism([[...invaded, { type: 'pair', target: 'guide.spacer', with: 'sister', span: [8, 16] }]]))
      .toThrow(/sister bottom strand 58–66 is paired with its own top strand; unwind it first/);
  });

  it('gives every nucleotide at most one partner', () => {
    expect(() => mechanism([[...invaded, { type: 'pair', target: 'chromosome.right-overhang', with: 'sister' }]]))
      .toThrow(/chromosome bottom strand 40–58 is already paired with sister top strand 40–58/);
    const snapshot = mechanism([invaded]).at(0);
    expect(pairingConflicts(snapshot, snapshot.definition, { acid: 'sister', strand: 'bottom', from: 40, to: 58 })).toBeUndefined();
    expect(pairingConflicts(snapshot, snapshot.definition, { acid: 'chromosome', strand: 'bottom', from: 30, to: 44 })).toBe('chromosome bottom strand 30–40 is not present');
  });

  it('needs the strand named when both are unpaired, and an alignment that covers the span', () => {
    const bubbles: ActionNode[] = [{ type: 'unwind', target: 'sister.donor' }, { type: 'unwind', target: 'chromosome.right-overhang' }];
    expect(() => mechanism([[...bubbles, { type: 'pair', target: 'chromosome.right-overhang', with: 'sister' }]])).toThrow(/both strands are unpaired across chromosome 40–58; name the strand/);
    expect(pairs(mechanism([[...bubbles, { type: 'pair', target: 'chromosome.right-overhang', with: 'sister', strand: 'top' }]]).at(0)))
      .toEqual({ 'chromosome.top~sister.bottom': ['40-58~40-58'] });
    expect(() => mechanism([[{ type: 'pair', target: 'guide.spacer', with: 'chromosome' }]])).toThrow(/no alignment relates "guide" and "chromosome"; declare one in alignments/);
    expect(() => mechanism([[{ type: 'pair', target: 'guide.spacer', with: 'sister', alignment: 'nope' }]])).toThrow(/unknown alignment "nope"/);
    expect(() => mechanism([[{ type: 'unwind', target: 'sister.far' }, { type: 'pair', target: 'sister.far', with: 'guide', span: [45, 52], strand: 'top' }]]))
      .toThrow(/no alignment between "sister" and "guide" covers sister 45–52/);
    expect(() => mechanism([[{ type: 'pair', target: 'nuclease', with: 'sister', span: [0, 4] }]])).toThrow(/"nuclease" is not a nucleic acid/);
  });

  it('maps coordinates through the alignment: an RNA into a duplex, from either side', () => {
    const opened: ActionNode[] = [{ type: 'unwind', target: 'sister.far' }];
    // guide 0–20 ↔ sister 50–70, same orientation: guide top pairs with sister bottom, position for position.
    expect(pairs(mechanism([[...opened, { type: 'pair', target: 'guide.spacer', with: 'sister', span: [10, 20] }]]).at(0)))
      .toEqual({ 'guide.top~sister.bottom': ['10-20~60-70'] });
    expect(pairs(mechanism([[...opened, { type: 'pair', target: 'sister.far', with: 'guide', strand: 'bottom' }]]).at(0)))
      .toEqual({ 'guide.top~sister.bottom': ['10-20~60-70'] });
    // The top strand would need the guide's bottom strand, which a single-stranded molecule does not have.
    expect(() => mechanism([[...opened, { type: 'pair', target: 'sister.far', with: 'guide', strand: 'top' }]])).toThrow(/guide bottom strand 10–20 is not present/);
  });

  it('pairs two complementary single strands, mirrored by polarity', () => {
    const snapshot = mechanism([[{ type: 'pair', target: 'oligo.all', with: 'probe', span: [0, 5] }]]).at(0);
    // Both are `top`, so they run opposite ways: oligo 0–5 meets probe 15–20, 5′ end to 3′ end.
    expect(pairs(snapshot)).toEqual({ 'oligo.top~probe.top': ['0-5~15-20'] });
    expect(partnerOf(snapshot, snapshot.definition, { acid: 'probe', strand: 'top', from: 18, to: 20 }))
      .toEqual([{ from: 18, to: 20, partner: 'trans', with: { acid: 'oligo', strand: 'top', from: 0, to: 2 } }]);
    expect(partnerOf(snapshot, snapshot.definition, { acid: 'oligo', strand: 'top', from: 1, to: 4 }))
      .toEqual([{ from: 1, to: 4, partner: 'trans', with: { acid: 'probe', strand: 'top', from: 16, to: 19 } }]);
  });

  it('merges touching segments, so the same topology is the same state however it was built', () => {
    const whole = mechanism([[{ type: 'pair', target: 'oligo.all', with: 'probe' }]]).at(0);
    const pieces = mechanism([[
      { type: 'pair', target: 'oligo.all', with: 'probe', span: [12, 20] },
      { type: 'pair', target: 'probe.all', with: 'oligo', span: [8, 20] },
    ]]).at(0);
    expect(pieces.pairings).toEqual(whole.pairings);
    expect(pairs(whole)).toEqual({ 'oligo.top~probe.top': ['0-20~0-20'] });
    const direct: Pairing[] = [
      { ends: [{ acid: 'a', strand: 'bottom', from: 5, to: 9 }, { acid: 'b', strand: 'top', from: 15, to: 19 }] },
      { ends: [{ acid: 'a', strand: 'bottom', from: 0, to: 5 }, { acid: 'b', strand: 'top', from: 10, to: 15 }] },
      { ends: [{ acid: 'a', strand: 'bottom', from: 9, to: 12 }, { acid: 'b', strand: 'top', from: 30, to: 33 }] },
    ];
    expect(normalizePairings(direct).map(({ ends: [a, b] }) => [a.from, a.to, b.from, b.to])).toEqual([[0, 9, 10, 19], [9, 12, 30, 33]]);
  });
});

describe('unpair', () => {
  it('removes the pairing and nothing else: the bubble stays open until anneal', () => {
    const snapshot = mechanism([[...invaded, { type: 'unpair', target: 'chromosome.right-overhang' }]]).at(0);
    expect(snapshot.pairings).toEqual({});
    expect(snapshot.actors.sister!.nucleic!.open).toEqual([{ from: 40, to: 58 }]);
    expect(partners(snapshot, 'sister', 'top', 40, 58)).toEqual(['40-58:unpaired']);
  });

  it('unpairs part of a span from either molecule, keeping the rest', () => {
    expect(pairs(mechanism([[...invaded, { type: 'unpair', target: 'sister', span: [46, 50] }]]).at(0)))
      .toEqual({ 'chromosome.bottom~sister.top': ['40-46~40-46', '50-58~50-58'] });
    expect(pairs(mechanism([[{ type: 'pair', target: 'oligo.all', with: 'probe' }, { type: 'unpair', target: 'probe', span: [0, 5] }]]).at(0)))
      .toEqual({ 'oligo.top~probe.top': ['0-15~5-20'] });
  });

  it('fails when nothing is paired there', () => {
    expect(() => mechanism([[...invaded, { type: 'unpair', target: 'sister.donor', strand: 'bottom' }]])).toThrow(/nothing is paired with sister bottom strand 40–58/);
    expect(() => mechanism([[{ type: 'unpair', target: 'oligo' }]])).toThrow(/nothing is paired with oligo 0–20/);
  });
});

describe('strand actions never break a pairing silently', () => {
  it('rejects annealing, resecting or synthesising across paired nucleotides', () => {
    expect(() => mechanism([[...invaded, { type: 'anneal', target: 'sister.donor' }]]))
      .toThrow(/sister top strand 40–58 is paired with chromosome bottom strand 40–58; unpair it first/);
    // Filling in the top strand from a nick would pair the invading strand with its own molecule as well.
    expect(() => mechanism([[
      { type: 'cleave', target: 'chromosome.break' }, { type: 'resect', target: 'chromosome.break', length: 18 },
      { type: 'unwind', target: 'sister.donor' }, { type: 'pair', target: 'chromosome.right-overhang', with: 'sister' },
      { type: 'extend', target: 'chromosome.break', length: 18 },
    ]])).toThrow(/chromosome bottom strand 40–58 is paired with sister top strand 40–58; unpair it first/);
    expect(() => mechanism([[...invaded, { type: 'resect', target: 'chromosome.break', length: 4 }]])).not.toThrow();
  });

  it('allows them again once unpaired', () => {
    const snapshot = mechanism([[...invaded, { type: 'unpair', target: 'sister' }, { type: 'anneal', target: 'sister.donor' }]]).at(0);
    expect(snapshot.actors.sister!.nucleic).toBeUndefined();
  });

  it('removes the pairings of a degraded molecule', () => {
    expect(mechanism([[...invaded, { type: 'degrade', actor: 'sister' }]]).at(0).pairings).toEqual({});
  });
});

describe('where the layers meet (RFC 0006 §7)', () => {
  it('engagement with the donor is occupancy, not pairing', () => {
    const engaged: ActionNode[] = [...resected,
      { type: 'occupy', actor: 'rad51#1', target: 'chromosome', span: [40, 43] },
      { type: 'occupy', actor: 'rad51#1', target: 'sister', span: [40, 43] },
    ];
    const snapshot = mechanism([engaged]).at(0);
    expect(snapshot.pairings).toEqual({});
    expect(Object.values(snapshot.occupancy).map(item => [item.id, item.strand])).toEqual([['rad51#1@chromosome', 'bottom'], ['rad51#1@sister', 'both']]);
    // A footprint without a form restriction stays through unwinding and pairing, and leaves by vacate.
    const paired = mechanism([[...engaged, { type: 'unwind', target: 'sister.donor' }, { type: 'invade', target: 'chromosome.right-overhang', with: 'sister' }]]).at(0);
    expect(Object.keys(paired.occupancy)).toEqual(['rad51#1@chromosome', 'rad51#1@sister']);
    expect(Object.keys(paired.pairings)).toEqual(['chromosome.bottom~sister.top']);
    expect(() => mechanism([[...engaged, { type: 'vacate', actor: 'rad51#1' }]])).toThrow(/"rad51#1" is on several nucleic acids; name one with target/);
    expect(Object.keys(mechanism([[...engaged, { type: 'vacate', actor: 'rad51#1', target: 'sister' }]]).at(0).occupancy)).toEqual(['rad51#1@chromosome']);
  });

  it('a single-stranded footprint cannot stay on a strand that pairs', () => {
    expect(() => mechanism([[...resected, { type: 'unwind', target: 'sister.donor' },
      { type: 'occupy', actor: 'rpa#1', target: 'chromosome', span: [40, 46] },
      { type: 'invade', target: 'chromosome.right-overhang', with: 'sister' },
    ]])).toThrow(/"rpa#1" occupies chromosome 40–46 and would no longer fit \(it needs single-stranded DNA, but 40–46 is paired with sister top strand 40–46\); vacate it first/);
  });

  it('single means unpaired by any means: the displaced strand of a bubble takes it, and must lose it before annealing', () => {
    const coated: ActionNode[] = [...invaded, { type: 'occupy', actor: 'rpa#1', target: 'sister', span: [40, 46] }];
    expect(mechanism([coated]).at(0).occupancy['rpa#1@sister']!.strand).toBe('bottom');
    expect(() => mechanism([[...invaded, { type: 'occupy', actor: 'rpa#1', target: 'sister', span: [40, 46], strand: 'top' }]]))
      .toThrow(/it needs single-stranded DNA, but 40–46 is paired with chromosome bottom strand 40–46/);
    expect(() => mechanism([[...coated, { type: 'unpair', target: 'sister' }, { type: 'anneal', target: 'sister.donor' }]]))
      .toThrow(/"rpa#1" occupies sister 40–46 and would no longer fit \(it needs single-stranded DNA, but the top strand is present within 40–46\); vacate it first/);
  });

  it('duplex means paired in cis or in trans, and with each other when it covers both strands', () => {
    const onHeteroduplex: ActionNode[] = [...invaded, { type: 'occupy', actor: 'tf', target: 'chromosome', span: [44, 48], strand: 'bottom' }];
    expect(mechanism([onHeteroduplex]).at(0).occupancy['tf@chromosome']!.strand).toBe('bottom');
    expect(() => mechanism([[...onHeteroduplex, { type: 'unpair', target: 'sister' }]]))
      .toThrow(/"tf" occupies chromosome 44–48 and would no longer fit \(it needs duplex DNA across 44–48\); vacate it first/);
    expect(() => mechanism([[...invaded, { type: 'occupy', actor: 'tf', target: 'sister', span: [44, 48] }]]))
      .toThrow(/it needs both strands paired with each other, but the top strand 44–48 is paired with chromosome/);
    expect(() => mechanism([[...invaded, { type: 'unpair', target: 'sister' }, { type: 'occupy', actor: 'tf', target: 'sister', span: [44, 48] }]]))
      .toThrow(/it needs paired DNA, but 44–48 is unwound/);
  });
});

describe('templated synthesis (RFC 0006 §6)', () => {
  const dloop: ActionNode[] = [...invaded, { type: 'unwind', target: 'sister.ahead' }];
  const synthesis: ActionNode = { type: 'extend', target: 'chromosome.break', strand: 'bottom', length: 18 };

  it('copies the strand the 3′ end is paired with, and prolongs that pairing', () => {
    const snapshot = mechanism([[...dloop, synthesis]]).at(0);
    expect(pairs(snapshot)).toEqual({ 'chromosome.bottom~sister.top': ['22-58~22-58'] });
    expect(snapshot.actors.chromosome!.nucleic).toEqual({
      missing: [{ strand: 'top', from: 40, to: 58 }],
      nascent: [{ strand: 'bottom', from: 22, to: 40 }],
      // The new strand is paired with its template only: it faces the other end's overhang unpaired.
      open: [{ from: 22, to: 40 }],
    });
    expect(partners(snapshot, 'chromosome', 'top', 22, 40)).toEqual(['22-40:unpaired']);
    expect(partners(snapshot, 'chromosome', 'bottom', 22, 58)).toEqual(['22-58:trans']);
    expect(snapshot.actors.sister!.nucleic).toEqual({ missing: [], nascent: [], open: [{ from: 22, to: 58 }] });
    expect(snapshot.timeline.at(-1)!.changes.map(change => change.key).sort())
      .toEqual(['actors.chromosome.nucleic.missing', 'actors.chromosome.nucleic.nascent', 'actors.chromosome.nucleic.open', 'pairings.chromosome.bottom~sister.top']);
  });

  it('continues in steps, and never past the gap', () => {
    const steps = mechanism([[...dloop, { ...synthesis, length: 6 }, { ...synthesis, length: 12 }]]).at(0);
    expect(steps.pairings).toEqual(mechanism([[...dloop, synthesis]]).at(0).pairings);
    expect(() => mechanism([[...dloop, { ...synthesis, length: 19 }]])).toThrow(/extending 19 nt overfills the 18-nt gap on the bottom strand/);
  });

  it('only prolongs the pairing at the 3′ end: it never unwinds the template or looks for another one', () => {
    expect(() => mechanism([[...invaded, synthesis]])).toThrow(/no template: sister top strand 22–40 is paired with its own bottom strand; unwind it first/);
    // Without a pairing at the 3′ end there is no template across the break, however close the sister is.
    expect(() => mechanism([[...resected, { type: 'unwind', target: 'sister.donor' }, { type: 'unwind', target: 'sister.ahead' }, synthesis]]))
      .toThrow(/extension at a double-strand break needs a template from another molecule: pair the 3′ end first/);
    // Unpairing the 3′ end removes the template, even though the rest of the strand is still paired.
    expect(() => mechanism([[...dloop, { type: 'unpair', target: 'chromosome', span: [40, 44] }, synthesis]]))
      .toThrow(/extension at a double-strand break needs a template from another molecule/);
  });

  it('stays inside the alignment and the template molecule', () => {
    const short = [{ id: 'sister', between: ['chromosome', 'sister'], range: [30, 80] }];
    expect(() => mechanism([[...dloop, synthesis]], short)).toThrow(/extending 18 nt runs past the alignment between "chromosome" and "sister"/);
    expect(pairs(mechanism([[...dloop, { ...synthesis, length: 10 }]], short).at(0))).toEqual({ 'chromosome.bottom~sister.top': ['30-58~30-58'] });
  });

  it('extends a single strand paired with another, mirrored by polarity', () => {
    const actors = [
      { id: 'primer', type: 'dna', nucleic: { length: 20, form: 'single' }, sites: [{ id: 'cut', at: 8 }, { id: 'head', span: [0, 8] }] },
      { id: 'template', type: 'dna', nucleic: { length: 20, form: 'single' }, sites: [] },
    ];
    const compiled = compileMechanism({
      schemaVersion: 5, mechanism: { id: 'x', name: 'X' }, actors,
      alignments: [{ id: 'duplex', between: ['primer', 'template'], range: [0, 20], orientation: 'opposite' }],
      steps: [{ id: 's', title: 'S', actions: [
        { type: 'cleave', target: 'primer.cut' }, { type: 'resect', target: 'primer.cut', length: 12 },
        { type: 'pair', target: 'primer.head', with: 'template' },
        { type: 'extend', target: 'primer.cut', length: 5 },
      ] }],
    });
    // primer 0–8 meets template 12–20; five more nucleotides read the template towards its 5′ end.
    expect(pairs(compiled.at(0))).toEqual({ 'primer.top~template.top': ['0-13~7-20'] });
    expect(compiled.at(0).actors.primer!.nucleic).toEqual({ missing: [{ strand: 'top', from: 13, to: 20 }], nascent: [{ strand: 'top', from: 8, to: 13 }], open: [] });
  });

  it('keeps a single-stranded footprint on the other end while the new strand is on the donor', () => {
    const coated: ActionNode[] = [...dloop, { type: 'occupy', actor: 'rpa#1', target: 'chromosome', span: [22, 28] }, synthesis];
    expect(mechanism([coated]).at(0).occupancy['rpa#1@chromosome']!.strand).toBe('top');
    expect(() => mechanism([[...coated, { type: 'unpair', target: 'chromosome' }, { type: 'anneal', target: 'chromosome.left-overhang' }]]))
      .toThrow(/"rpa#1" occupies chromosome 22–28 and would no longer fit \(it needs single-stranded DNA, but the bottom strand is present within 22–28\); vacate it first/);
  });
});

describe('SDSA from explicit actions (RFC 0006 §8)', () => {
  const sdsa: ActionNode[] = [
    { type: 'cleave', target: 'chromosome.break', lesion: 'double-strand-break' },
    { type: 'resect', target: 'chromosome.break', length: 18 },
    { type: 'unwind', target: 'sister.donor' },
    { type: 'invade', target: 'chromosome.right-overhang', with: 'sister' },
    { type: 'unwind', target: 'sister.ahead' },
    { type: 'extend', target: 'chromosome.break', strand: 'bottom', length: 18 },
    { type: 'unpair', target: 'chromosome' },
    { type: 'anneal', target: 'sister.donor' },
    { type: 'anneal', target: 'chromosome.left-overhang' },
    { type: 'extend', target: 'chromosome.break', strand: 'top', length: 18 },
    { type: 'ligate', target: 'chromosome.break' },
  ];
  const final = (actions: ActionNode[]) => { const { actors, sites, pairings } = mechanism([actions]).at(0); return JSON.stringify({ actors, sites, pairings }); };

  it('ends with an intact chromosome, two nascent tracts and an untouched sister', () => {
    const snapshot = mechanism([sdsa]).at(0);
    expect(snapshot.pairings).toEqual({});
    expect(snapshot.sites['chromosome.break']).toEqual({});
    expect(snapshot.actors.sister!.nucleic).toBeUndefined();
    expect(snapshot.actors.chromosome!.nucleic).toEqual({ missing: [], nascent: [{ strand: 'top', from: 40, to: 58 }, { strand: 'bottom', from: 22, to: 40 }], open: [] });
    expect(partners(snapshot, 'chromosome', 'top', 0, 80)).toEqual(['0-80:cis']);
  });

  it('unpair leaves the new strand nascent and unpaired; only anneal pairs it with the other end', () => {
    const released = mechanism([sdsa.slice(0, 7)]).at(0);
    expect(released.pairings).toEqual({});
    expect(released.actors.chromosome!.nucleic).toMatchObject({ nascent: [{ strand: 'bottom', from: 22, to: 40 }], open: [{ from: 22, to: 40 }] });
    expect(partners(released, 'chromosome', 'bottom', 22, 40)).toEqual(['22-40:unpaired']);
    expect(partners(mechanism([sdsa.slice(0, 9)]).at(0), 'chromosome', 'bottom', 22, 40)).toEqual(['22-40:cis']);
  });

  it('the break is bridged only once the new strand is annealed to the other end', () => {
    const untilUnpair = sdsa.slice(0, 8);
    expect(() => mechanism([[...untilUnpair, sdsa[9]!]])).toThrow(/the top strand has no template across the break|needs a template from another molecule/);
    expect(() => mechanism([[...sdsa.slice(0, 9), sdsa[10]!]])).toThrow(/the top strand is missing nucleotides at "chromosome.break"; fill the gap with extend before ligating/);
  });

  it('is the consequence of every action: without any one of them a later one fails, or the end state differs', () => {
    const complete = final(sdsa);
    sdsa.forEach((_, index) => {
      const without = sdsa.filter((__, other) => other !== index);
      let result: string | undefined;
      try { result = final(without); } catch { result = undefined; }
      expect(result, `without action ${index}`).not.toBe(complete);
    });
  });
});

describe('double Holliday junction: formation, branch migration, dissolution (RFC 0006 §9)', () => {
  const formed: ActionNode[] = [
    ...invaded, { type: 'unwind', target: 'sister.ahead' },
    { type: 'extend', target: 'chromosome.break', strand: 'bottom', length: 18 },
    // Second-end capture: the displaced donor strand pairs with the other overhang.
    { type: 'pair', target: 'chromosome.left-overhang', with: 'sister' },
    { type: 'extend', target: 'chromosome.break', strand: 'top', length: 18 },
    { type: 'ligate', target: 'chromosome.break' },
  ];

  it('forms from pairings alone: all four strands are paired in trans over one range', () => {
    const snapshot = mechanism([formed]).at(0);
    expect(pairs(snapshot)).toEqual({ 'chromosome.bottom~sister.top': ['22-58~22-58'], 'chromosome.top~sister.bottom': ['22-58~22-58'] });
    for (const [acid, strand] of [['chromosome', 'top'], ['chromosome', 'bottom'], ['sister', 'top'], ['sister', 'bottom']] as const) {
      expect(partners(snapshot, acid, strand, 0, 80)).toEqual(['0-22:cis', '22-58:trans', '58-80:cis']);
    }
    expect(snapshot.sites['chromosome.break']).toEqual({});
    expect(snapshot.actors.chromosome!.nucleic!.open).toEqual([{ from: 22, to: 58 }]);
  });

  it('moves a junction: unpair behind it, then anneal each molecule over the same span', () => {
    const migrated = mechanism([[...formed,
      { type: 'unpair', target: 'chromosome', span: [22, 30] },
      { type: 'anneal', target: 'chromosome.left-overhang', span: [22, 30] },
      { type: 'anneal', target: 'sister.ahead', span: [22, 30] },
    ]]).at(0);
    expect(pairs(migrated)).toEqual({ 'chromosome.bottom~sister.top': ['30-58~30-58'], 'chromosome.top~sister.bottom': ['30-58~30-58'] });
    expect(partners(migrated, 'sister', 'top', 0, 80)).toEqual(['0-30:cis', '30-58:trans', '58-80:cis']);
    expect(() => mechanism([[...formed, { type: 'anneal', target: 'chromosome.left-overhang', span: [22, 30] }]])).toThrow(/is paired with sister .* strand 22–58; unpair it first/);
    expect(() => mechanism([[...formed, { type: 'unpair', target: 'chromosome', span: [22, 30] }, { type: 'anneal', target: 'chromosome.left-overhang', span: [10, 30] }]]))
      .toThrow(/10–30 is not inside the unwound region 22–58/);
  });

  it('dissolves without a crossover: unpair both pairings, anneal both molecules', () => {
    const dissolved = mechanism([[...formed, { type: 'unpair', target: 'chromosome' }, { type: 'anneal', target: 'chromosome.break' }, { type: 'anneal', target: 'sister.donor' }]]).at(0);
    expect(dissolved.pairings).toEqual({});
    expect(dissolved.actors.sister!.nucleic).toBeUndefined();
    expect(dissolved.actors.chromosome!.nucleic).toEqual({ missing: [], nascent: [{ strand: 'top', from: 40, to: 58 }, { strand: 'bottom', from: 22, to: 40 }], open: [] });
  });
});

describe('determinism and parallel branches', () => {
  it('folds to the same pairings on every compile and at every step', () => {
    const steps: ActionNode[][] = [invaded, [{ type: 'unpair', target: 'sister', span: [50, 58] }], [{ type: 'unpair', target: 'sister' }]];
    const [first, second] = [mechanism(steps), mechanism(steps)];
    for (const index of [0, 1, 2]) expect(first.at(index).pairings).toEqual(second.at(index).pairings);
    expect(pairs(first.at(0))).toEqual({ 'chromosome.bottom~sister.top': ['40-58~40-58'] });
    expect(pairs(first.at(1))).toEqual({ 'chromosome.bottom~sister.top': ['40-50~40-50'] });
    expect(first.at(2).pairings).toEqual({});
    expect(Object.isFrozen(first.at(0).pairings['chromosome.bottom~sister.top'])).toBe(true);
  });

  it('conflicts only when two branches change the same strand pair', () => {
    expect(() => mechanism([[...invaded, { parallel: [
      { type: 'unpair', target: 'sister', span: [40, 44] }, { type: 'unpair', target: 'sister', span: [54, 58] },
    ] }]])).toThrow(/parallel branches \[0\] and \[1\] both change pairings\.chromosome\.bottom~sister\.top/);
    const snapshot = mechanism([[...invaded, { parallel: [
      { type: 'unpair', target: 'sister', span: [40, 44] }, { type: 'pair', target: 'oligo.all', with: 'probe' },
    ] }]]).at(0);
    expect(Object.keys(snapshot.pairings).sort()).toEqual(['chromosome.bottom~sister.top', 'oligo.top~probe.top']);
  });
});
