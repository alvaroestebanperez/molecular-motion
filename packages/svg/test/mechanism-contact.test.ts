import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
import { buildSvgScene, firstContact, PROTEIN_MORPHOLOGIES, proteinGeometry, proteinOutlineWidth, renderSvg, type SvgScene } from '../src';
import { actorContactShape, helixY, HELIX, strandMissingAt, type SceneNucleicAcid } from '../src/scene';
import { outline, outlineDistance, penetration, type Placed } from './contact';

/** Facing outlines of bound partners must meet within this many px... */
const TOUCH = 2;
/** ...and may merge by at most this much (the fit presses 1.5 px so no hairline gap shows). */
const DEPTH = 3;

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const MECHANISMS = ['parp1-ssb-repair', 'homologous-recombination', 'egfr-dimerization'] as const;
const compiled = (name: string) => compileMechanism(parseMechanism(read(`../../../examples/${name}.yaml`)));
const scenes = (name: string) => {
  const mechanism = compiled(name);
  return Array.from({ length: mechanism.length }, (_, index) => buildSvgScene(mechanism.at(index)));
};
/** Resting on a nucleic acid: bound to one of its sites, or occupying it (a span without a site binds the molecule). */
const onAcid = (actor: SvgScene['actors'][number], acid: string) => actor.boundTo === acid || Boolean(actor.boundTo?.startsWith(`${acid}.`));
/** Upper surface of the backbone tubes that are present at `x` (a resected strand is not there to rest on). */
const surface = (acid: SceneNucleicAcid, x: number, width: number) => Math.min(
  ...([0, 1] as const).filter(strand => !strandMissingAt(acid, strand, x)).map(strand => helixY(acid, strand, x, width) - (strand === 0 ? HELIX.tube : HELIX.backTube) / 2),
);
const placed = (actor: SvgScene['actors'][number]): Placed => ({ ...actorContactShape(actor), margin: 0, x: actor.x, y: actor.y });

describe('first contact', () => {
  it.each(PROTEIN_MORPHOLOGIES)('stops a %s partner where the outlines first meet, from any direction', morphology => {
    const radius = 30;
    const a = { particles: proteinGeometry(`fc-a-${morphology}`, radius, 28, morphology), margin: proteinOutlineWidth(radius) };
    const b = { particles: proteinGeometry(`fc-b-${morphology}`, radius, 28, morphology), margin: proteinOutlineWidth(radius) };
    for (const angle of [0, .9, 2.2, Math.PI, -1.4]) {
      const fit = firstContact(a, b, { x: Math.cos(angle), y: Math.sin(angle) });
      const pa = { ...a, x: 0, y: 0 }; const pb = { ...b, ...fit.offset };
      expect(outlineDistance(pa, pb)).toBeLessThanOrEqual(TOUCH);
      expect(penetration(pa, pb)).toBeLessThanOrEqual(DEPTH);
      expect(firstContact(a, b, { x: Math.cos(angle), y: Math.sin(angle) })).toEqual(fit);
    }
  });
});

