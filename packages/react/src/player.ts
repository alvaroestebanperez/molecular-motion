import { useCallback, useEffect, useMemo, useState } from 'react';
import { compileMechanism, type CompiledMechanism, type MechanismDefinition, type MechanismSnapshot } from '@molecular-motion/core';

export interface MechanismPlayerOptions {
  initialStep?: number | string;
  /** Start playing immediately. */
  autoplay?: boolean;
  /** Restart from the first step after the last one. */
  loop?: boolean;
  /** Minimum time on each step while playing (ms); a step's own `duration` takes precedence. */
  stepDuration?: number;
  onStepChange?: (snapshot: MechanismSnapshot) => void;
}

export interface MechanismPlayer {
  mechanism: CompiledMechanism;
  length: number;
  stepIndex: number;
  snapshot: MechanismSnapshot;
  /** Actors that appear in later steps, nearest first; renderers may show them out of focus. */
  upcoming: string[];
  playing: boolean;
  loop: boolean;
  goTo(step: number | string): void;
  next(): void;
  previous(): void;
  reset(): void;
  setPlaying(playing: boolean): void;
  setLoop(loop: boolean): void;
}

/** First step index at which each actor is present and visible. */
export function firstAppearances(mechanism: CompiledMechanism): Map<string, number> {
  const first = new Map<string, number>();
  for (let index = 0; index < mechanism.length; index++) {
    for (const actor of Object.values(mechanism.at(index).actors)) {
      if (actor.present && actor.visible && !first.has(actor.id)) first.set(actor.id, index);
    }
  }
  return first;
}

export function upcomingActors(appearances: Map<string, number>, stepIndex: number, limit = 3): string[] {
  return [...appearances].filter(([, step]) => step > stepIndex).sort((a, b) => a[1] - b[1]).slice(0, limit).map(([id]) => id);
}

/** Playback state for a mechanism, independent of any markup. */
export function useMechanismPlayer(definition: MechanismDefinition, options: MechanismPlayerOptions = {}): MechanismPlayer {
  const { initialStep = 0, autoplay = false, stepDuration = 2600, onStepChange } = options;
  const mechanism = useMemo(() => compileMechanism(definition), [definition]);
  const appearances = useMemo(() => firstAppearances(mechanism), [mechanism]);
  const resolve = useCallback((step: number | string) => {
    const index = typeof step === 'string' ? mechanism.definition.steps.findIndex(item => item.id === step) : step;
    return Math.max(0, Math.min(mechanism.length - 1, index < 0 ? 0 : index));
  }, [mechanism]);

  const [stepIndex, setStepIndex] = useState(() => resolve(initialStep));
  const [playing, setPlaying] = useState(autoplay);
  const [loop, setLoop] = useState(options.loop ?? false);
  const safeIndex = Math.min(stepIndex, mechanism.length - 1);
  const snapshot = mechanism.at(safeIndex);
  const upcoming = useMemo(() => upcomingActors(appearances, safeIndex), [appearances, safeIndex]);

  const goTo = useCallback((step: number | string) => setStepIndex(resolve(step)), [resolve]);
  const next = useCallback(() => setStepIndex(index => Math.min(mechanism.length - 1, index + 1)), [mechanism.length]);
  const previous = useCallback(() => setStepIndex(index => Math.max(0, index - 1)), []);
  const reset = useCallback(() => { setPlaying(false); setStepIndex(0); }, []);

  useEffect(() => { onStepChange?.(snapshot); }, [snapshot, onStepChange]);
  useEffect(() => {
    if (!playing) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const base = snapshot.step.duration ?? Math.max(stepDuration, snapshot.duration + 1200);
    const timer = window.setTimeout(() => {
      if (safeIndex < mechanism.length - 1) setStepIndex(safeIndex + 1);
      else if (loop) setStepIndex(0);
      else setPlaying(false);
    }, reduced ? Math.max(4000, base) : base);
    return () => window.clearTimeout(timer);
  }, [playing, loop, safeIndex, snapshot, stepDuration, mechanism.length]);

  return { mechanism, length: mechanism.length, stepIndex: safeIndex, snapshot, upcoming, playing, loop, goTo, next, previous, reset, setPlaying, setLoop };
}
