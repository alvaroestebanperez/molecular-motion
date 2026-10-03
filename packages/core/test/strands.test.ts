import { describe, expect, it } from 'vitest';
import { compileMechanism, type ActionNode } from '../src';

const SITES = [
  { id: 'break', at: 40 },
  { id: 'top-nick', at: 40, strand: 'top' },
  { id: 'bottom-nick', at: 30, strand: 'bottom' },
  { id: 'other', at: 44, strand: 'bottom' },
  { id: 'both', at: 60, strand: 'both' },
  { id: 'bubble', span: [20, 32] },
  { id: 'drawn', position: { x: 100, y: 0 } },
];

/** An 80-nt molecule (duplex unless rna/single, which keeps only strandless sites) and one step per entry of `steps`. */
const mechanism = (steps: ActionNode[][], options: { type?: 'dna' | 'rna'; form?: 'duplex' | 'single' } = {}) => compileMechanism({
  schemaVersion: 3, mechanism: { id: 'x', name: 'X' },
  actors: [{
    id: 'dna', type: options.type ?? 'dna', nucleic: { length: 80, ...(options.form && { form: options.form }) },
    sites: options.type === 'rna' || options.form === 'single' ? SITES.filter(site => !('strand' in site)) : SITES,
  }, { id: 'mre11', type: 'protein' }, { id: 'polb', type: 'protein' }],
  steps: steps.map((actions, index) => ({ id: `s${index}`, title: `S${index}`, actions })),
});
const nucleic = (steps: ActionNode[][], options?: Parameters<typeof mechanism>[1]) => mechanism(steps, options).at(steps.length - 1).actors.dna!.nucleic;
const dsb = { type: 'cleave', target: 'dna.break', lesion: 'double-strand-break' };

describe('resect', () => {
  it('removes 5′→3′ from both 5′ ends of a DSB, leaving 3′ overhangs, and continues from where it stopped', () => {
    const compiled = mechanism([[dsb, { type: 'resect', target: 'dna.break', length: 12, by: 'mre11' }], [{ type: 'resect', target: 'dna.break', length: 10 }]]);
    expect(compiled.at(0).actors.dna!.nucleic).toEqual({
      missing: [{ strand: 'top', from: 40, to: 52 }, { strand: 'bottom', from: 28, to: 40 }], nascent: [], open: [],
    });
    expect(compiled.at(1).actors.dna!.nucleic!.missing).toEqual([{ strand: 'top', from: 40, to: 62 }, { strand: 'bottom', from: 18, to: 40 }]);
    expect(compiled.at(1).timeline[0]!.changes.map(change => change.key)).toEqual(['actors.dna.nucleic.missing']);
  });

  it('follows polarity on a single broken strand: the 5′ end of a bottom-strand break faces decreasing coordinates', () => {
    expect(nucleic([[{ type: 'cleave', target: 'dna.bottom-nick' }, { type: 'resect', target: 'dna.bottom-nick', length: 5 }]])!.missing)
      .toEqual([{ strand: 'bottom', from: 25, to: 30 }]);
    expect(nucleic([[{ type: 'cleave', target: 'dna.top-nick' }, { type: 'resect', target: 'dna.top-nick', length: 5 }]])!.missing)
      .toEqual([{ strand: 'top', from: 40, to: 45 }]);
    expect(nucleic([[{ type: 'cleave', target: 'dna.break' }, { type: 'resect', target: 'dna.break', length: 5 }]], { type: 'rna' })!.missing)
      .toEqual([{ strand: 'top', from: 40, to: 45 }]);
  });

  it('never clamps and needs a break at a point coordinate', () => {
    expect(() => mechanism([[dsb, { type: 'resect', target: 'dna.break', length: 41 }]])).toThrow(/runs past the molecule end \(40 nt left\)/);
    expect(() => mechanism([[{ type: 'resect', target: 'dna.break', length: 4 }]])).toThrow(/no strand break to resect at "dna.break"/);
    expect(() => mechanism([[{ type: 'resect', target: 'dna.bubble', length: 4 }]])).toThrow(/needs a point coordinate \(at\), not a span/);
    expect(() => mechanism([[{ type: 'resect', target: 'dna.drawn', length: 4 }]])).toThrow(/has no coordinate \(at or span\); a position is layout only/);
  });
});

