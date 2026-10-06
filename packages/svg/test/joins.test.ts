import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism } from '@molecular-motion/core';
import { parseMechanism } from '@molecular-motion/core/yaml';
import { buildSvgScene, geometryFrame, interpolateGeometry, renderSvg } from '../src';

/**
 * Covalent joins between molecules (RFC 0008) have no agreed drawing yet, and the renderer does not
 * read them. Until an ADR decides one, a document with joins must still render, as if no join existed.
 */
const source = readFileSync(new URL('../../core/test/fixtures/v7/double-holliday-junction.yaml', import.meta.url), 'utf8');

describe('a document with joins (RFC 0008)', () => {
  it('renders every step, and the joins change nothing that is drawn', () => {
    const mechanism = compileMechanism(parseMechanism(source));
    const resolved = mechanism.at('resolution');
    expect(resolved.joins).toBeDefined();
    for (let index = 0; index < mechanism.length; index += 1) {
      const scene = buildSvgScene(mechanism.at(index));
      expect(renderSvg(scene)).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
      expect(renderSvg(scene, { compact: true })).toContain('<svg');
      if (index > 0) expect(() => interpolateGeometry(geometryFrame(buildSvgScene(mechanism.at(index - 1))), geometryFrame(scene), 0.5)).not.toThrow();
    }
    // The same state without its joins is drawn the same: only what the action itself is called differs.
    const { joins: _joins, ...unjoined } = resolved;
    expect(JSON.stringify(buildSvgScene(unjoined).nucleicAcids)).toBe(JSON.stringify(buildSvgScene(resolved).nucleicAcids));
    expect(JSON.stringify(buildSvgScene(unjoined).pairings)).toBe(JSON.stringify(buildSvgScene(resolved).pairings));
  });
});
