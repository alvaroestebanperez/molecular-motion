import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { compileMechanism, type MechanismDefinition, type MechanismSnapshot } from '@molecular-motion/core';
import { buildSvgScene, molecularMotionCss, renderSvg } from '@molecular-motion/svg';

export interface MolecularMechanismProps {
  definition: MechanismDefinition;
  initialStep?: number | string;
  autoplay?: boolean;
  loop?: boolean;
  stepDuration?: number;
  controls?: boolean;
  className?: string;
  style?: CSSProperties;
  onStepChange?: (snapshot: MechanismSnapshot) => void;
  onActorSelect?: (actorId: string | null, snapshot: MechanismSnapshot) => void;
}

export function MolecularMechanism({
  definition,
  initialStep = 0,
  autoplay = false,
  loop = false,
  stepDuration = 2200,
  controls = true,
  className = '',
  style,
  onStepChange,
  onActorSelect,
}: MolecularMechanismProps) {
  const mechanism = useMemo(() => compileMechanism(definition), [definition]);
  const initialIndex = typeof initialStep === 'string'
    ? definition.steps.findIndex(step => step.id === initialStep)
    : initialStep;
  const [stepIndex, setStepIndex] = useState(Math.max(0, Math.min(mechanism.length - 1, initialIndex)));
  const [playing, setPlaying] = useState(autoplay);
  const [selectedActor, setSelectedActor] = useState<string | null>(null);
  const idPrefix = `mm-${useId().replace(/:/g, '')}`;
  const safeStepIndex = Math.min(stepIndex, mechanism.length - 1);
  const snapshot = useMemo(() => mechanism.at(safeStepIndex), [mechanism, safeStepIndex]);
  const scene = useMemo(() => buildSvgScene(snapshot), [snapshot]);
  const markup = useMemo(() => renderSvg(scene, { idPrefix, selectedActor }), [scene, idPrefix, selectedActor]);

  const goTo = useCallback((index: number) => {
    setStepIndex(Math.max(0, Math.min(mechanism.length - 1, index)));
    setSelectedActor(null);
  }, [mechanism.length]);

  useEffect(() => { onStepChange?.(snapshot); }, [snapshot, onStepChange]);
  useEffect(() => {
    if (!playing) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const delay = reduced ? Math.max(3000, stepDuration) : snapshot.step.duration ?? stepDuration;
    const timer = window.setTimeout(() => {
      if (safeStepIndex < mechanism.length - 1) goTo(safeStepIndex + 1);
      else if (loop) goTo(0);
      else setPlaying(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [goTo, loop, mechanism.length, playing, safeStepIndex, snapshot.step.duration, stepDuration]);

  const selectActor = (actorId: string | null) => {
    setSelectedActor(actorId);
    onActorSelect?.(actorId, snapshot);
  };
  const actorFromTarget = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<SVGGElement>('[data-actor]')?.dataset.actor ?? null : null;
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const actor = actorFromTarget(event.target);
    if (actor) selectActor(actor === selectedActor ? null : actor);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const actor = actorFromTarget(event.target);
    if (actor) { event.preventDefault(); selectActor(actor === selectedActor ? null : actor); }
  };
  const selected = selectedActor ? mechanism.definition.actors.find(actor => actor.id === selectedActor) : undefined;

  return <section className={`mm-player ${className}`.trim()} style={style} aria-label={definition.mechanism.name}>
    <style>{molecularMotionCss + playerCss}</style>
    <header className="mm-player__header">
      <p>Molecular mechanism</p>
      <h2>{snapshot.step.title}</h2>
      <div className="mm-player__description" aria-live="polite">{snapshot.step.description}</div>
    </header>
    <div
      className="mm-player__stage"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
    {selected && <aside className="mm-player__details">
      <strong>{selected.label ?? selected.id}</strong>
      {selected.description && <span>{selected.description}</span>}
    </aside>}
    {controls && <footer className="mm-player__controls">
      <div className="mm-player__buttons">
        <button type="button" onClick={() => { setPlaying(false); goTo(safeStepIndex - 1); }} disabled={safeStepIndex === 0} aria-label="Previous step">←</button>
        <button type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause mechanism' : 'Play mechanism'}>{playing ? '❚❚' : '▶'}</button>
        <button type="button" onClick={() => { setPlaying(false); goTo(safeStepIndex + 1); }} disabled={safeStepIndex === mechanism.length - 1} aria-label="Next step">→</button>
      </div>
      <input type="range" min="0" max={mechanism.length - 1} value={safeStepIndex} onChange={event => { setPlaying(false); goTo(Number(event.target.value)); }} aria-label="Mechanism step" aria-valuetext={snapshot.step.title}/>
      <span>{safeStepIndex + 1} / {mechanism.length}</span>
    </footer>}
  </section>;
}

const playerCss = `
.mm-player{overflow:hidden;border:1px solid var(--mm-border,#283142);border-radius:18px;background:var(--mm-surface,#10141d);color:var(--mm-text,#eef2f7);font-family:var(--mm-font,system-ui,sans-serif)}
.mm-player__header{padding:18px 20px 10px}.mm-player__header p{margin:0 0 6px;color:var(--mm-accent,#22d3ee);font:500 11px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}.mm-player__header h2{margin:0;font-size:clamp(20px,3vw,28px)}.mm-player__description{min-height:1.5em;margin-top:6px;color:var(--mm-muted,#94a3b8);font-size:14px}
.mm-player__stage{overflow:auto;background:var(--mm-canvas,#090c13)}.mm-player__stage .mm-svg{min-width:680px}.mm-player__details{display:flex;gap:8px;margin:14px 18px;padding:12px 14px;border-left:2px solid var(--mm-accent,#22d3ee);background:#22d3ee0b;color:var(--mm-muted,#94a3b8);font-size:13px}.mm-player__details strong{color:var(--mm-text,#fff)}
.mm-player__controls{display:grid;grid-template-columns:auto minmax(120px,1fr) auto;align-items:center;gap:14px;padding:14px 16px;border-top:1px solid var(--mm-border,#283142)}.mm-player__buttons{display:flex;gap:6px}.mm-player button{display:grid;place-items:center;min-width:38px;height:38px;border:1px solid var(--mm-border,#283142);border-radius:8px;background:transparent;color:inherit;cursor:pointer}.mm-player button:hover:not(:disabled){border-color:var(--mm-accent,#22d3ee);color:var(--mm-accent,#22d3ee)}.mm-player button:disabled{opacity:.35;cursor:not-allowed}.mm-player input{width:100%;accent-color:var(--mm-accent,#22d3ee)}.mm-player__controls>span{color:var(--mm-muted,#94a3b8);font:500 11px ui-monospace,monospace;white-space:nowrap}
@media(max-width:580px){.mm-player__controls{grid-template-columns:1fr auto}.mm-player__controls input{grid-column:1/-1;grid-row:1}.mm-player__buttons{grid-row:2}.mm-player__controls>span{grid-row:2}}
`;