describe('extend', () => {
  const gap = [{ type: 'cleave', target: 'dna.bottom-nick' }, { type: 'resect', target: 'dna.bottom-nick', length: 5 }];

  it('fills a gap 5′→3′ from the 3′ end, marking nascent nucleotides, across several steps', () => {
    const compiled = mechanism([gap, [{ type: 'extend', target: 'dna.bottom-nick', length: 3, by: 'polb' }], [{ type: 'extend', target: 'dna.bottom-nick', length: 2 }]]);
    expect(compiled.at(1).actors.dna!.nucleic).toEqual({ missing: [{ strand: 'bottom', from: 25, to: 27 }], nascent: [{ strand: 'bottom', from: 27, to: 30 }], open: [] });
    expect(compiled.at(2).actors.dna!.nucleic).toEqual({ missing: [], nascent: [{ strand: 'bottom', from: 25, to: 30 }], open: [] });
  });

  it('long-patch repair is explicit: ligate refuses a gap, even one moved away by partial synthesis', () => {
    expect(() => mechanism([gap, [{ type: 'ligate', target: 'dna.bottom-nick' }]])).toThrow(/bottom strand is missing nucleotides at "dna.bottom-nick"; fill the gap with extend/);
    expect(() => mechanism([gap, [{ type: 'extend', target: 'dna.bottom-nick', length: 3 }, { type: 'ligate', target: 'dna.bottom-nick' }]])).toThrow(/missing nucleotides/);
    const sealed = mechanism([gap, [{ type: 'extend', target: 'dna.bottom-nick', length: 5 }, { type: 'fill-gap', target: 'dna.bottom-nick' }, { type: 'ligate', target: 'dna.bottom-nick' }]]);
    expect(sealed.at(1).sites['dna.bottom-nick']!.lesion).toBeUndefined();
    expect(sealed.at(1).actors.dna!.nucleic!.nascent).toEqual([{ strand: 'bottom', from: 25, to: 30 }]);
  });

  it('fill-gap keeps its v2 meaning and never synthesises', () => {
    expect(mechanism([gap, [{ type: 'fill-gap', target: 'dna.bottom-nick' }]]).at(1).actors.dna!.nucleic!.missing).toEqual([{ strand: 'bottom', from: 25, to: 30 }]);
  });

  it('refuses to cross a DSB, to overfill, or to copy a missing template', () => {
    expect(() => mechanism([[dsb, { type: 'resect', target: 'dna.break', length: 6 }, { type: 'extend', target: 'dna.break', length: 2 }]])).toThrow(/needs a template from another molecule/);
    expect(() => mechanism([[...gap, { type: 'extend', target: 'dna.bottom-nick', length: 6 }]])).toThrow(/overfills the 5-nt gap on the bottom strand/);
    expect(() => mechanism([[{ type: 'extend', target: 'dna.break', length: 2 }]])).toThrow(/no 3′ end facing a gap at "dna.break"/);
    expect(() => mechanism([[
      { type: 'cleave', target: 'dna.top-nick' }, { type: 'resect', target: 'dna.top-nick', length: 10 },
      { type: 'cleave', target: 'dna.other' }, { type: 'resect', target: 'dna.other', length: 10 },
      { type: 'extend', target: 'dna.top-nick', length: 8 },
    ]])).toThrow(/no template: the bottom strand is missing across 40–48/);
  });

  it('asks for a strand only when both offer a 3′ end', () => {
    const both = [{ type: 'cleave', target: 'dna.both' }, { type: 'resect', target: 'dna.both', length: 4 }];
    expect(() => mechanism([[...both, { type: 'extend', target: 'dna.both', length: 2 }]])).toThrow(/both strands have a 3′ end facing a gap at "dna.both"; set strand/);
    expect(nucleic([[...both, { type: 'extend', target: 'dna.both', length: 2, strand: 'top' }]])!.nascent).toEqual([{ strand: 'top', from: 60, to: 62 }]);
    // A single-stranded molecule has no template of its own: its 3′ end must be paired with another molecule (RFC 0006 §6.1).
    expect(() => mechanism([[{ type: 'cleave', target: 'dna.break' }, { type: 'resect', target: 'dna.break', length: 4 }, { type: 'extend', target: 'dna.break', length: 2 }]], { form: 'single' }))
      .toThrow(/no template: "dna" is single-stranded, so its 3′ end must be paired with another molecule/);
  });
});

