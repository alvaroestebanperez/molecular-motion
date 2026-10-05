import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism } from '@molecular-motion/core';
import { parseMechanism } from '@molecular-motion/core/yaml';
import { buildSvgScene, COMPOSED_COMPLEX_VISUAL, renderSvg, type SvgScene } from '../src';
import { actorContactShape, actorParticles, CALLOUT_COST, HELIX, labelBox, labelGeometry, labelLeader } from '../src/scene';
import { firstAppearances, upcomingActors } from '../../react/src/player';
import { insideParticle } from '../src/primitives/protein-geometry';
import { outline } from './contact';

const EXAMPLES = ['homologous-recombination', 'parp1-ssb-repair', 'egfr-dimerization'] as const;
const scenes = (name: string, size: { width?: number; height?: number } = {}) => {
  const mechanism = compileMechanism(parseMechanism(readFileSync(new URL(`../../../examples/${name}.yaml`, import.meta.url), 'utf8')));
  return Array.from({ length: mechanism.length }, (_, index) => buildSvgScene(mechanism.at(index), size));
};
type Box = readonly [number, number, number, number];
const meets = (a: Box, b: Box) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 4 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 4;
const body = (actor: SvgScene['actors'][number]): Box => {
  const points = outline({ ...actorContactShape(actor), margin: 0, x: actor.x, y: actor.y });
  return [Math.min(...points.map(point => point.x)), Math.min(...points.map(point => point.y)), Math.max(...points.map(point => point.x)), Math.max(...points.map(point => point.y))];
};
const leads = (scene: SvgScene) => scene.actors.filter(actor => !actor.ghost && actor.group?.lead !== false);
/** Where the renderer put a lesion's callout text, as a box in canvas coordinates. */
function lesionBoxes(scene: SvgScene): Box[] {
  return [...renderSvg(scene).matchAll(/data-key="lesion:[^"]+" style="transform:translate\(([-\d.]+)px,([-\d.]+)px\)"[^>]*>.*?<text class="mm-callout" x="([-\d.]+)" y="([-\d.]+)"( text-anchor="end")?>([^<]*)</g)].map(match => {
    const [x, y, tx, ty] = match.slice(1, 5).map(Number) as [number, number, number, number];
    const width = match[6]!.length * 7.4;
    const left = match[5] ? x + tx - width : x + tx;
    return [left, y + ty - 13, left + width, y + ty + 4];
  });
}

describe.each(EXAMPLES)('%s: callouts', name => {
  it('never lie on a body or on each other on the wide canvas', () => {
    for (const scene of scenes(name)) {
      const pills = leads(scene).map(actor => ({ actor, box: labelBox(actor) as Box }));
      for (const { actor, box } of pills) {
        for (const other of scene.actors.filter(item => !item.ghost && item !== actor)) expect(meets(box, body(other)), `${scene.title}: ${actor.id} callout on ${other.id}`).toBe(false);
        for (const other of pills) if (other.actor !== actor) expect(meets(box, other.box), `${scene.title}: ${actor.id} callout on ${other.actor.id} callout`).toBe(false);
      }
    }
  });

  it('keep a lesion label off every actor callout', () => {
    for (const scene of scenes(name)) {
      const pills = leads(scene).map(actor => labelBox(actor) as Box);
      for (const lesion of lesionBoxes(scene)) for (const pill of pills) expect(meets(lesion, pill), scene.title).toBe(false);
    }
  });

  it('leave a callout that was already clear exactly where it was', () => {
    for (const scene of scenes(name)) for (const actor of leads(scene)) {
      if (actor.labelLift) continue;
      expect(labelBox(actor)).toEqual(labelBox(actor, actor.labelSide, 0));
    }
  });
});

