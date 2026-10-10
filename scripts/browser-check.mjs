// Checks in a real browser what a DOM comparison cannot see: that transitions actually animate.
// Needs Chrome (set CHROME_PATH to override). Usage: npm run check:browser
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5197;
const DEBUG_PORT = 9341;
const EXAMPLES = ['homologous-recombination', 'parp1-ssb-repair', 'egfr-dimerization', 'double-holliday-junction'];
const CHROME = process.env.CHROME_PATH ?? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!CHROME) { console.error('Chrome not found; set CHROME_PATH'); process.exit(2); }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (probe, what) => { for (let attempt = 0; attempt < 100; attempt++) { try { return await probe(); } catch { await sleep(200); } } throw new Error(`${what} did not start`); };

const profile = mkdtempSync(join(tmpdir(), 'mm-browser-check-'));
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
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  const failures = [];
  let checked = 0;
  let strandsChecked = 0;
  let polishChecked = 0;
  for (const example of EXAMPLES) {
    await send('Page.navigate', { url: `http://localhost:${PORT}/app/#/mechanisms/${example}` });
    await sleep(600); await send('Page.reload'); await sleep(1500);
    // Walk every step. Whenever an upcoming (ghost) actor becomes present, sample it in mid-transition.
    const results = await evaluate(`
      const stage = document.querySelector('.viewer__canvas');
      const next = document.querySelector('[aria-label="Next step"]');
      const look = element => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, opacity: Number(style.opacity), blur: Number(/blur\\(([\\d.]+)px\\)/.exec(style.filter)?.[1] ?? 0) }; };
      const out = [];
      while (next.getAttribute('aria-disabled') !== 'true') {
        const ghosts = new Map([...stage.querySelectorAll('.mm-actor--ghost')].map(element => [element.dataset.key, { element, from: look(element) }]));
        next.click();
        await new Promise(resolve => setTimeout(resolve, 150));
        const arriving = [...ghosts].filter(([key, { element }]) => element.isConnected && element.dataset.key === key && !element.classList.contains('mm-actor--ghost') && !element.classList.contains('mm-exit'));
        const mid = arriving.map(([key, { element, from }]) => ({ key, from, mid: look(element), element }));
        await new Promise(resolve => setTimeout(resolve, 1100));
        for (const { key, from, mid: middle, element } of mid) out.push({ key, step: document.querySelector('.viewer__caption h2').textContent, from, mid: middle, to: look(element), kept: element.isConnected });
      }
      return out;`);
    // Strands (ADR 0001): walk again and sample the nucleic paths while they change.
    await send('Page.reload'); await sleep(1500);
    const strands = await evaluate(`
      const stage = document.querySelector('.viewer__canvas');
      const next = document.querySelector('[aria-label="Next step"]');
      const paths = () => new Map([...stage.querySelectorAll('[data-layer="acids"] > [data-key] path, [data-layer="pairings"] > [data-key] path')]
        .map(path => [path.closest('[data-key]').dataset.key + ' ' + path.getAttribute('class') + (path.parentElement.matches('.mm-dna__back') ? ' back' : ''), path]));
      const measure = map => new Map([...map].map(([key, path]) => [key, { path, d: path.getAttribute('d'), length: path.getAttribute('d') ? path.getTotalLength() : 0 }]));
      const pairingKeys = () => [...stage.querySelectorAll('[data-layer="pairings"] > [data-key]')].map(group => group.dataset.key).sort().join(',');
      const out = [];
      while (next.getAttribute('aria-disabled') !== 'true') {
        const before = measure(paths());
        const pairedBefore = pairingKeys();
        next.click();
        const samples = [];
        for (const wait of [150, 200, 200]) { await new Promise(resolve => setTimeout(resolve, wait)); samples.push(measure(paths())); }
        await new Promise(resolve => setTimeout(resolve, 900));
        const after = measure(paths());
        const step = document.querySelector('.viewer__caption h2').textContent;
        for (const [key, end] of after) {
          const start = before.get(key);
          if (!start || start.d === end.d) continue;
          // Base pairs are discrete marks: each is one subpath. A change that only adds or removes whole ones has no shape in between.
          const marks = d => new Set((d ?? '').split(/(?=M)/).filter(Boolean));
          const [was, will] = [marks(start.d), marks(end.d)];
          const [fewer, more] = was.size <= will.size ? [was, will] : [will, was];
          const discrete = key.includes('mm-dna__rungs') && [...fewer].every(mark => more.has(mark));
          out.push({ step, key, discrete, handoff: pairedBefore !== pairingKeys(), kept: start.path === end.path && start.path.isConnected, start: start.length, end: end.length,
            mid: samples.map(sample => sample.get(key)?.length ?? null), moving: samples.map(sample => { const d = sample.get(key)?.d; return d !== undefined && d !== start.d && d !== end.d; }) });
        }
      }
      return out;`);
    for (const { step, key, discrete, handoff, kept, start, end, mid, moving } of strands) {
      strandsChecked += 1;
      const paired = key.startsWith('pairing:');
      // What must show an intermediate shape: a strand paired across molecules, a nascent tract, and any
      // backbone whose drawn length changes clearly (a gap, a bubble). Two changes are discrete by design
      // and exempt: the fixed gap of a lesion at a site, and a backbone handing a stretch over to the
      // pairing layer or taking it back (the stretch itself is checked there).
      const backbone = key.includes('mm-dna__tube') || key.endsWith(' back');
      // A set of base pairs that only gains or loses whole marks is discrete too: the strands they join
      // are checked on their own paths, and those must still move.
      const mustMove = !discrete && (paired || key.includes('mm-dna__nascent') || (backbone && Math.abs(end - start) > 60 && !handoff));
      const steady = (length, index) => length !== null && (end > start ? length >= (index ? mid[index - 1] : start) - 3 : length <= (index ? mid[index - 1] : start) + 3);
      const problems = [
        !kept && 'its <path> was replaced',
        mustMove && !moving.some(Boolean) && 'it jumped: no intermediate shape was drawn',
        // A paired strand that ends longer never gets shorter on the way, and the other way round.
        paired && key.includes('mm-dna__tube') && Math.abs(end - start) > 40 && !mid.every(steady) && `its length did not change steadily (${[start, ...mid, end].map(Math.round).join(' → ')})`,
      ].filter(Boolean);
      if (problems.length) failures.push(`${example} · ${step} · ${key}: ${problems.join('; ')}`);
    }
    for (const { key, step, from, mid, to, kept } of results) {
      checked += 1;
      const travelled = Math.hypot(to.x - from.x, to.y - from.y);
      const progress = Math.hypot(mid.x - from.x, mid.y - from.y) / (travelled || 1);
      const between = (value, a, b) => value > Math.min(a, b) + 1e-3 && value < Math.max(a, b) - 1e-3;
      const problems = [
        !kept && 'its DOM node was replaced',
        travelled > 2 && !(progress > .02 && progress < .98) && `position jumped (${Math.round(progress * 100)} % of the way after 150 ms)`,
        !between(mid.opacity, from.opacity, to.opacity) && `opacity jumped (${from.opacity} → ${mid.opacity} → ${to.opacity})`,
        !between(mid.blur, from.blur, to.blur) && `blur jumped (${from.blur} → ${mid.blur} → ${to.blur})`,
      ].filter(Boolean);
      if (problems.length) failures.push(`${example} · ${step} · ${key}: ${problems.join('; ')}`);
    }
  }

  // ---- Viewer polish: the same checks at a desktop and a phone size ----
  const polish = [];
  const expectThat = (where, ok, what) => { polishChecked += 1; if (!ok) polish.push(`${where}: ${what}`); };
  const open = async (example, [width, height, mobile], reduced = false) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
    await send('Page.navigate', { url: `http://localhost:${PORT}/app/#/mechanisms/${example}` });
    await sleep(500); await send('Page.reload'); await sleep(1500);
  };
  const VIEWPORTS = { '1440×900': [1440, 900, false], '390×844': [390, 844, true] };
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    await open('homologous-recombination', viewport);
    const page = await evaluate(`
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const stage = document.querySelector('.viewer__canvas');
      const svg = stage.querySelector('svg');
      const [, , boxWidth] = svg.getAttribute('viewBox').split(' ').map(Number);
      const drawn = svg.getBoundingClientRect().width / boxWidth;
      const onScreen = selector => { const element = stage.querySelector(selector); return element ? parseFloat(getComputedStyle(element).fontSize) * drawn : null; };
      const next = document.querySelector('[aria-label="Next step"]');
      const previous = document.querySelector('[aria-label="Previous step"]');
      const current = () => [...document.querySelectorAll('.mm-timeline__step')].findIndex(item => item.getAttribute('aria-current') === 'step');
      const out = { viewBox: svg.getAttribute('viewBox'), scrollX: document.documentElement.scrollWidth > innerWidth + 1 };
      // Canvas: the figure fills the room the stage gives it.
      out.fill = svg.getBoundingClientRect().height / stage.getBoundingClientRect().height;
      // Text on screen.
      out.text = { polarity: onScreen('.mm-dna__polarity'), callout: onScreen('.mm-label--alert .mm-callout'), pill: onScreen('.mm-pill__text') };
      // Focus at the ends: the button that cannot go further keeps the focus.
      previous.focus(); previous.click(); await wait(100);
      out.previousAtStart = { focused: document.activeElement === previous, disabled: previous.getAttribute('aria-disabled'), native: previous.disabled, step: current() };
      const strip = document.querySelector('.mm-thumbnails');
      const visible = () => { const a = strip.querySelector('[aria-current]').getBoundingClientRect(), b = strip.getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1; };
      // From the top of the page and without the scroll a focus brings, so only the strip can move things.
      scrollTo(0, 0); await wait(50);
      const pageY = scrollY;
      const last = document.querySelectorAll('.mm-timeline__step').length - 1;
      next.focus({ preventScroll: true });
      for (let index = 0; index < last + 2; index++) { next.click(); await wait(40); }
      await wait(900);
      out.nextAtEnd = { focused: document.activeElement === next, disabled: next.getAttribute('aria-disabled'), native: next.disabled, step: current(), last };
      // Thumbnails follow the step, sideways only.
      out.thumbnails = { scrolls: strip.scrollWidth > strip.clientWidth, atEnd: visible(), pageMoved: Math.abs(scrollY - pageY) > 1 };
      document.querySelector('.mm-timeline li:nth-child(1) button').click(); await wait(900);
      out.thumbnails.atStart = visible();
      // Touch targets of the step dots: what a finger hits around each dot, and whether neighbours overlap.
      const dots = [...document.querySelectorAll('.mm-scrubber__track button')];
      dots[0].scrollIntoView({ block: 'center' }); await wait(100);
      const centres = dots.map(dot => { const r = dot.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      const hits = (dot, centre, dx, dy) => document.elementFromPoint(centre.x + dx, centre.y + dy) === dot;
      out.targets = {
        count: dots.length,
        reach: dots.every((dot, index) => hits(dot, centres[index], 0, 11) && hits(dot, centres[index], 0, -11) && hits(dot, centres[index], 11, 0) && hits(dot, centres[index], -11, 0)),
        spacing: Math.min(...centres.slice(1).map((centre, index) => centre.x - centres[index].x)),
      };
      return out;`);
    const phone = viewport[2];
    expectThat(name, page.viewBox === (phone ? '0 0 520 600' : '0 0 960 540'), `unexpected canvas ${page.viewBox}`);
    expectThat(name, !page.scrollX, 'the page scrolls sideways');
    expectThat(name, page.fill > .9, `the figure fills only ${Math.round(page.fill * 100)} % of the canvas height`);
    for (const [kind, size] of Object.entries(page.text)) expectThat(name, size === null || size >= 9.5, `${kind} text is ${size?.toFixed(1)} px on screen`);
    expectThat(name, page.previousAtStart.focused && page.previousAtStart.disabled === 'true' && !page.previousAtStart.native && page.previousAtStart.step === 0, `Previous at the first step: ${JSON.stringify(page.previousAtStart)}`);
    expectThat(name, page.nextAtEnd.focused && page.nextAtEnd.disabled === 'true' && !page.nextAtEnd.native && page.nextAtEnd.step === page.nextAtEnd.last, `Next at the last step: ${JSON.stringify(page.nextAtEnd)}`);
    expectThat(name, !page.thumbnails.scrolls || (page.thumbnails.atEnd && page.thumbnails.atStart), `the current thumbnail is not in view: ${JSON.stringify(page.thumbnails)}`);
    expectThat(name, !page.thumbnails.pageMoved, 'following the thumbnail moved the page');
    expectThat(name, page.targets.reach, 'a step dot cannot be hit 11 px from its centre');
    expectThat(name, page.targets.spacing >= 22, `step dots are ${page.targets.spacing.toFixed(1)} px apart: their touch targets overlap`);

    // Lesion labels stay inside the canvas at every step, also when their text is enlarged.
    for (const example of ['homologous-recombination', 'parp1-ssb-repair']) {
      if (example !== 'homologous-recombination') await open(example, viewport);
      const clipped = await evaluate(`
        const stage = document.querySelector('.viewer__canvas').getBoundingClientRect();
        const out = [];
        for (const button of document.querySelectorAll('.mm-timeline li button')) {
          button.click(); await new Promise(resolve => setTimeout(resolve, 1000));
          for (const text of document.querySelectorAll('.viewer__canvas .mm-label--alert .mm-callout')) {
            const box = text.getBoundingClientRect();
            if (box.left < stage.left - 1 || box.right > stage.right + 1) out.push(document.querySelector('.viewer__caption h2').textContent);
          }
        }
        return out;`);
      expectThat(`${name} ${example}`, clipped.length === 0, `a lesion label runs off the canvas at: ${clipped.join(', ')}`);
    }

    // Reduced motion: nothing animates, in the figure or in the controls, and steps still settle.
    await open('homologous-recombination', viewport, true);
    const calm = await evaluate(`
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const stage = document.querySelector('.viewer__canvas');
      const durations = selector => { const element = document.querySelector(selector); return element ? getComputedStyle(element).transitionDuration : null; };
      const out = { durations: Object.fromEntries(['.viewer__canvas .mm-actor', '.viewer__canvas [data-layer=acids]', '.mm-icon-button', '.mm-controls__play', '.mm-scrubber__track button', '.mm-timeline__step', '.mm-thumbnail'].map(selector => [selector, durations(selector)])) };
      document.querySelector('.mm-timeline li:nth-child(8) button').click(); await wait(300);
      const next = document.querySelector('[aria-label="Next step"]');
      next.click(); await wait(60);
      const strand = () => stage.querySelector('[data-layer="pairings"] .mm-dna__tube')?.getAttribute('d') ?? null;
      const early = strand();
      out.running = document.getAnimations().filter(animation => stage.contains(animation.effect?.target)).length;
      await wait(900);
      out.settledAtOnce = early !== null && early === strand();
      const strip = document.querySelector('.mm-thumbnails');
      document.querySelector('.mm-timeline li:last-child button').click(); await wait(120);
      const a = strip.querySelector('[aria-current]').getBoundingClientRect(), b = strip.getBoundingClientRect();
      out.thumbnailAtOnce = strip.scrollWidth <= strip.clientWidth || (a.left >= b.left - 1 && a.right <= b.right + 1);
      return out;`);
    for (const [selector, duration] of Object.entries(calm.durations)) expectThat(`${name} reduced motion`, duration === null || duration.split(',').every(item => parseFloat(item) === 0), `${selector} still transitions (${duration})`);
    expectThat(`${name} reduced motion`, calm.running === 0, `${calm.running} animations running in the figure`);
    expectThat(`${name} reduced motion`, calm.settledAtOnce, 'the paired strand did not settle at once');
    expectThat(`${name} reduced motion`, calm.thumbnailAtOnce, 'the current thumbnail was not in view at once');
  }
  // One tab stop for copies that are identical in a step, and one each as soon as anything tells them apart.
  await open('egfr-dimerization', VIEWPORTS['1440×900']);
  const tabs = await evaluate(`
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const stage = document.querySelector('.viewer__canvas');
    const stops = () => [...stage.querySelectorAll('[data-actor][role=button]')].map(actor => actor.dataset.actor + ':' + actor.getAttribute('tabindex') + ':' + actor.getAttribute('aria-label'));
    const first = stops();
    document.querySelector('[aria-label="Next step"]').click(); await wait(1200);
    return { first, second: stops() };`);
  expectThat('tab stops', tabs.first.join(' | ') === 'egfr#1:0:EGFR, inactive, 2 identical copies | egfr#2:-1:EGFR, inactive', `identical copies: ${tabs.first.join(' | ')}`);
  expectThat('tab stops', tabs.second.filter(stop => stop.startsWith('egfr#')).every(stop => stop.split(':')[1] === '0'), `copies bound to different ligands: ${tabs.second.join(' | ')}`);
  await open('homologous-recombination', VIEWPORTS['1440×900']);
  const filament = await evaluate(`
    document.querySelector('.mm-timeline li:nth-child(7) button').click(); await new Promise(resolve => setTimeout(resolve, 1200));
    return [...document.querySelectorAll('.viewer__canvas [data-actor^="rad51#"][role=button]')].map(actor => actor.getAttribute('tabindex'));`);
  expectThat('tab stops', filament.length === 6 && filament.every(index => index === '0'), `RAD51 copies on different nucleotides: ${filament.join(',')}`);
  failures.push(...polish);
  socket.close();
  console.log(`ghost → present: ${checked} transitions sampled in mid-flight; strands: ${strandsChecked} changing paths sampled in mid-flight; viewer: ${polishChecked} checks at 1440×900 and 390×844; ${failures.length} failed`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  if (!checked) { console.error('nothing was checked'); process.exitCode = 1; }
  if (failures.length) process.exitCode = 1;
} finally {
  stop();
}
