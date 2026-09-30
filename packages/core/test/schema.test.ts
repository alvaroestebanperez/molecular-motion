import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { toJsonSchema } from '../src';

const path = new URL('../schema.json', import.meta.url);

it('committed schema.json matches the action registry (UPDATE_SCHEMA=1 to regenerate)', () => {
  const generated = `${JSON.stringify(toJsonSchema(), null, 2)}\n`;
  if (process.env.UPDATE_SCHEMA) writeFileSync(path, generated);
  expect(readFileSync(path, 'utf8')).toBe(generated);
});
