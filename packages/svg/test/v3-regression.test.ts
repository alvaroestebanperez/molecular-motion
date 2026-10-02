import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
import { buildSvgScene, renderSvg } from '../src';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const golden = (name: string) => new URL(`./fixtures/v2/${name}.svg-sha256.json`, import.meta.url);
const sha256 = (markup: string) => createHash('sha256').update(markup).digest('hex');

/** Digest of every step, full and compact, as the viewer and the thumbnails render it. */
const renderAll = (source: string) => {
  const mechanism = compileMechanism(parseMechanism(source));
  return Array.from({ length: mechanism.length }, (_, index) => {
    const scene = buildSvgScene(mechanism.at(index));
    return { full: sha256(renderSvg(scene)), compact: sha256(renderSvg(scene, { compact: true })) };
  });
};

// RFC 0004 §8: schema v3 must not change a single byte of what v2 documents render. The examples
// themselves now use v3 geometry on purpose, so the frozen v2 copies in fixtures/v2 carry the guarantee.
describe('schema v2 → v3 regression (UPDATE_GOLDEN=1 to regenerate)', () => {
  it.each(['parp1-ssb-repair', 'homologous-recombination'])('%s: the v2 document renders byte-identically', name => {
    const rendered = renderAll(read(`./fixtures/v2/${name}.yaml`));
    if (process.env.UPDATE_GOLDEN) writeFileSync(golden(name), `${JSON.stringify(rendered, null, 2)}\n`);
    expect(rendered).toEqual(JSON.parse(readFileSync(golden(name), 'utf8')));
  });
});
