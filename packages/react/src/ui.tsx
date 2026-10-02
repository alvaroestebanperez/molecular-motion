import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { actorInstances, partnersOf, type MechanismSnapshot, type ReferenceDefinition } from '@molecular-motion/core';
import { LESION_LABELS } from '@molecular-motion/svg';
import { ExitFullscreenIcon, ExternalIcon, FullscreenIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, ResetIcon } from './icons';
import { MechanismThumbnail } from './MechanismStage';
import type { MechanismPlayer } from './player';

// ---- Playback ----

export interface PlaybackControlsProps {
  player: MechanismPlayer;
  /** Shows a fullscreen button when provided. */
  fullscreen?: { active: boolean; toggle(): void };
}

export function PlaybackControls({ player, fullscreen }: PlaybackControlsProps) {
  const { stepIndex, length, playing, loop, mechanism } = player;
  const play = () => {
    if (!playing && stepIndex === length - 1 && !loop) player.goTo(0);
    player.setPlaying(!playing);
  };
  const toggleAuto = () => {
    player.setLoop(!loop);
    player.setPlaying(!loop);
  };
  return <div className="mm-controls">
    <button type="button" className="mm-controls__play" onClick={play} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <PauseIcon /> : <PlayIcon />}</button>
    <button type="button" className="mm-icon-button" onClick={() => { player.setPlaying(false); player.previous(); }} disabled={stepIndex === 0} aria-label="Previous step"><PreviousIcon /></button>
    <button type="button" className="mm-icon-button" onClick={() => { player.setPlaying(false); player.next(); }} disabled={stepIndex === length - 1} aria-label="Next step"><NextIcon /></button>
    <div className="mm-scrubber">
      <span className="mm-scrubber__count" aria-hidden="true">{stepIndex + 1} / {length}</span>
      <ol className="mm-scrubber__track" aria-label="Steps">
        {mechanism.definition.steps.map((step, index) => <li key={step.id}>
          <button
            type="button"
            className={index === stepIndex ? 'is-active' : index < stepIndex ? 'is-past' : ''}
            aria-label={`Step ${index + 1}: ${step.title}`}
            aria-current={index === stepIndex ? 'step' : undefined}
            onClick={() => { player.setPlaying(false); player.goTo(index); }}
          />
        </li>)}
      </ol>
    </div>
    <label className="mm-switch">
      <span>Auto-play</span>
      <input type="checkbox" role="switch" checked={loop} onChange={toggleAuto} />
      <i aria-hidden="true" />
    </label>
    <button type="button" className="mm-icon-button" onClick={() => { player.reset(); if (loop) player.setPlaying(true); }} aria-label="Reset to first step"><ResetIcon /></button>
    {fullscreen && <button type="button" className="mm-icon-button" onClick={fullscreen.toggle} aria-label={fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}>
      {fullscreen.active ? <ExitFullscreenIcon /> : <FullscreenIcon />}
    </button>}
  </div>;
}

// ---- Timeline ----

export function StepTimeline({ player }: { player: MechanismPlayer }) {
  return <ol className="mm-timeline">
    {player.mechanism.definition.steps.map((step, index) => <li key={step.id}>
      <button
        type="button"
        className={`mm-timeline__step${index === player.stepIndex ? ' is-active' : ''}${index < player.stepIndex ? ' is-past' : ''}`}
        aria-current={index === player.stepIndex ? 'step' : undefined}
        onClick={() => { player.setPlaying(false); player.goTo(index); }}
      >
        <span className="mm-timeline__number">{index + 1}</span>
        <span className="mm-timeline__text">
          <strong>{step.title}</strong>
          {step.summary && <small>{step.summary}</small>}
        </span>
      </button>
    </li>)}
  </ol>;
}

// ---- Thumbnails ----

export function StepThumbnails({ player }: { player: MechanismPlayer }) {
  return <ol className="mm-thumbnails" aria-label="Step overview">
    {player.mechanism.definition.steps.map((step, index) => <li key={step.id}>
      <button
        type="button"
        className={`mm-thumbnail${index === player.stepIndex ? ' is-active' : ''}`}
        aria-current={index === player.stepIndex ? 'step' : undefined}
        aria-label={`Step ${index + 1}: ${step.title}`}
        onClick={() => { player.setPlaying(false); player.goTo(index); }}
      >
        <span className="mm-thumbnail__title"><span className="mm-thumbnail__number">{index + 1}</span>{step.title}</span>
        <MechanismThumbnail mechanism={player.mechanism} stepIndex={index} />
      </button>
    </li>)}
  </ol>;
}

// ---- Details ----

type Tab = 'explanation' | 'details' | 'references';
const TABS: [Tab, string][] = [['explanation', 'Explanation'], ['details', 'Molecular details'], ['references', 'References']];

