// Checks in a real browser what a DOM comparison cannot see: that transitions actually animate.
// Needs Chrome (set CHROME_PATH to override). Usage: npm run check:browser
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5197;
const DEBUG_PORT = 9341;
const EXAMPLES = ['homologous-recombination', 'parp1-ssb-repair', 'egfr-dimerization'];
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
  for (const example of EXAMPLES) {
    await send('Page.navigate', { url: `http://localhost:${PORT}/#/mechanisms/${example}` });
    await sleep(600); await send('Page.reload'); await sleep(1500);
    // Walk every step. Whenever an upcoming (ghost) actor becomes present, sample it in mid-transition.
    const results = await evaluate(`
      const stage = document.querySelector('.viewer__canvas');
      const next = document.querySelector('[aria-label="Next step"]');
      const look = element => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, opacity: Number(style.opacity), blur: Number(/blur\\(([\\d.]+)px\\)/.exec(style.filter)?.[1] ?? 0) }; };
      const out = [];
      while (!next.disabled) {
        const ghosts = new Map([...stage.querySelectorAll('.mm-actor--ghost')].map(element => [element.dataset.key, { element, from: look(element) }]));
        next.click();
        await new Promise(resolve => setTimeout(resolve, 150));
        const arriving = [...ghosts].filter(([key, { element }]) => element.isConnected && element.dataset.key === key && !element.classList.contains('mm-actor--ghost') && !element.classList.contains('mm-exit'));
        const mid = arriving.map(([key, { element, from }]) => ({ key, from, mid: look(element), element }));
        await new Promise(resolve => setTimeout(resolve, 1100));
        for (const { key, from, mid: middle, element } of mid) out.push({ key, step: document.querySelector('.viewer__caption h2').textContent, from, mid: middle, to: look(element), kept: element.isConnected });
      }
      return out;`);
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
  socket.close();
  console.log(`ghost → present: ${checked} transitions sampled in mid-flight, ${failures.length} failed`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  if (!checked) { console.error('nothing was checked'); process.exitCode = 1; }
  if (failures.length) process.exitCode = 1;
} finally {
  stop();
}
