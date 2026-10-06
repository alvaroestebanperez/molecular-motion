import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as core from '../src';
import { parseMechanism } from '../src/yaml';

/**
 * The main entry never loads the YAML parser. `yaml` does not declare itself free of side effects, so
 * a bundler keeps it wherever it is imported: one import reachable from `src/index.ts` would put the
 * parser back into every page that uses core, svg or react.
 */
const source = (file: string) => fileURLToPath(new URL(`../src/${file}`, import.meta.url));
/** Every module reachable from `entry` through relative imports, with the packages each one imports. */
function reach(entry: string): { files: string[]; packages: Set<string> } {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)) {
      if (!specifier) continue;
      if (!specifier.startsWith('.')) { packages.add(specifier); continue; }
      const base = resolve(dirname(file), specifier);
      visit([`${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')].find(existsSync)!);
    }
  };
  visit(entry);
  return { files: [...seen], packages };
}

describe('entries of @molecular-motion/core', () => {
  it('the main entry imports no package at all, and so never the YAML parser', () => {
    const main = reach(source('index.ts'));
    expect(main.files.length).toBeGreaterThan(10);
    expect([...main.packages]).toEqual([]);
    expect(main.files).not.toContain(source('yaml.ts'));
  });

  it('the yaml entry is the one module that imports the parser', () => {
    expect([...reach(source('yaml.ts')).packages]).toEqual(['yaml']);
  });

  it('the main entry does not export parseMechanism, and still validates and compiles a parsed document', () => {
    expect(core).not.toHaveProperty('parseMechanism');
    const document = { schemaVersion: 7, mechanism: { id: 'x', name: 'X' }, actors: [{ id: 'a', type: 'protein' }], steps: [{ id: 's', title: 'S', actions: [{ type: 'show', actor: 'a' }] }] };
    expect(core.validateMechanism(document).schemaVersion).toBe(7);
    expect(core.compileMechanism(document).length).toBe(1);
  });

  it('parseMechanism reads YAML and JSON text, and validates a document it is handed', () => {
    const yaml = 'schemaVersion: 7\nmechanism: { id: x, name: X }\nactors:\n  - { id: a, type: protein }\nsteps:\n  - { id: s, title: S, actions: [{ type: show, actor: a }] }\n';
    const parsed = parseMechanism(yaml);
    expect(parsed.actors[0]!.id).toBe('a');
    expect(parseMechanism(JSON.stringify(parsed))).toEqual(parsed);
    expect(parseMechanism(parsed)).toEqual(parsed);
    expect(parsed).toEqual(core.validateMechanism(parsed));
    expect(() => parseMechanism('actors: [')).toThrow(core.MechanismValidationError);
  });
});
