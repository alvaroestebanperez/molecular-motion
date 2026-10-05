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
    for (const needed of ['package/dist/index.js', 'package/dist/index.d.ts', 'package/README.md', 'package/LICENSE']) {
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
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
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
console.log(mechanism.length + ' steps rendered from the installed packages');
`);
  process.stdout.write(run('node', ['check.mjs'], app));
  console.log(`Packed and installed @molecular-motion/{${PACKAGES.join(',')}}@${version}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
