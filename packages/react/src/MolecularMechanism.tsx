import type { ProteinActorVisuals } from '@molecular-motion/svg';
import { useState, type CSSProperties } from 'react';
import { instanceDefinition, type MechanismDefinition, type MechanismSnapshot } from '@molecular-motion/core';
import { MechanismStage } from './MechanismStage';
import { useMechanismPlayer } from './player';
import { PlaybackControls } from './ui';

export interface MolecularMechanismProps {
  definition: MechanismDefinition;
  initialStep?: number | string;
  autoplay?: boolean;
  loop?: boolean;
  stepDuration?: number;
  controls?: boolean;
  /** Presentation choice for protein and complex actors, by actor id. Keep the reference stable between renders. */
  proteinVisuals?: ProteinActorVisuals;
  className?: string;
  style?: CSSProperties;
  onStepChange?: (snapshot: MechanismSnapshot) => void;
  onActorSelect?: (actorId: string | null, snapshot: MechanismSnapshot) => void;
}

/** Self-contained player: header, animated stage, and playback controls. */
export function MolecularMechanism({
  definition,
  initialStep,
  autoplay,
  loop,
  stepDuration,
  controls = true,
  proteinVisuals,
  className = '',
  style,
  onStepChange,
  onActorSelect,
}: MolecularMechanismProps) {
  const player = useMechanismPlayer(definition, { initialStep, autoplay, loop, stepDuration, onStepChange });
  const [selectedActor, setSelectedActor] = useState<string | null>(null);
  const { snapshot } = player;
  const selectActor = (actorId: string | null) => {
    setSelectedActor(actorId);
    onActorSelect?.(actorId, snapshot);
  };
  const selected = selectedActor ? instanceDefinition(snapshot.definition, selectedActor) : undefined;

  return <section className={`mm-player ${className}`.trim()} style={style} aria-label={definition.mechanism.name}>
    <header className="mm-player__header" aria-live="polite">
      <p className="mm-player__eyebrow">Step {player.stepIndex + 1}/{player.length}</p>
      <h2>{snapshot.step.title}</h2>
      {(snapshot.step.summary ?? snapshot.step.description) && <p>{snapshot.step.summary ?? snapshot.step.description}</p>}
    </header>
    <MechanismStage
      mechanism={player.mechanism}
      stepIndex={player.stepIndex}
      ghosts={player.upcoming}
      proteinVisuals={proteinVisuals}
      selectedActor={selectedActor}
      onSelectActor={selectActor}
      onNavigate={direction => { player.setPlaying(false); direction === 1 ? player.next() : player.previous(); }}
    />
    {selected && <p className="mm-player__header" role="status"><strong>{selected.label ?? selected.id}</strong>{selected.description && ` — ${selected.description}`}</p>}
    {controls && <PlaybackControls player={player} />}
  </section>;
}