describe('unwind and anneal', () => {
  it('opens a bubble from a span or centred on a point, and anneals it back to an intact molecule', () => {
    const compiled = mechanism([[{ type: 'unwind', target: 'dna.bubble' }], [{ type: 'unwind', target: 'dna.break', length: 7 }], [{ type: 'anneal', target: 'dna.bubble' }, { type: 'anneal', target: 'dna.break' }]]);
    expect(compiled.at(0).actors.dna!.nucleic!.open).toEqual([{ from: 20, to: 32 }]);
    expect(compiled.at(1).actors.dna!.nucleic!.open).toEqual([{ from: 20, to: 32 }, { from: 37, to: 44 }]);
    expect(compiled.at(2).actors.dna!.nucleic).toBeUndefined();
  });

  it('checks the bubble against the molecule, missing strands and existing bubbles', () => {
    expect(() => mechanism([[{ type: 'unwind', target: 'dna.break', length: 90 }]])).toThrow(/runs past the molecule ends \(0–80\)/);
    expect(() => mechanism([[{ type: 'unwind', target: 'dna.bubble' }, { type: 'unwind', target: 'dna.bubble' }]])).toThrow(/20–32 is already unwound/);
    expect(() => mechanism([[dsb, { type: 'resect', target: 'dna.break', length: 4 }, { type: 'unwind', target: 'dna.break', length: 6 }]])).toThrow(/cannot unwind 37–43: the top strand is missing there/);
    expect(() => mechanism([[{ type: 'unwind', target: 'dna.bubble' }, { type: 'cleave', target: 'dna.bottom-nick' }, { type: 'resect', target: 'dna.bottom-nick', length: 2 }]]))
      .toThrow(/cannot resect into an unwound region \(bottom strand 28–30\)/);
    expect(() => mechanism([[{ type: 'anneal', target: 'dna.break' }]])).toThrow(/no unwound region at "dna.break" to anneal/);
  });

  it('validates its target statically', () => {
    expect(() => mechanism([[{ type: 'unwind', target: 'dna.break' }]])).toThrow(/length is required for a point site/);
    expect(() => mechanism([[{ type: 'unwind', target: 'dna.bubble', length: 4 }]])).toThrow(/length is not used with a span/);
    expect(() => mechanism([[{ type: 'unwind', target: 'dna.bubble' }]], { type: 'rna' })).toThrow(/single-stranded; this action needs a duplex/);
  });
});

describe('strand state in the engine', () => {
  it('rejects parallel branches that both change the same strand list', () => {
    expect(() => mechanism([[{ type: 'cleave', target: 'dna.top-nick' }, { type: 'cleave', target: 'dna.bottom-nick' }, {
      parallel: [{ type: 'resect', target: 'dna.top-nick', length: 3 }, { type: 'resect', target: 'dna.bottom-nick', length: 3 }],
    }]])).toThrow(/parallel branches \[0\] and \[1\] both change actors.dna.nucleic.missing/);
  });

  it('keeps an intact molecule free of strand state and refuses a DSB on a one-strand site', () => {
    expect(mechanism([[{ type: 'cleave', target: 'dna.break' }]]).at(0).actors.dna).not.toHaveProperty('nucleic');
    expect(() => mechanism([[{ type: 'cleave', target: 'dna.top-nick', lesion: 'double-strand-break' }]])).toThrow(/cuts both strands, but site "dna.top-nick" is on the top strand/);
  });
});
