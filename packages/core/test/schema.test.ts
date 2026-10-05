import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SCHEMA_BASE_URL, toJsonSchema } from '../src';

const path = new URL('../schema.json', import.meta.url);

it('committed schema.json matches the action registry (UPDATE_SCHEMA=1 to regenerate)', () => {
  const generated = `${JSON.stringify(toJsonSchema(), null, 2)}\n`;
  if (process.env.UPDATE_SCHEMA) writeFileSync(path, generated);
  expect(readFileSync(path, 'utf8')).toBe(generated);
});

it('every schema names the URL it is served at: the current one and each archived version', () => {
  const directory = new URL('../', import.meta.url);
  const files = readdirSync(directory).filter(file => /^schema(\.v\d+)?\.json$/.test(file));
  const current = (toJsonSchema().properties as { schemaVersion: { const: number } }).schemaVersion.const;
  const versions = files.map(file => {
    const version = file === 'schema.json' ? current : Number(file.match(/v(\d+)/)![1]);
    expect(JSON.parse(readFileSync(new URL(file, directory), 'utf8')).$id, file).toBe(`${SCHEMA_BASE_URL}/v${version}.json`);
    return version;
  });
  // One file per version, with no gap: every document version ever accepted has its schema.
  expect(versions.sort((a, b) => a - b)).toEqual(Array.from({ length: current }, (_, index) => index + 1));
});