/** Independent of the layout: does this placement lie on, or does its leader cross, anything it should not? */
function conflicts(scene: SvgScene, actor: SvgScene['actors'][number], side: -1 | 1, lift: number, drop: boolean): number {
  const others = scene.actors.filter(item => !item.ghost && item !== actor);
  const box = labelBox(actor, side, lift, drop) as Box;
  const leader = labelLeader(actor, side, lift, drop);
  const on = (other: SvgScene['actors'][number], point: { x: number; y: number }) => actorContactShape(other).particles.some(p => insideParticle(p, point.x - other.x, point.y - other.y, 1));
  const inside = (target: Box, point: { x: number; y: number }) => point.x > target[0] && point.x < target[2] && point.y > target[1] && point.y < target[3];
  const pills = leads(scene).filter(item => item !== actor).map(item => labelBox(item) as Box);
  const padded: Box = [box[0] - 10, box[1] - 6, box[2] + 10, box[3] + 6];
  const bands = scene.nucleicAcids.map((acid): Box => [0, acid.y - HELIX.amplitude - HELIX.tube, scene.width, acid.y + HELIX.amplitude + HELIX.tube]);
  const membranes = scene.membranes.map((membrane): Box => [0, membrane.y - 24, scene.width, membrane.y + 24]);
  const cross = (a: readonly { x: number; y: number }[], b: readonly { x: number; y: number }[]) => a.some((p, i) => i > 0 && b.some((q, j) => {
    if (j === 0) return false;
    const turn = (o: { x: number; y: number }, u: { x: number; y: number }, v: { x: number; y: number }) => Math.sign((u.x - o.x) * (v.y - o.y) - (u.y - o.y) * (v.x - o.x));
    return turn(a[i - 1]!, p, b[j - 1]!) * turn(a[i - 1]!, p, q) < 0 && turn(b[j - 1]!, q, a[i - 1]!) * turn(b[j - 1]!, q, p) < 0;
  }));
  return others.filter(other => meets(box, body(other))).length
    + pills.filter(pill => meets(padded, pill)).length
    + (drop ? bands.filter(band => meets(box, band)).length : 0)
    + membranes.filter(band => meets(box, band)).length
    + (membranes.some(band => leader.slice(0, -2).some(point => inside(band, point))) ? 1 : 0)
    + (others.some(other => on(other, leader[leader.length - 1]!)) ? 1 : 0)
    + others.filter(other => leader.slice(0, -2).some(point => on(other, point))).length
    + pills.filter(pill => leader.some(point => inside(pill, point))).length
    + leads(scene).filter(item => item !== actor && (cross(leader, labelLeader(item)) || labelLeader(item).slice(0, -1).some(point => inside(box, point)))).length
    + (actor.chain && leader.slice(0, -2).some(point => on(actor, point) && !actorParticles(actor.actor, actor.type, actor.radius, actor.molecule, actor.visual).some(p => insideParticle(p, point.x - actor.x, point.y - actor.y, 1))) ? 1 : 0)
    + (box[0] < 4 || box[2] > scene.width - 4 || box[1] < 4 || box[3] > scene.height - 4 ? 1 : 0);
}

describe.each([...EXAMPLES, 'p53-mdm2-feedback'] as const)('%s: leaders are collision geometry', name => {
  it('no leader crosses another body or another callout unless every place it could go is worse', () => {
    for (const scene of scenes(name)) for (const actor of leads(scene)) {
      const chosen = conflicts(scene, actor, actor.labelSide, actor.labelLift ?? 0, actor.labelDrop ?? false);
      if (chosen === 0) continue;
      const places = ([-1, 1] as const).flatMap(side => [[side, 0, false], [side, 40, false], [side, 80, false], [side, 120, false], [side, 0, true]] as const);
      for (const [side, lift, drop] of places) expect(conflicts(scene, actor, side, lift, drop), `${scene.title}: ${actor.id} had a clear place at ${side}/${lift}/${drop}`).toBeGreaterThan(0);
    }
  });

  it('draws the leader the layout placed', () => {
    for (const scene of scenes(name)) for (const actor of leads(scene)) {
      const { start, mid, end } = labelGeometry(actor);
      const tenth = (value: number) => Math.round(value * 10) / 10;
      expect(renderSvg(scene)).toContain(`<path class="mm-leader" d="M${tenth(start.x)} ${tenth(start.y)}Q${tenth(mid.x)} ${tenth(mid.y)} ${tenth(end.x)} ${tenth(end.y)}"/>`);
    }
  });
});

