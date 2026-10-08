import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { compileMechanism, MechanismValidationError, type MechanismDefinition, type MechanismSnapshot } from '@molecular-motion/core';
import { parseMechanism } from '@molecular-motion/core/yaml';
import { buildSvgScene, COMPOSED_COMPLEX_VISUAL, exportPng, exportSvg, mechanismReservation, type LayoutReservation, type ProteinActorVisuals } from '@molecular-motion/svg';
import {
  MechanismStage, MolecularMechanism, PlaybackControls, StepDetails, StepThumbnails, StepTimeline, VisualVocabulary, useMechanismPlayer, useMolecularMotionStyles,
} from '@molecular-motion/react';
import parpSource from '../../../examples/parp1-ssb-repair.yaml?raw';
import hrSource from '../../../examples/homologous-recombination.yaml?raw';
import egfrSource from '../../../examples/egfr-dimerization.yaml?raw';
import p53Source from '../../../examples/p53-mdm2-feedback.yaml?raw';
import cgasSource from '../../../examples/cgas-sting.yaml?raw';
import geneExpressionSource from '../../../examples/gene-expression.yaml?raw';
import dhjSource from '../../../examples/double-holliday-junction.yaml?raw';
import './styles.css';

const REPOSITORY = 'https://github.com/alvaroestebanperez/molecular-motion';

interface Example { id: string; source: string; definition: MechanismDefinition; proteinVisuals?: ProteinActorVisuals }
/**
 * Presentation choices of this demo, by mechanism and actor id. They are not part of the mechanism
 * files: the proteasome stays one generic complex actor, drawn here as a composed barrel with two caps.
 */
const PROTEIN_VISUALS: Record<string, ProteinActorVisuals> = {
  'p53-mdm2-feedback': { proteasome: COMPOSED_COMPLEX_VISUAL },
};
const EXAMPLES: Example[] = [parpSource, hrSource, egfrSource, p53Source, cgasSource, geneExpressionSource, dhjSource].map(source => {
  const definition = parseMechanism(source);
  return { id: definition.mechanism.id, source, definition, proteinVisuals: PROTEIN_VISUALS[definition.mechanism.id] };
});

// ---- Hash routing ----

type Route = { page: 'mechanism'; id: string } | { page: 'playground' } | { page: 'visual-language' };

function parseRoute(hash: string): Route {
  const [, page, id] = hash.replace(/^#/, '').split('/');
  if (page === 'playground') return { page: 'playground' };
  if (page === 'visual-language' || page === 'vocabulary') return { page: 'visual-language' };
  const example = EXAMPLES.find(item => item.id === id) ?? EXAMPLES[0]!;
  return { page: 'mechanism', id: example.id };
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

// ---- Theme ----

type Theme = 'light' | 'dark';
const THEME_KEY = 'molecular-motion:theme';

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage unavailable */ }
  }, [theme]);
  return [theme, setTheme];
}

// ---- Header ----

function Logo() {
  return <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M9 21 16 9l8 13M9 21h15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="16" cy="8.5" r="4.5" fill="currentColor" /><circle cx="8" cy="22" r="4" fill="currentColor" opacity=".75" /><circle cx="24.5" cy="22.5" r="5" fill="currentColor" opacity=".9" />
  </svg>;
}

function ThemeSwitch({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return <div className="theme-switch" role="group" aria-label="Color theme">
    <button type="button" aria-pressed={theme === 'light'} aria-label="Light theme" onClick={() => onChange('light')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></svg>
    </button>
    <button type="button" aria-pressed={theme === 'dark'} aria-label="Dark theme" onClick={() => onChange('dark')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
    </button>
  </div>;
}

function MechanismSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return EXAMPLES.filter(({ definition }) => !needle || [
      definition.mechanism.name, definition.mechanism.description ?? '', ...definition.actors.map(actor => actor.label ?? actor.id),
    ].some(text => text.toLowerCase().includes(needle)));
  }, [query]);
  const go = (example: Example | undefined) => {
    if (!example) return;
    window.location.hash = `#/mechanisms/${example.id}`;
    setQuery('');
    setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(results.length - 1, index + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); go(results[active]); }
    else if (event.key === 'Escape') setOpen(false);
  };
  return <div className="search">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
    <input
      type="search"
      placeholder="Search mechanisms…"
      value={query}
      role="combobox"
      aria-label="Search mechanisms"
      aria-expanded={open && results.length > 0}
      aria-controls="search-results"
      aria-activedescendant={open && results[active] ? `search-${results[active]!.id}` : undefined}
      onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
      onFocus={() => setOpen(true)}
      onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      onKeyDown={onKeyDown}
    />
    {open && <ul id="search-results" role="listbox" className="search__results">
      {results.length === 0 && <li className="search__empty">No mechanisms match “{query}”</li>}
      {results.map((example, index) => <li
        key={example.id}
        id={`search-${example.id}`}
        role="option"
        aria-selected={index === active}
        onMouseDown={event => { event.preventDefault(); go(example); }}
        onMouseEnter={() => setActive(index)}
      >
        <strong>{example.definition.mechanism.name}</strong>
        <small>{example.definition.steps.length} steps · {example.definition.actors.length} actors</small>
      </li>)}
    </ul>}
  </div>;
}

