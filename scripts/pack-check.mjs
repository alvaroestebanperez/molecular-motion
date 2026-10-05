// Checks the packages as a user gets them: packs the three, installs the tarballs into an empty
// project and uses them from there. Build first. Needs the network, to install react. Usage: npm run check:pack
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PACKAGES = ['core', 'svg', 'react'];
const work = mkdtempSync(join(tmpdir(), 'mm-pack-check-'));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });

try {
  const version = JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8')).version;
  for (const name of PACKAGES) {
    const manifest = JSON.parse(readFileSync(join(root, `packages/${name}/package.json`), 'utf8'));
    if (manifest.version !== version) throw new Error(`@molecular-motion/${name} is ${manifest.version}, core is ${version}: the packages are released together`);
    run('npm', ['pack', '--pack-destination', work], join(root, `packages/${name}`));
  }
  const tarballs = readdirSync(work).filter(file => file.endsWith('.tgz'));
  for (const tarball of tarballs) {
    const files = run('tar', ['-tzf', join(work, tarball)]).split('\n');
    const entries = tarball.includes('-core-') ? ['package/dist/yaml.js', 'package/dist/yaml.d.ts'] : [];
    for (const needed of ['package/dist/index.js', 'package/dist/index.d.ts', 'package/README.md', 'package/LICENSE', ...entries]) {
      if (!files.includes(needed)) throw new Error(`${tarball} has no ${needed.replace('package/', '')}`);
    }
  }

  const app = join(work, 'app');
  run('mkdir', [app]);
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'pack-check', private: true, type: 'module' }));
  run('npm', ['install', '--no-audit', '--no-fund', ...tarballs.map(file => join(work, file)), 'react', 'react-dom'], app);
  copyFileSync(join(root, 'examples/gene-expression.yaml'), join(app, 'mechanism.yaml'));
  writeFileSync(join(app, 'check.mjs'), `
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as core from '@molecular-motion/core';
import { compileMechanism, MechanismValidationError } from '@molecular-motion/core';
import { parseMechanism } from '@molecular-motion/core/yaml';
import { buildSvgScene, exportSvg, mechanismReservation, renderSvg } from '@molecular-motion/svg';
import { MolecularMechanism } from '@molecular-motion/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const mechanism = compileMechanism(parseMechanism(readFileSync('mechanism.yaml', 'utf8')));
const reservation = mechanismReservation(mechanism);
for (let step = 0; step < mechanism.length; step += 1) {
  if (!renderSvg(buildSvgScene(mechanism.at(step), { reservation })).startsWith('<svg')) throw new Error('step ' + step + ' did not render');
}
if (!exportSvg(buildSvgScene(mechanism.at(0)), { theme: 'light' }).includes('<style')) throw new Error('the exported figure carries no styles');
if (!renderToString(createElement(MolecularMechanism, { definition: mechanism.definition, controls: true })).includes('<svg')) throw new Error('the player did not render');
// The two entries of core are one package: an error thrown by the YAML entry is the class the main entry exports.
if ('parseMechanism' in core) throw new Error('the main entry of core exports parseMechanism');
try { parseMechanism('actors: ['); throw new Error('invalid YAML was accepted'); }
catch (error) { if (!(error instanceof MechanismValidationError)) throw new Error('the entries of core do not share MechanismValidationError: ' + error.message); }

// The main entry of core, and everything it loads, never imports the YAML parser. svg and react use only that entry.
const packageImports = entry => {
  const seen = new Set(); const found = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(/(?:import|export)[^'"]*?from\s*["']([^"']+)["']/g)) {
      if (specifier.startsWith('.')) visit(join(dirname(file), specifier)); else found.add(specifier);
    }
  };
  visit(entry);
  return [...found];
};
const installed = name => join('node_modules/@molecular-motion', name, 'dist/index.js');
const fromCore = packageImports(installed('core'));
if (fromCore.length) throw new Error('the main entry of core imports ' + fromCore.join(', '));
for (const name of ['svg', 'react']) {
  const wrong = packageImports(installed(name)).filter(specifier => specifier.startsWith('@molecular-motion/core/'));
  if (wrong.length) throw new Error('@molecular-motion/' + name + ' imports ' + wrong.join(', '));
}
console.log(mechanism.length + ' steps rendered from the installed packages; the main entry of core loads no YAML parser');
`);
  process.stdout.write(run('node', ['check.mjs'], app));
  console.log(`Packed and installed @molecular-motion/{${PACKAGES.join(',')}}@${version}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