it('moves a callout only when its usual place is in conflict, and draws it there', () => {
  const moved = EXAMPLES.flatMap(name => scenes(name)).flatMap(scene => leads(scene).filter(actor => actor.labelLift || actor.labelDrop).map(actor => ({ scene, actor })));
  expect(moved.length).toBeGreaterThan(0);
  for (const { scene, actor } of moved) {
    // At its usual height it would lie on something, or its leader would cross something, on either side.
    for (const side of [-1, 1] as const) expect(conflicts(scene, actor, side, 0, false), `${scene.title}: ${actor.id}`).toBeGreaterThan(0);
    const [left, top] = labelBox(actor);
    expect(renderSvg(scene)).toContain(`<rect class="mm-pill" x="${Math.round((left - actor.x) * 10) / 10}" y="${Math.round((top - actor.y) * 10) / 10}"`);
  }
});

// Acceptance cases for a future generic leader-routing system (a waypoint or a different curve).
// Both are recorded in `scene.calloutConflicts` today. They are left open on purpose: neither is to be
// solved with another candidate place or an exception for these actors.
describe('leader routing: open acceptance cases', () => {
  const hard = (name: string, step: string, options = {}) => {
    const mechanism = compileMechanism(parseMechanism(readFileSync(new URL(`../../../examples/${name}.yaml`, import.meta.url), 'utf8')));
    return buildSvgScene(mechanism.at(step), options).calloutConflicts.filter(conflict => conflict.hard > 0);
  };

  it('records them as diagnostics until routing exists', () => {
    expect(hard('homologous-recombination', 'synthesis')).toEqual([expect.objectContaining({ actor: 'pold', kind: 'label' })]);
    expect(hard('p53-mdm2-feedback', 'association', { proteinVisuals: { proteasome: COMPOSED_COMPLEX_VISUAL } })).toEqual([expect.objectContaining({ actor: 'p53-basal', kind: 'chain' })]);
  });

  // HR "Synthesis on the sister chromatid": every place for the Pol δ callout has a conflict, so its leader runs through an RPA ring.
  it.todo('HR synthesis: the Pol δ leader goes around RPA instead of through it');
  // p53 "Proteasome association": the Ub chain callout is squeezed between p53 and the 26S, with part of it covered.
  it.todo('p53 proteasome association: the Ub chain callout clears both p53 and the 26S');
  // Frozen schema v3 HR document, "RAD51 filament formation": the chain callout found a place clear of every body,
  // but it lies on the DNA strand, which chain callouts do not treat as an obstacle. It is not in `calloutConflicts`.
  it.todo('HR v3 filament: the RAD51 chain callout clears the DNA strand');
});

describe('upcoming actors are soft obstacles', () => {
  const ghostScenes = (name: string) => {
    const mechanism = compileMechanism(parseMechanism(readFileSync(new URL(`../../../examples/${name}.yaml`, import.meta.url), 'utf8')));
    const appearances = firstAppearances(mechanism);
    return Array.from({ length: mechanism.length }, (_, index) => ({ plain: buildSvgScene(mechanism.at(index)), ghosted: buildSvgScene(mechanism.at(index), { ghosts: upcomingActors(appearances, index) }) }));
  };

  it('never trade a conflict with something present for one with a ghost', () => {
    for (const name of [...EXAMPLES, 'p53-mdm2-feedback']) for (const { plain, ghosted } of ghostScenes(name)) {
      const hard = (scene: SvgScene) => scene.calloutConflicts.reduce((sum, conflict) => sum + conflict.hard, 0);
      expect(hard(ghosted), ghosted.title).toBeLessThanOrEqual(hard(plain));
    }
  });

  it('records what it could not clear, and a ghost conflict costs less than any hard one', () => {
    expect(CALLOUT_COST.ghost * 8).toBeLessThan(CALLOUT_COST.crossing);
    expect(CALLOUT_COST.crossing).toBeLessThan(CALLOUT_COST.lying);
    const recorded = [...EXAMPLES, 'p53-mdm2-feedback'].flatMap(name => ghostScenes(name)).flatMap(({ ghosted }) => ghosted.calloutConflicts);
    for (const conflict of recorded) expect(conflict.cost).toBeGreaterThan(0);
    // A callout may rest on a ghost when everything else is worse: such conflicts are recorded, not forbidden.
    expect(recorded.some(conflict => conflict.hard === 0 && conflict.ghost > 0)).toBe(true);
  });
});
