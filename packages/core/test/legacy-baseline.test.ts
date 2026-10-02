import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism, parseMechanism } from '../src';
import { MECHANISMS, semanticProjection } from './helpers';

/**
 * Legacy semantic baseline (RFC 0005 §8): what each step *means* for frozen v2 and v3 documents.
 * Renders are locked separately by SHA-256 in the svg package. UPDATE_GOLDEN=1 regenerates; only for
 * an intended, reviewed change of meaning.
 */
const FIXTURES = {
  v2: (name: string) => new URL(`../../svg/test/fixtures/v2/${name}.yaml`, import.meta.url),
  v3: (name: string) => new URL(`./fixtures/v3/${name}.yaml`, import.meta.url),
} as const;
const golden = (version: string, name: string) => new URL(`./fixtures/baseline/${version}.${name}.semantic.json`, import.meta.url);

describe.each(Object.keys(FIXTURES) as (keyof typeof FIXTURES)[])('legacy semantic baseline: schema %s', version => {
  it.each(MECHANISMS)('%s means the same at every step', name => {
    const projection = JSON.parse(JSON.stringify(semanticProjection(compileMechanism(parseMechanism(readFileSync(FIXTURES[version](name), 'utf8'))))));
    if (process.env.UPDATE_GOLDEN) writeFileSync(golden(version, name), `${JSON.stringify(projection, null, 2)}\n`);
    expect(projection).toEqual(JSON.parse(readFileSync(golden(version, name), 'utf8')));
  });
});
