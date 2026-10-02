import { describe, expect, it } from 'vitest';
import { compileMechanism, type ActionNode } from '@molecular-motion/core';
import { buildSvgScene, describeScene, renderSvg } from '../src';
import { helixY } from '../src/scene';

const scene = (actions: ActionNode[], nucleic: Record<string, unknown> | null = { length: 80 }) => buildSvgScene(compileMechanism({
  schemaVersion: 3, mechanism: { id: 'x', name: 'X' },
  actors: [
    { id: 'dna', type: 'dna', label: 'DNA', ...(nucleic && { nucleic }), sites: [{ id: 'break', at: 40 }, { id: 'gap', at: 20, strand: 'bottom' }, { id: 'bubble', span: [56, 70] }] },
    { id: 'rad51', type: 'protein', label: 'RAD51' },
  ],
  steps: [{ id: 's', title: 'S', actions }],
}).at(0));
const dsb = [{ type: 'cleave', target: 'dna.break', lesion: 'double-strand-break' }, { type: 'resect', target: 'dna.break', length: 14 }];
const polarity = (svg: string) => [...svg.matchAll(/class="mm-dna__polarity" x="([\d.]+)" y="([\d.]+)">([35])′/g)].map(match => [Number(match[1]), Number(match[2]), match[3]] as const);

describe('strand state in the scene (RFC 0004 §7)', () => {
  it('maps strand ranges to x and keeps intact molecules free of them', () => {
    const resected = scene(dsb).nucleicAcids[0]!;
    expect(resected.missing).toEqual([{ strand: 'top', from: 40, to: 54, x0: 480, x1: 648 }, { strand: 'bottom', from: 26, to: 40, x0: 312, x1: 480 }]);
    expect(resected.polarity).toBe(true);
    const intact = scene([], null).nucleicAcids[0]!;
    expect(intact).not.toHaveProperty('missing');
    expect(intact).not.toHaveProperty('polarity');
  });

  it('relaxes single-stranded overhangs off the helix and bows bubbles apart', () => {
    const resected = scene(dsb).nucleicAcids[0]!;
    const intact = scene([]).nucleicAcids[0]!;
    // Deep inside the right overhang only bottom remains, relaxed below the axis; top is untouched far away.
    expect(helixY(resected, 1, 570, 960)).toBeGreaterThan(resected.y);
    expect(helixY(resected, 1, 570, 960)).not.toBeCloseTo(helixY(intact, 1, 570, 960));
    expect(helixY(resected, 0, 900, 960)).toBeCloseTo(helixY(intact, 0, 900, 960));
    const bubble = scene([{ type: 'unwind', target: 'dna.bubble' }]).nucleicAcids[0]!;
    expect(helixY(bubble, 0, 756, 960)).toBeCloseTo(bubble.y - 40);
    expect(helixY(bubble, 1, 756, 960)).toBeCloseTo(bubble.y + 40);
  });

  it('labels every fragment end with its polarity, overhangs included', () => {
    const svg = renderSvg(scene(dsb));
    const top = polarity(svg).filter(([, y]) => y < 397).map(([x, , end]) => [x, end]);
    const bottom = polarity(svg).filter(([, y]) => y > 397).map(([x, , end]) => [x, end]);
    // Top: 5′ … 3′ up to the break, then 5′ again where resection stopped. Bottom: 3′ from the break, 5′ at the far end.
    expect(top).toEqual([[14, '5'], [458, '3'], [655, '5'], [946, '3']]);
    expect(bottom).toEqual([[14, '3'], [305, '5'], [502, '3'], [946, '5']]);
    expect(renderSvg(scene(dsb, null))).not.toContain('mm-dna__polarity');
  });

  it('draws nascent DNA and puts a lesion on its declared strand', () => {
    const svg = renderSvg(scene([{ type: 'cleave', target: 'dna.gap' }, { type: 'resect', target: 'dna.gap', length: 6 }, { type: 'extend', target: 'dna.gap', length: 3 }]));
    expect(svg).toMatch(/class="mm-dna__nascent mm-dna__nascent--(front|back)"/);
    const lesion = scene([{ type: 'cleave', target: 'dna.gap' }]);
    expect(lesion.lesions[0]).toMatchObject({ target: 'dna.gap', type: 'single-strand-break', strand: 'bottom' });
    expect(describeScene(lesion)).toContain('Single-strand break (SSB) at DNA (gap) on the bottom strand');
  });

  it('describes strand state in words', () => {
    expect(describeScene(scene([...dsb, { type: 'unwind', target: 'dna.bubble' }])))
      .toContain('Strands: DNA: top strand missing 40–54 (bottom strand single-stranded); bottom strand missing 26–40 (top strand single-stranded); unwound 56–70.');
  });

  it('turns a filament towards the single-stranded overhang next to its site', () => {
    const chain = (actions: ActionNode[]) => scene([...actions, { type: 'bind', actor: 'rad51', target: 'dna.break' }, { type: 'polymerize', actor: 'rad51', product: 'RAD51', length: 6 }])
      .actors.find(actor => actor.id === 'rad51')!.chain!.angle;
    expect(chain([])).toBeCloseTo(-0.45);
    expect(Math.cos(chain(dsb))).toBeGreaterThan(0);
    expect(Math.sin(chain(dsb))).toBeGreaterThan(0);
  });
});
