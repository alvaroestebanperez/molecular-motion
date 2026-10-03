import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
import { buildSvgScene, renderSvg, type SvgScene } from '../src';
import { actorContactShape, labelBox } from '../src/scene';
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

it('lifts a callout only when neither side is free, and draws it there', () => {
  const lifted = EXAMPLES.flatMap(name => scenes(name)).flatMap(scene => leads(scene).filter(actor => actor.labelLift).map(actor => ({ scene, actor })));
  expect(lifted.length).toBeGreaterThan(0);
  for (const { scene, actor } of lifted) {
    const others = scene.actors.filter(item => !item.ghost && item !== actor).map(body);
    // At its usual height it would lie on something, on either side.
    for (const side of [-1, 1] as const) expect(others.some(other => meets(labelBox(actor, side, 0) as Box, other)) || labelBox(actor, side, 0)[0] < 4 || labelBox(actor, side, 0)[2] > scene.width - 4).toBe(true);
    const [left, top] = labelBox(actor);
    expect(renderSvg(scene)).toContain(`<rect class="mm-pill" x="${Math.round((left - actor.x) * 10) / 10}" y="${Math.round((top - actor.y) * 10) / 10}"`);
  }
});