describe.each(MECHANISMS)('%s: binding reads as physical contact', name => {
  const steps = scenes(name);

  it('every protein–protein binding touches its partner without burying it', () => {
    let checked = 0;
    for (const scene of steps) {
      const byId = new Map(scene.actors.map(actor => [actor.id, actor]));
      for (const actor of scene.actors.filter(item => item.boundTo && byId.has(item.boundTo))) {
        const partner = byId.get(actor.boundTo!)!;
        expect(outlineDistance(placed(partner), placed(actor)), `${scene.title}: ${actor.id}`).toBeLessThanOrEqual(TOUCH);
        expect(penetration(placed(partner), placed(actor)), `${scene.title}: ${actor.id}`).toBeLessThanOrEqual(DEPTH);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('every protein bound to a DNA site rests on the backbone, the first one at the site itself', () => {
    let checked = 0;
    const mechanism = compiled(name);
    steps.forEach((scene, index) => {
      const acid = scene.nucleicAcids[0];
      if (!acid) return;
      const top = (x: number) => surface(acid, x, scene.width);
      const occupancy = Object.values(mechanism.at(index).occupancy);
      const onSite = scene.actors.filter(actor => onAcid(actor, acid.id));
      for (const actor of onSite) {
        // Signed clearance between the actor's outline and the backbone surface below it.
        const clearance = Math.min(...outline(placed(actor)).map(point => top(point.x) - point.y));
        expect(clearance, `${scene.title}: ${actor.id}`).toBeLessThanOrEqual(0);
        expect(clearance, `${scene.title}: ${actor.id}`).toBeGreaterThanOrEqual(-DEPTH);
        checked++;
      }
      // A span occupant touches the DNA within the nucleotides it covers (allowing its outline's edge).
      for (const actor of onSite) {
        const span = occupancy.find(item => item.instance === actor.id)?.span;
        if (!span) continue;
        const contact = scene.connections.find(connection => connection.source === actor.id)!;
        const [x0, x1] = [span.from, span.to].map(coordinate => scene.width * coordinate / acid.length!);
        expect(contact.from.x, `${scene.title}: ${actor.id}`).toBeGreaterThanOrEqual(x0! - TOUCH);
        expect(contact.from.x, `${scene.title}: ${actor.id}`).toBeLessThanOrEqual(x1! + TOUCH);
      }
      const first = onSite.find(actor => !occupancy.find(item => item.instance === actor.id)?.span);
      if (first) {
        const site = acid.sites.find(item => item.reference === first.boundTo)!;
        const contact = scene.connections.find(connection => connection.source === first.id)!;
        // At a resected site it may rest on either overhang, but never beyond the resected stretch.
        const resected = (acid.missing ?? []).filter(range => range.x0 <= site.x && site.x <= range.x1);
        if (resected.length) expect(contact.from.x, `${scene.title}: ${first.id}`).toBeGreaterThanOrEqual(Math.min(...resected.map(range => range.x0)));
        if (resected.length) expect(contact.from.x, `${scene.title}: ${first.id}`).toBeLessThanOrEqual(Math.max(...resected.map(range => range.x1)));
        else expect(Math.abs(contact.from.x - site.x), `${scene.title}: ${first.id}`).toBeLessThanOrEqual(30);
      }
    });
    if (steps.some(scene => scene.nucleicAcids.length)) expect(checked).toBeGreaterThan(0);
  });

  it('actors docked to another actor never sink into the DNA', () => {
    for (const scene of steps) {
      const acid = scene.nucleicAcids[0];
      if (!acid) continue;
      const top = (x: number) => surface(acid, x, scene.width);
      for (const actor of scene.actors.filter(item => !item.ghost && !onAcid(item, acid.id))) {
        expect(Math.min(...outline(placed(actor)).map(point => top(point.x) - point.y)), `${scene.title}: ${actor.id}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('no dashed connection stands in for contact', () => {
    for (const scene of steps) {
      const bound = scene.actors.filter(actor => !actor.ghost && actor.boundTo);
      expect(scene.connections.map(connection => connection.kind)).toEqual(bound.map(() => 'contact'));
      const svg = renderSvg(scene);
      expect(svg).not.toContain('mm-binding--relation');
      expect(svg).not.toMatch(/<path data-interaction=/);
      for (const actor of bound) expect(svg).toContain(`data-key="connection:${actor.id}:${actor.boundTo}"`);
    }
  });

  it('is deterministic and keeps actors steady between steps', () => {
    const again = scenes(name);
    steps.forEach((scene, index) => expect(renderSvg(again[index]!)).toBe(renderSvg(scene)));
    const shape = (scene: SvgScene) => JSON.stringify(scene.nucleicAcids.map(acid => [acid.missing, acid.open]));
    for (let index = 1; index < steps.length; index++) {
      const before = new Map(steps[index - 1]!.actors.filter(actor => !actor.ghost).map(actor => [actor.id, actor]));
      // Resection or unwinding reshapes the backbone, so actors resting on it may settle with it.
      const reshaped = shape(steps[index - 1]!) !== shape(steps[index]!);
      // Actors travel with what they rest on: once an actor moves, those docked on it may move too.
      const moved = new Set<string>();
      const now = steps[index]!.actors.filter(item => !item.ghost);
      for (let grew = true; grew;) {
        grew = false;
        for (const actor of now) {
          const previous = before.get(actor.id);
          const carried = actor.boundTo !== undefined && moved.has(actor.boundTo.split('.')[0]!);
          // New, rebound, or carried along by a partner that moved.
          if (!moved.has(actor.id) && (!previous || previous.boundTo !== actor.boundTo || carried)) { moved.add(actor.id); grew = true; }
        }
      }
      for (const actor of now) {
        const previous = before.get(actor.id);
        // An actor whose binding (and footing) did not change, and whose partner stayed, stays where it was.
        if (previous && previous.boundTo === actor.boundTo && !reshaped && !moved.has(actor.id)) expect(Math.hypot(actor.x - previous.x, actor.y - previous.y), `${actor.id} step ${index + 1}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
