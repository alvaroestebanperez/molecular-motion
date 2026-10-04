import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compileMechanism, parseMechanism, toJsonSchema } from '@molecular-motion/core';
import {
  buildSvgScene, exportSvg, renderProteinPrimitive, proteinGeometry, proteinProfileGeometry,
  renderVocabularyGlyph, renderProteinAssembly, renderProteinArchitectureSurface,
  PROTEIN_ARCHITECTURES, PROTEIN_FOLDS, PROTEIN_DISORDERS, proteinProfileIssue, resolveProteinVisualProfile,
  PROTEIN_PROFILE_CATALOG, COMPOSED_COMPLEX_TEST, primitiveCss,
} from '../src';
import { actorContactShape, actorParticles } from '../src/scene';

const profiles = PROTEIN_PROFILE_CATALOG.map(item => item.proteinVisual!.profile);
const seed = 'stable-entity';

describe('presentation protein profiles', () => {
  it('keeps the presentation profile entirely out of the biological schema and definition', () => {
    const schema = toJsonSchema() as { $defs: { actor: { properties: Record<string, unknown> } } };
    for (const name of ['architecture', 'fold', 'disorder', 'morphology', 'visualProfile']) expect(schema.$defs.actor.properties).not.toHaveProperty(name);
    const definition = parseMechanism(readFileSync(new URL('../../../examples/p53-mdm2-feedback.yaml', import.meta.url), 'utf8'));
    for (const actor of definition.actors) expect(actor).not.toHaveProperty('morphology');
    const scene = buildSvgScene(compileMechanism(definition).at('association'));
    for (const actor of scene.actors) expect(actor).not.toHaveProperty('visualProfile');
  });

  it.each(profiles)('$architecture / $fold / $disorder preserves its shape across activity states', visualProfile => {
    const particles = proteinProfileGeometry(seed, 52, 28, visualProfile);
    const surface = renderProteinArchitectureSurface(particles, '#8b78d0', 52, visualProfile);
    for (const state of ['normal', 'active', 'inactive', 'inhibited', 'selected', 'future'] as const) {
      const svg = renderProteinPrimitive({ visualSeed: seed, radius: 52, fill: '#8b78d0', state, visualProfile });
      expect(svg).toContain(surface);
      expect(svg).toBe(renderProteinPrimitive({ visualSeed: seed, radius: 52, fill: '#8b78d0', state, visualProfile }));
    }
  });

  it.each(profiles)('$architecture / $fold / $disorder draws no motifs over its surface and fits its radius', visualProfile => {
    const svg = renderProteinPrimitive({ visualSeed: seed, radius: 52, visualProfile });
    expect(svg).not.toMatch(/mm-protein__(structure|helix|sheet)|data-secondary-structure/);
    for (const p of proteinProfileGeometry(seed, 52, 28, visualProfile)) expect(Math.hypot(p.x, p.y) + Math.max(p.rx, p.ry)).toBeLessThanOrEqual(52 * 1.25);
  });

  it('keeps global shape, fold and disorder as three separate dimensions', () => {
    expect(PROTEIN_ARCHITECTURES).not.toEqual(expect.arrayContaining(['helical-bundle', 'disordered', 'tail']));
    expect(PROTEIN_FOLDS).toEqual(['none', 'helical-bundle', 'beta-sandwich', 'beta-propeller', 'alpha-beta']);
    expect(PROTEIN_DISORDERS).toEqual(['none', 'tail', 'extended']);
    expect(resolveProteinVisualProfile({ fold: 'beta-propeller' })).toEqual({ architecture: 'surface', fold: 'beta-propeller', disorder: 'none' });
    expect(proteinProfileIssue({ architecture: 'ring', fold: 'helical-bundle', disorder: 'none' })).toMatch(/single globular body/);
    expect(() => resolveProteinVisualProfile({ architecture: 'barrel', disorder: 'extended' })).toThrow(/Unsupported protein profile/);
  });

  it('draws disorder as one continuous backbone, not as beads or repeated markers', () => {
    const folded = resolveProteinVisualProfile({ architecture: 'compact' });
    const body = proteinProfileGeometry(seed, 52, 28, folded);
    for (const disorder of ['tail', 'extended'] as const) {
      const visualProfile = resolveProteinVisualProfile(disorder === 'tail' ? { architecture: 'compact', disorder } : { disorder });
      const particles = proteinProfileGeometry(seed, 52, 28, visualProfile);
      const chain = particles.filter(p => p.chain !== undefined).sort((a, b) => a.chain! - b.chain!);
      // Consecutive volumes overlap deeply, so contacts and halo follow the same cord that is drawn.
      for (let i = 1; i < chain.length; i++) expect(Math.hypot(chain[i]!.x - chain[i - 1]!.x, chain[i]!.y - chain[i - 1]!.y)).toBeLessThan(chain[i]!.rx);
      const svg = renderProteinPrimitive({ visualSeed: seed, radius: 52, visualProfile });
      const region = svg.slice(svg.indexOf('<g class="mm-surface__disorder">'));
      expect(region.slice(0, region.indexOf('</g>')).match(/<path /g)).toHaveLength(3);
      expect(region.slice(0, region.indexOf('</g>'))).not.toMatch(/<ellipse|<circle|<text/);
      expect(svg).not.toMatch(/mm-modification|mm-repeated-marker/);
      expect(particles.some(p => p.chain === undefined)).toBe(disorder === 'tail');
    }
    // A tail is appended to the folded body; it never reshapes it.
    const tailed = proteinProfileGeometry(seed, 52, 28, resolveProteinVisualProfile({ architecture: 'compact', disorder: 'tail' })).filter(p => p.chain === undefined);
    expect(tailed).toHaveLength(body.length);
    const ratio = tailed[0]!.rx / body.find(p => p.depth === tailed[0]!.depth)!.rx;
    for (const p of tailed) expect(p.rx / body.find(q => q.depth === p.depth)!.rx).toBeCloseTo(ratio, 6);
  });

  it('a dimer is one glyph: it creates no extra instances or interactions', () => {
    const svg = renderProteinPrimitive({ visualSeed: seed, visualProfile: resolveProteinVisualProfile({ architecture: 'dimer' }) });
    expect(svg.match(/mm-primitive--protein/g)).toHaveLength(1);
    expect(svg).not.toMatch(/mm-interaction|mm-contact/);
  });

  it('surface preserves the existing seeded silhouette', () => {
    expect(proteinProfileGeometry(seed, 52, 28, resolveProteinVisualProfile())).toEqual(proteinGeometry(seed, 52));
  });

  it('catalog declares concrete profiles on each dimension without naming-dependent profile selection', () => {
    expect(PROTEIN_PROFILE_CATALOG).toHaveLength(PROTEIN_ARCHITECTURES.length + PROTEIN_FOLDS.length - 1 + 4);
    expect(new Set(PROTEIN_PROFILE_CATALOG.map(item => item.id)).size).toBe(PROTEIN_PROFILE_CATALOG.length);
    for (const item of PROTEIN_PROFILE_CATALOG) {
      const original = renderVocabularyGlyph(item);
      const renamed = renderVocabularyGlyph({ ...item, id: 'unrelated-identity', label: item.label }, { idPrefix: `mm-vocab-${item.id}` });
      expect(renamed).toBe(original);
    }
  });

  it('composes arbitrary profiles with the generic assembly API', () => {
    const svg = renderProteinAssembly(COMPOSED_COMPLEX_TEST);
    expect(svg).toContain('data-members="3"');
    expect(svg.match(/data-architecture="barrel"/g)).toHaveLength(1);
    expect(svg.match(/data-architecture="multisubunit"/g)).toHaveLength(2);
    expect(svg).toBe(renderProteinAssembly(COMPOSED_COMPLEX_TEST));
    const custom = renderProteinAssembly({ members: [{ visualSeed: 'anything', at: { x: 2, y: 3 }, visualProfile: resolveProteinVisualProfile({ architecture: 'ring' }) }] });
    expect(custom).toContain('data-members="1"');
    expect(custom).toContain('data-architecture="ring"');
  });

  it('draws a chosen actor as a composed assembly without changing the mechanism', () => {
    const definition = parseMechanism(readFileSync(new URL('../../../examples/p53-mdm2-feedback.yaml', import.meta.url), 'utf8'));
    const snapshot = compileMechanism(definition).at('association');
    const plain = buildSvgScene(snapshot);
    const scene = buildSvgScene(snapshot, { proteinVisuals: { proteasome: { assembly: COMPOSED_COMPLEX_TEST } } });
    // Same actors and interactions: the assembly is one actor, not three.
    expect(scene.actors.map(actor => actor.id)).toEqual(plain.actors.map(actor => actor.id));
    expect(scene.actors.filter(actor => actor.visual).map(actor => actor.id)).toEqual(['proteasome']);
    const proteasome = scene.actors.find(actor => actor.id === 'proteasome')!;
    // Contacts use the particles that are drawn, and those stay within the actor's radius.
    const particles = actorParticles(proteasome.actor, proteasome.type, proteasome.radius, undefined, proteasome.visual);
    expect(actorContactShape(proteasome).particles.slice(0, particles.length).map(p => [p.x, p.y])).toEqual(particles.map(p => [p.x, p.y]));
    for (const p of particles) expect(Math.hypot(p.x, p.y) + Math.max(p.rx, p.ry)).toBeLessThanOrEqual(proteasome.radius * 1.05);
    const svg = exportSvg(scene, { theme: 'light' });
    expect(svg).toContain('mm-surface--assembly');
    expect(svg).toContain('mm-subunit-surface--barrel');
    expect(exportSvg(plain, { theme: 'light' })).not.toContain('mm-surface--assembly');
    // The poly-Ub chain is still one modification of four units on p53.
    expect(svg).toContain('data-units="4"');
  });

  it('retains a contour halo without circular slash symbols or animation', () => {
    const svg = renderProteinPrimitive({ visualSeed: seed, state: 'inhibited' });
    const halo = svg.slice(svg.indexOf('<g class="mm-primitive__inhibition"'), svg.indexOf('<g class="mm-surface">'));
    expect(halo).toContain('<ellipse');
    expect(halo).not.toMatch(/<circle|<path|animation/);
    expect(primitiveCss).toContain('@media(prefers-reduced-motion:reduce)');
  });

  it('inhibited scene exports resolve light/dark and freeze motion', () => {
    const definition = parseMechanism(readFileSync(new URL('../../../examples/p53-mdm2-feedback.yaml', import.meta.url), 'utf8'));
    const scene = buildSvgScene(compileMechanism(definition).at('inhibition'));
    for (const theme of ['light', 'dark'] as const) {
      const svg = exportSvg(scene, { theme });
      expect(svg).toContain(`data-theme="${theme}"`);
      expect(svg).toContain('mm-primitive__inhibition');
      expect(svg).toContain('animation:none!important');
    }
  });

  it('fits repeated marker decorations inside the card drawing area', () => {
    const svg = renderVocabularyGlyph('ubiquitination');
    const [, bounds, x, y, scale] = svg.match(/data-bounds="([^"]+)" transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)"/) ?? [];
    expect(bounds).toBeDefined();
    const [x0,y0,x1,y1] = bounds!.split(' ').map(Number);
    expect(Number(x) + x0! * Number(scale)).toBeGreaterThanOrEqual(17);
    expect(Number(y) + y0! * Number(scale)).toBeGreaterThanOrEqual(17);
    expect(Number(x) + x1! * Number(scale)).toBeLessThanOrEqual(283);
    expect(Number(y) + y1! * Number(scale)).toBeLessThanOrEqual(165);
    expect(svg).toContain('data-units="4"');
  });
});