export function StepDetails({ player, selectedActor }: { player: MechanismPlayer; selectedActor?: string | null }) {
  const [tab, setTab] = useState<Tab>('explanation');
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { snapshot } = player;
  const references = resolveReferences(snapshot, snapshot.step.references ?? []);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!offset) return;
    event.preventDefault();
    const nextIndex = (index + offset + TABS.length) % TABS.length;
    setTab(TABS[nextIndex]![0]);
    tabRefs.current[nextIndex]?.focus();
  };

  return <section className="mm-details" aria-label="Step information">
    <div className="mm-tabs" role="tablist">
      {TABS.map(([key, label], index) => <button
        key={key}
        ref={element => { tabRefs.current[index] = element; }}
        type="button"
        role="tab"
        id={`${id}-${key}-tab`}
        aria-selected={tab === key}
        aria-controls={`${id}-${key}`}
        tabIndex={tab === key ? 0 : -1}
        onClick={() => setTab(key)}
        onKeyDown={event => onKeyDown(event, index)}
      >{label}</button>)}
    </div>
    <div className="mm-tabpanel" role="tabpanel" id={`${id}-${tab}`} aria-labelledby={`${id}-${tab}-tab`} tabIndex={0}>
      {tab === 'explanation' && <>
        {snapshot.step.description ? <p className="mm-prose">{snapshot.step.description}</p> : <p className="mm-empty">No explanation for this step yet.</p>}
        {!!snapshot.step.keyEvents?.length && <div className="mm-events">
          <h3>Key events</h3>
          <ol>{snapshot.step.keyEvents.map((event, index) => <li key={index}><span>{index + 1}</span>{event}</li>)}</ol>
        </div>}
        {references.length > 0 && <>
          <h3 className="mm-subheading">References</h3>
          <ReferenceList references={references} compact />
        </>}
      </>}
      {tab === 'details' && <MolecularDetails snapshot={snapshot} selectedActor={selectedActor} />}
      {tab === 'references' && <>
        <h3 className="mm-subheading">This step</h3>
        {references.length ? <ReferenceList references={references} /> : <p className="mm-empty">No references for this step.</p>}
        {!!snapshot.definition.mechanism.references?.length && <>
          <h3 className="mm-subheading">Mechanism</h3>
          <ReferenceList references={resolveReferences(snapshot, snapshot.definition.mechanism.references)} />
        </>}
      </>}
    </div>
  </section>;
}

function resolveReferences(snapshot: MechanismSnapshot, ids: readonly string[]): ReferenceDefinition[] {
  const byId = new Map(snapshot.definition.references.map(reference => [reference.id, reference]));
  return ids.flatMap(id => byId.get(id) ?? []);
}

const link = (href: string, children: ReactNode) =>
  <a href={href} target="_blank" rel="noreferrer">{children}<ExternalIcon /></a>;

export function ReferenceList({ references, compact = false }: { references: ReferenceDefinition[]; compact?: boolean }) {
  return <ol className={`mm-references${compact ? ' mm-references--compact' : ''}`}>
    {references.map((reference, index) => <li key={reference.id}>
      <span className="mm-references__index">{index + 1}</span>
      <div>
        <div className="mm-references__ids">
          {reference.pmid && link(`https://pubmed.ncbi.nlm.nih.gov/${reference.pmid}/`, `PMID: ${reference.pmid}`)}
          {reference.reactome && link(`https://reactome.org/content/detail/${reference.reactome}`, `Reactome: ${reference.reactome}`)}
          {reference.doi && (!compact || !reference.pmid) && link(`https://doi.org/${reference.doi}`, `DOI: ${reference.doi}`)}
          {reference.url && !reference.pmid && !reference.doi && !reference.reactome && link(reference.url, new URL(reference.url).hostname)}
        </div>
        {reference.citation && <cite>{reference.citation}</cite>}
      </div>
    </li>)}
  </ol>;
}

function MolecularDetails({ snapshot, selectedActor }: { snapshot: MechanismSnapshot; selectedActor?: string | null }) {
  // One entry per instance; copies are told apart by their number ("RAD51 #3").
  const instances = actorInstances(snapshot.definition).map(({ id, actor }) => ({ id, definition: actor, label: `${actor.label ?? actor.id}${id === actor.id ? '' : ` ${id.slice(actor.id.length)}`}` }));
  const labels = new Map(instances.map(instance => [instance.id, instance.label]));
  const compartments = new Map(snapshot.definition.compartments.map(compartment => [compartment.id, compartment.label ?? compartment.id]));
  const describeTarget = (reference: string) => {
    const [actor, site] = reference.split('.');
    return site ? `${labels.get(actor!)} (${site})` : labels.get(actor!) ?? reference;
  };
  const shown = instances.filter(instance => snapshot.actors[instance.id]!.present && snapshot.actors[instance.id]!.visible);
  const lesions = Object.entries(snapshot.sites).filter(([, site]) => site.lesion);
  return <>
    <ul className="mm-actors">
      {shown.map(({ id, definition, label }) => {
        const state = snapshot.actors[id]!;
        const facts = [
          state.activity && <span key="a" className={`mm-chip mm-chip--${state.activity.state}`}>{state.activity.state}</span>,
          ...partnersOf(snapshot, id).map(partner => <span key={`b:${partner.id}`} className="mm-chip">bound to {describeTarget(partner.reference)}</span>),
          ...state.modifications.map(modification => <span key={modification.id} className="mm-chip">{modification.label}{modification.site ? ` @ ${modification.site}` : ''}{modification.length ? ` ×${modification.length}` : ''}</span>),
          state.compartment && <span key="c" className="mm-chip mm-chip--muted">{compartments.get(state.compartment) ?? state.compartment}</span>,
        ].filter(Boolean);
        return <li key={id} className={selectedActor === id ? 'is-selected' : ''} style={{ ['--mm-actor' as string]: definition.color ?? 'var(--mm-accent)' }}>
          <strong><i aria-hidden="true" />{label}</strong>
          {definition.description && <p>{definition.description}</p>}
          {facts.length > 0 && <div className="mm-chips">{facts}</div>}
        </li>;
      })}
    </ul>
    {lesions.length > 0 && <>
      <h3 className="mm-subheading">DNA state</h3>
      <ul className="mm-plain">{lesions.map(([reference, site]) => <li key={reference}><span className="mm-chip mm-chip--alert">{LESION_LABELS[site.lesion!]}</span> at {describeTarget(reference)}</li>)}</ul>
    </>}
  </>;
}