function Header({ route, theme, onTheme }: { route: Route; theme: Theme; onTheme: (theme: Theme) => void }) {
  return <header className="site-header">
    <a className="brand" href="#/mechanisms"><Logo /><span>Molecular Motion</span></a>
    <nav aria-label="Main">
      <a href="#/mechanisms" aria-current={route.page === 'mechanism' ? 'page' : undefined}>Mechanisms</a>
      <a href="#/visual-language" aria-current={route.page === 'visual-language' ? 'page' : undefined}>Visual language</a>
      <a href="#/playground" aria-current={route.page === 'playground' ? 'page' : undefined}>Playground</a>
      <a href={`${REPOSITORY}#readme`} target="_blank" rel="noreferrer">Documentation</a>
    </nav>
    <div className="site-header__tools">
      <ThemeSwitch theme={theme} onChange={onTheme} />
      <MechanismSearch />
    </div>
  </header>;
}

// ---- Mechanism viewer ----

function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [ref]);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen?.();
  }, [ref]);
  return typeof document !== 'undefined' && document.fullscreenEnabled ? { active, toggle } : undefined;
}

/** Save a Blob under a file name, through a temporary link. */
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Static figure of the current step, in the theme the reader is looking at (no out-of-focus actors). */
function ExportButtons({ snapshot, proteinVisuals, reservation }: { snapshot: MechanismSnapshot; proteinVisuals?: ProteinActorVisuals; reservation?: LayoutReservation }) {
  const [busy, setBusy] = useState(false);
  const file = () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    return { svg: exportSvg(buildSvgScene(snapshot, { proteinVisuals, reservation }), { theme }), name: `${snapshot.definition.mechanism.id}-${snapshot.step.id}` };
  };
  const png = async () => {
    setBusy(true);
    try { const { svg, name } = file(); download(await exportPng(svg), `${name}.png`); } finally { setBusy(false); }
  };
  return <div className="viewer__export" role="group" aria-label="Download this step">
    <button type="button" onClick={() => { const { svg, name } = file(); download(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`); }}>SVG</button>
    <button type="button" onClick={png} disabled={busy} aria-busy={busy}>PNG</button>
  </div>;
}

function MechanismPage({ example }: { example: Example }) {
  useMolecularMotionStyles();
  const player = useMechanismPlayer(example.definition);
  const [selectedActor, setSelectedActor] = useState<string | null>(null);
  const [stepsOpen, setStepsOpen] = useState(true);
  const stageRef = useRef<HTMLElement>(null);
  const fullscreen = useFullscreen(stageRef);
  const { snapshot } = player;
  // The exported figure uses the bands the viewer shows: lanes reserved across the whole mechanism.
  const reservation = useMemo(() => mechanismReservation(player.mechanism), [player.mechanism]);

  useEffect(() => { setSelectedActor(null); }, [player.stepIndex]);
  useEffect(() => { document.title = `${example.definition.mechanism.name} · Molecular Motion`; }, [example]);

  return <main className="viewer">
    <aside className="panel viewer__steps" aria-label="Mechanism steps">
      <div className="viewer__steps-header">
        <h1>{example.definition.mechanism.name}</h1>
        <button type="button" className="collapse" aria-expanded={stepsOpen} aria-controls="step-list" aria-label={stepsOpen ? 'Collapse steps' : 'Expand steps'} onClick={() => setStepsOpen(open => !open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
        </button>
      </div>
      <div id="step-list" hidden={!stepsOpen}><StepTimeline player={player} /></div>
    </aside>

    <section ref={stageRef} className="panel viewer__stage" aria-label="Mechanism visualization">
      <header className="viewer__caption" aria-live="polite">
        <p>Step {player.stepIndex + 1}/{player.length}</p>
        <h2>{snapshot.step.title}</h2>
        {snapshot.step.summary && <span>{snapshot.step.summary}</span>}
        <ExportButtons snapshot={snapshot} proteinVisuals={example.proteinVisuals} reservation={reservation} />
      </header>
      <MechanismStage
        className="viewer__canvas"
        mechanism={player.mechanism}
        stepIndex={player.stepIndex}
        ghosts={player.upcoming}
        proteinVisuals={example.proteinVisuals}
        selectedActor={selectedActor}
        onSelectActor={setSelectedActor}
        onNavigate={direction => { player.setPlaying(false); direction === 1 ? player.next() : player.previous(); }}
      />
      <div className="viewer__controls"><PlaybackControls player={player} fullscreen={fullscreen} /></div>
    </section>

    <aside className="panel viewer__details"><StepDetails player={player} selectedActor={selectedActor} /></aside>

    <section className="viewer__thumbnails" aria-label="All steps"><StepThumbnails player={player} proteinVisuals={example.proteinVisuals} /></section>
  </main>;
}

// ---- Playground ----

function PlaygroundPage() {
  const [source, setSource] = useState(EXAMPLES[0]!.source);
  const [active, setActive] = useState(EXAMPLES[0]!.id);
  const result = useMemo(() => {
    try {
      const definition = parseMechanism(source);
      compileMechanism(definition); // surfaces state-dependent errors (e.g. ligate before cleave) instead of crashing the player
      return { definition, error: null };
    } catch (error) {
      const message = error instanceof MechanismValidationError ? error.issues.join('\n') : String(error);
      return { definition: null, error: message };
    }
  }, [source]);
  useEffect(() => { document.title = 'Playground · Molecular Motion'; }, []);

  return <main className="playground">
    <div className="playground__heading">
      <div>
        <h1>Playground</h1>
        <p>Edit a mechanism in YAML and watch the visualization update.</p>
      </div>
      <div className="segmented" role="group" aria-label="Start from example">
        {EXAMPLES.map(example => <button key={example.id} type="button" aria-pressed={active === example.id} onClick={() => { setActive(example.id); setSource(example.source); }}>
          {example.definition.mechanism.name}
        </button>)}
      </div>
    </div>
    <div className="playground__grid">
      <label className="panel editor">
        <span className="editor__bar"><b>mechanism.yaml</b><i className={result.error ? 'invalid' : ''}>{result.error ? 'Invalid' : 'Valid'}</i></span>
        <textarea value={source} onChange={event => setSource(event.target.value)} spellCheck="false" aria-invalid={Boolean(result.error)} />
      </label>
      <div className="playground__preview">
        {result.definition
          // The same presentation choices as the mechanism pages, by the id of what is being edited.
          ? <MolecularMechanism key={active} definition={result.definition} proteinVisuals={PROTEIN_VISUALS[result.definition.mechanism.id]} />
          : <pre className="panel error" role="alert">{result.error}</pre>}
      </div>
    </div>
  </main>;
}

// ---- Visual vocabulary ----

function VocabularyPage() {
  useMolecularMotionStyles();
  useEffect(() => { document.title = 'Visual language · Molecular Motion'; }, []);
  return <main className="vocabulary-page">
    <header className="vocabulary-page__heading">
      <p>Scientific design system</p>
      <h1>Molecular Motion · Visual Language</h1>
      <span>Programmatic, deterministic SVG primitives for proteins, nucleic acids, molecular states and events. Every scene below is composed from reusable renderer primitives.</span>
    </header>
    <VisualVocabulary />
  </main>;
}

// ---- App ----

function App() {
  const route = useRoute();
  const [theme, setTheme] = useTheme();
  const example = route.page === 'mechanism' ? EXAMPLES.find(item => item.id === route.id)! : undefined;
  return <>
    <a className="skip-link" href="#content">Skip to content</a>
    <Header route={route} theme={theme} onTheme={setTheme} />
    <div id="content">
      {example
        ? <MechanismPage key={example.id} example={example} />
        : route.page === 'visual-language' ? <VocabularyPage /> : <PlaygroundPage />}
    </div>
    <footer className="site-footer">
      <span>Molecular Motion · MIT licensed</span>
      <span>Explanatory models, not clinical decision tools.</span>
    </footer>
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
