// Smoke check of drawn joins (ADR 0004) in a real browser: the double Holliday junction fixture, taken
// from the paired junction to a same-strand resolution and on to a different-strand one, at a desktop
// and a phone size. Each transition is sampled in mid-fade, and its end is compared with a clean render.
// Screenshots go to artifacts/joins-smoke/. Needs Chrome (set CHROME_PATH to override).
// Usage: npm run check:browser:joins
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5198;
const DEBUG_PORT = 9342;
const OUT = 'artifacts/joins-smoke';
const CHROME = process.env.CHROME_PATH ?? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!CHROME) { console.error('Chrome not found; set CHROME_PATH'); process.exit(2); }

// The fixture up to its paired double junction, then the two resolutions one after the other. Applying
// `reconnect-strands` again at the same sites undoes it, so the third step swaps the right junction
// from `top` to `bottom` and leaves the left one alone.
const fixture = readFileSync('packages/core/test/fixtures/v7/double-holliday-junction.yaml', 'utf8');
const site = '      - { id: hj-right, at: 58, strand: bottom }\n';
const cut = fixture.indexOf('  - id: nicking');
if (fixture.split(site).length !== 3 || cut < 0) { console.error('the fixture no longer has the shape this check edits'); process.exit(2); }
const SOURCE = fixture.slice(0, cut).replaceAll(site, `${site}      - { id: hj-right-top, at: 58, strand: top }\n`) + `  - id: same-strand
    title: Resolved on the same strand at both junctions
    actions:
      - { type: reconnect-strands, target: dna.hj-left, with: sister.hj-left }
      - { type: reconnect-strands, target: dna.hj-right-top, with: sister.hj-right-top }
  - id: different-strand
    title: Resolved on different strands at the two junctions
    actions:
      - { type: reconnect-strands, target: dna.hj-right-top, with: sister.hj-right-top }
      - { type: reconnect-strands, target: dna.hj-right, with: sister.hj-right }
`;
const PAIRED = SOURCE.slice(SOURCE.indexOf('\nsteps:')).match(/^ {2}- id: /gm).length - 3; // index of the last step before any join

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (probe, what) => { for (let attempt = 0; attempt < 100; attempt++) { try { return await probe(); } catch { await sleep(200); } } throw new Error(`${what} did not start`); };

const profile = mkdtempSync(join(tmpdir(), 'mm-joins-smoke-'));
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', 'apps/demo'], { stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const stop = () => { server.kill(); chrome.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* still in use */ } };

