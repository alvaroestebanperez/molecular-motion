import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism } from '../src';
import { parseMechanism } from '../src/yaml';
import { EXAMPLES, MECHANISMS, semanticProjection } from './helpers';

/**
 * Legacy semantic baseline (RFC 0005 §8, RFC 0006 §12, RFC 0007 §11): what each step *means* for frozen
 * v2 to v6 documents. v4 also locks the interaction graph and occupancy, and v5 the pairings, which their
 * documents author. v6 adds a document that begins partial and excises an interval; it has no render
 * baseline, since an excised interval has no agreed drawing yet. Renders are locked separately by SHA-256 in the svg package. UPDATE_GOLDEN=1 regenerates; only for
 * an intended, reviewed change of meaning.
 */
const FIXTURES = {
  v2: (name: string) => new URL(`../../svg/test/fixtures/v2/${name}.yaml`, import.meta.url),
  v3: (name: string) => new URL(`./fixtures/v3/${name}.yaml`, import.meta.url),
  v4: (name: string) => new URL(`./fixtures/v4/${name}.yaml`, import.meta.url),
  v5: (name: string) => new URL(`./fixtures/v5/${name}.yaml`, import.meta.url),
  v6: (name: string) => new URL(`./fixtures/v6/${name}.yaml`, import.meta.url),
} as const;
const DOCUMENTS: Record<keyof typeof FIXTURES, readonly string[]> = { v2: MECHANISMS, v3: MECHANISMS, v4: EXAMPLES, v5: EXAMPLES, v6: [...EXAMPLES, 'gene-expression'] };
const golden = (version: string, name: string) => new URL(`./fixtures/baseline/${version}.${name}.semantic.json`, import.meta.url);

describe.each(Object.keys(FIXTURES) as (keyof typeof FIXTURES)[])('legacy semantic baseline: schema %s', version => {
  it.each(DOCUMENTS[version])('%s means the same at every step', name => {
    const mechanism = compileMechanism(parseMechanism(readFileSync(FIXTURES[version](name), 'utf8')));
    const projection = JSON.parse(JSON.stringify(semanticProjection(mechanism, { assemblies: version !== 'v2' && version !== 'v3', topology: version === 'v5' || version === 'v6' })));
    if (process.env.UPDATE_GOLDEN) writeFileSync(golden(version, name), `${JSON.stringify(projection, null, 2)}\n`);
    expect(projection).toEqual(JSON.parse(readFileSync(golden(version, name), 'utf8')));
  });
});
