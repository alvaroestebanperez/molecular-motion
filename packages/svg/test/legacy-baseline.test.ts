import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
// The player's own ghost selection, so the baseline covers the path the viewer actually renders.
import { firstAppearances, upcomingActors } from '../../react/src/player';
import { buildSvgScene, renderSvg } from '../src';

/**
 * Legacy render baseline (RFC 0004 §8, RFC 0005 §8). Frozen copies of the documents as they were at
 * each schema version must render byte-identically through every later schema change. Each step is
 * locked three ways: full viewer, compact thumbnail, and the viewer with upcoming actors as ghosts.
 * UPDATE_GOLDEN=1 regenerates; do that only when a visual change is intended and reviewed.
 */
const FIXTURES = {
  v2: (name: string) => new URL(`./fixtures/v2/${name}.yaml`, import.meta.url),
  v3: (name: string) => new URL(`../../core/test/fixtures/v3/${name}.yaml`, import.meta.url),
} as const;
const MECHANISMS = ['parp1-ssb-repair', 'homologous-recombination'] as const;
const golden = (version: string, name: string) => new URL(`./fixtures/baseline/${version}.${name}.svg-sha256.json`, import.meta.url);
const sha256 = (markup: string) => createHash('sha256').update(markup).digest('hex');

function digests(source: string) {
  const mechanism = compileMechanism(parseMechanism(source));
  const appearances = firstAppearances(mechanism);
  return Array.from({ length: mechanism.length }, (_, index) => {
    const snapshot = mechanism.at(index);
    const scene = buildSvgScene(snapshot);
    return {
      step: snapshot.step.id,
      full: sha256(renderSvg(scene)),
      compact: sha256(renderSvg(scene, { compact: true })),
      ghosts: sha256(renderSvg(buildSvgScene(snapshot, { ghosts: upcomingActors(appearances, index) }))),
    };
  });
}

describe.each(Object.keys(FIXTURES) as (keyof typeof FIXTURES)[])('legacy render baseline: schema %s', version => {
  it.each(MECHANISMS)('%s renders byte-identically', name => {
    const rendered = digests(readFileSync(FIXTURES[version](name), 'utf8'));
    if (process.env.UPDATE_GOLDEN) writeFileSync(golden(version, name), `${JSON.stringify(rendered, null, 2)}\n`);
    expect(rendered).toEqual(JSON.parse(readFileSync(golden(version, name), 'utf8')));
  });
});