try {
  await until(async () => { if (!(await fetch(`http://localhost:${PORT}/`)).ok) throw new Error(); }, 'dev server');
  const targets = await until(async () => (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json(), 'Chrome');
  const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); pending.get(message.id)?.(message); pending.delete(message.id); });
  const send = (method, params = {}) => new Promise(resolve => { pending.set(++id, resolve); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const { result } = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const motion = reduced => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });

  // What the page is asked: the links, what is fading, and the three nucleic layers as drawn.
  const HELPERS = `
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const stage = document.querySelector('.mm-stage');
    const dots = () => [...document.querySelectorAll('.mm-scrubber__track button')];
    const next = document.querySelector('[aria-label="Next step"]');
    const layer = name => stage.querySelector('[data-layer="' + name + '"]');
    const look = () => {
      const svg = stage.querySelector('svg').getBoundingClientRect();
      const links = [...stage.querySelectorAll('[data-layer="joins"] > .mm-join:not(.mm-exit)')].map(link => {
        const box = link.getBoundingClientRect();
        return { key: link.getAttribute("data-key"), opacity: link.hasAttribute('opacity') ? Number(link.getAttribute('opacity')) : 1, shown: Number(getComputedStyle(link).opacity),
          inside: box.width > 0 && box.height > 0 && box.left >= svg.left - 1 && box.right <= svg.right + 1 && box.top >= svg.top - 1 && box.bottom <= svg.bottom + 1 };
      });
      return { links, fading: stage.querySelectorAll('.mm-dna__fading, .mm-dna__continuation').length,
        drawn: ['acids', 'pairings', 'joins'].map(name => layer(name)?.innerHTML ?? '').join('\\n'),
        scrollX: document.documentElement.scrollWidth > innerWidth + 1, width: Math.round(svg.width) };
    };`;
  const shoot = async name => {
    const clip = await evaluate(`const box = document.querySelector('.mm-stage').getBoundingClientRect(); return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height, scale: 1 };`);
    const { result } = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(result.data, 'base64'));
  };

  mkdirSync(OUT, { recursive: true });
  const failures = [];
  let checked = 0;
  const expectThat = (where, ok, what) => { checked += 1; if (!ok) failures.push(`${where}: ${what}`); };
  const keys = state => state.links.map(link => link.key.replace(/^join:/, '')).sort();
  const at = (state, boundary) => state.links.filter(link => link.key.includes(`@${boundary}>`));

  for (const [name, [width, height, mobile]] of Object.entries({ '1440x900': [1440, 900, false], '390x844': [390, 844, true] })) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await motion(false);
    await send('Page.navigate', { url: `http://localhost:${PORT}/#/playground` });
    await sleep(500); await send('Page.reload'); await sleep(1500);
    const loaded = await evaluate(`
      const editor = document.querySelector('.playground textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, ${JSON.stringify(SOURCE)});
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 800));
      return { valid: editor.getAttribute('aria-invalid') === 'false', error: document.querySelector('.playground [role=alert]')?.textContent ?? null, steps: document.querySelectorAll('.mm-scrubber__track button').length };`);
    if (!loaded.valid || loaded.steps !== PAIRED + 3) throw new Error(`the playground did not take the document: ${JSON.stringify(loaded)}`);

    // A clean render of each of the three steps: reached with reduced motion, so nothing was animated into it.
    await motion(true);
    const clean = await evaluate(`${HELPERS}
      const out = [];
      for (const index of [${PAIRED}, ${PAIRED + 1}, ${PAIRED + 2}]) { dots()[index].click(); await wait(1300); out.push(look()); }
      dots()[${PAIRED}].click(); await wait(1300);
      stage.scrollIntoView({ block: 'center' }); await wait(100);
      return out;`);
    await motion(false);
    await sleep(200);

    const [paired, same, different] = clean;
    expectThat(name, !paired.scrollX, 'the page scrolls sideways');
    expectThat(`${name} paired`, paired.links.length === 0 && paired.fading === 0, `a step without joins draws ${paired.links.length} links`);
    expectThat(`${name} same strand`, keys(same).join(' ') === 'dna.top@22>sister.top@22 dna.top@58>sister.top@58 sister.top@22>dna.top@22 sister.top@58>dna.top@58', `links: ${keys(same).join(' ')}`);
    expectThat(`${name} different strand`, keys(different).join(' ') === 'dna.bottom@58>sister.bottom@58 dna.top@22>sister.top@22 sister.bottom@58>dna.bottom@58 sister.top@22>dna.top@22', `links: ${keys(different).join(' ')}`);
    expectThat(`${name} resolutions`, same.drawn !== different.drawn && same.drawn !== paired.drawn, 'the two resolutions, or a resolution and the paired junction, are drawn the same');
    for (const [step, state] of [['same strand', same], ['different strand', different]]) {
      expectThat(`${name} ${step}`, state.links.every(link => link.opacity === 1 && link.shown === 1) && state.fading === 0, 'a settled step is still fading');
      expectThat(`${name} ${step}`, state.links.every(link => link.inside), 'a link is drawn outside the figure');
    }

    await shoot(`${name}-1-paired`);
    for (const [step, label, settled] of [[1, 'same-strand', same], [2, 'different-strand', different]]) {
      // A real transition: click, look in mid-fade, and look again once it is over.
      const start = await evaluate(`${HELPERS}
        window.__links = new Map([...stage.querySelectorAll('[data-layer="joins"] > .mm-join')].map(link => [link.getAttribute("data-key"), link]));
        next.click(); await wait(330); return look();`);
      await shoot(`${name}-${step * 2}-fading-to-${label}`);
      const end = await evaluate(`${HELPERS}
        await wait(1200);
        const kept = [...window.__links].filter(([key, link]) => stage.querySelector('[data-layer="joins"] > [data-key="' + key + '"]') === link).map(([key]) => key);
        return { ...look(), kept };`);
      await shoot(`${name}-${step * 2 + 1}-${label}`);

      const where = `${name} → ${label}`;
      const fadingLinks = start.links.filter(link => link.opacity < 1);
      expectThat(where, fadingLinks.length > 0 && fadingLinks.every(link => link.opacity > 0 && link.opacity < 1 && Math.abs(link.shown - link.opacity) < .011), `no link was caught in mid-fade (${start.links.map(link => link.opacity).join(', ')})`);
      expectThat(where, start.fading > 0, 'the continuation being replaced was not drawn during the fade');
      expectThat(where, start.drawn !== settled.drawn, 'the figure jumped: mid-transition it is already the final drawing');
      expectThat(where, end.drawn === settled.drawn, 'the completed transition differs from a clean render of the step');
      expectThat(where, end.fading === 0 && end.links.every(link => link.opacity === 1 && link.shown === 1), 'something is still fading after the transition');
      if (step === 2) {
        // The left junction is in both steps: its links stay at full strength, on the same elements.
        expectThat(where, at(start, 22).length === 2 && at(start, 22).every(link => link.opacity === 1), `the links both steps share faded (${at(start, 22).map(link => link.opacity).join(', ')})`);
        expectThat(where, end.kept.filter(key => key.includes('@22>')).length === 2, 'the links both steps share were replaced in the DOM');
        // The right junction changes hands: the two that leave and the two that arrive fade against each other.
        const leaving = start.links.filter(link => link.key.includes('top@58>')), arriving = start.links.filter(link => link.key.includes('bottom@58>'));
        expectThat(where, leaving.length === 2 && arriving.length === 2 && Math.abs(leaving[0].opacity + arriving[0].opacity - 1) < .011, `the right junction did not cross-fade (${leaving.map(link => link.opacity).join(', ')} out, ${arriving.map(link => link.opacity).join(', ')} in)`);
      }
    }
  }
  socket.close();
  console.log(`joins: ${checked} checks at 1440×900 and 390×844; ${failures.length} failed; screenshots in ${OUT}/`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  if (failures.length) process.exitCode = 1;
} finally {
  stop();
}
