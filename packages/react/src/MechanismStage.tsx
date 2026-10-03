import { useEffect, useId, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { CompiledMechanism } from '@molecular-motion/core';
import { buildSvgScene, geometryFrame, molecularMotionCss, nucleicLayerMarkup, renderSvg, type GeometryFrame } from '@molecular-motion/svg';
import { animateGeometry, motionTiming, NUCLEIC_LAYERS, type GeometryAnimation } from './animate';
import { patchSvg } from './patch';
import { uiCss } from './styles';

/** Inject the renderer and UI styles once per document. */
export function useMolecularMotionStyles() {
  useInsertionEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('molecular-motion-styles')) return;
    const style = document.createElement('style');
    style.id = 'molecular-motion-styles';
    style.textContent = molecularMotionCss + uiCss;
    document.head.appendChild(style);
  }, []);
}

/** Below this container width the scene is laid out on a squarer canvas so labels stay legible. */
const NARROW = 620;

export interface MechanismStageProps {
  mechanism: CompiledMechanism;
  stepIndex: number;
  /** Actors to draw out of focus (e.g. `player.upcoming`). */
  ghosts?: readonly string[];
  selectedActor?: string | null;
  onSelectActor?: (actorId: string | null) => void;
  /** Called for ←/→ while the stage has focus. */
  onNavigate?: (direction: -1 | 1) => void;
  className?: string;
}

/** Animated, interactive SVG view of one step. Consecutive steps morph instead of re-rendering. */
export function MechanismStage({ mechanism, stepIndex, ghosts, selectedActor = null, onSelectActor, onNavigate, className = '' }: MechanismStageProps) {
  useMolecularMotionStyles();
  const ref = useRef<HTMLDivElement>(null);
  const idPrefix = `mm${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setNarrow((entry?.contentRect.width ?? Infinity) < NARROW));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scene = useMemo(() => {
    const size = narrow ? { width: 640, height: 620 } : {};
    return buildSvgScene(mechanism.at(stepIndex), { ...size, ghosts });
  }, [mechanism, stepIndex, ghosts, narrow]);
  const markup = useMemo(() => renderSvg(scene, { idPrefix, selectedActor }), [scene, idPrefix, selectedActor]);

  // The geometry on screen, and the transition drawing it if one is running (ADR 0001). Everything but
  // the nucleic layers is patched at once and moves by CSS; those layers are animated from what is
  // shown to the new step, and settled with a full patch when they arrive.
  const shown = useRef<{ frame: GeometryFrame; size: string } | null>(null);
  const running = useRef<GeometryAnimation | null>(null);
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const target = geometryFrame(scene);
    const size = `${scene.width}×${scene.height}`;
    const origin = running.current?.frame() ?? shown.current?.frame;
    running.current?.cancel();
    running.current = null;
    const svg = container.firstElementChild;
    const timing = svg && origin && shown.current?.size === size ? motionTiming(svg) : undefined;
    const changes = origin && timing?.duration && JSON.stringify(nucleicLayerMarkup(origin, idPrefix)) !== JSON.stringify(nucleicLayerMarkup(target, idPrefix));
    if (!svg || !origin || !timing || !changes) {
      patchSvg(container, markup);
      shown.current = { frame: target, size };
      return;
    }
    patchSvg(container, markup, { keep: NUCLEIC_LAYERS });
    shown.current = { frame: origin, size };
    running.current = animateGeometry(svg, origin, target, idPrefix, timing, () => {
      running.current = null;
      shown.current = { frame: target, size };
      patchSvg(container, markup);
    });
  }, [scene, markup, idPrefix]);
  useEffect(() => () => running.current?.cancel(), []);

  const actorFrom = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<SVGGElement>('[data-actor][role=button]')?.dataset.actor ?? null : null;
  const toggle = (actor: string | null) => onSelectActor?.(actor && actor === selectedActor ? null : actor);
  const handleClick = (event: MouseEvent) => toggle(actorFrom(event.target));
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      onNavigate?.(event.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (event.key === 'Escape') { onSelectActor?.(null); return; }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const actor = actorFrom(event.target);
    if (actor) { event.preventDefault(); toggle(actor); }
  };

  return <div
    ref={ref}
    className={`mm-stage ${className}`.trim()}
    tabIndex={onNavigate ? 0 : undefined}
    aria-roledescription={onNavigate ? 'mechanism viewer' : undefined}
    aria-keyshortcuts={onNavigate ? 'ArrowLeft ArrowRight' : undefined}
    onClick={handleClick}
    onKeyDown={handleKeyDown}
  />;
}

export interface MechanismThumbnailProps {
  mechanism: CompiledMechanism;
  stepIndex: number;
}

/** Static, non-interactive miniature of a step. */
export function MechanismThumbnail({ mechanism, stepIndex }: MechanismThumbnailProps) {
  useMolecularMotionStyles();
  const idPrefix = `mmt${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const markup = useMemo(
    () => renderSvg(buildSvgScene(mechanism.at(stepIndex)), { idPrefix, compact: true }),
    [mechanism, stepIndex, idPrefix],
  );
  return <div className="mm-thumbnail__art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}
