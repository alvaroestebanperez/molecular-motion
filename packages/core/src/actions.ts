import {
  addInteraction, addOccupancy, boundTo, detachAnonymous, interactionId, interfaceUse, occupancyId, partnersOf, releaseAll,
} from './bindings';
import { coveredIntervals, defaultStrand, occupantForm, placeOccupancy, requireOccupantsFit } from './occupancy';
import { addPairing, alignedSpan, alignmentRelates, brokenPairings, pairingConflicts, partnerOf, removePairings } from './pairings';
import { actorIdOf, instanceDefinition } from './instances';
import { addInterval, intervalAt, normalizeIntervals, overlapsInterval, subtractInterval, type Interval } from './intervals';
import {
  excisedOf, extantIntervals, extantLength, extantRun, insideExcised, isNucleicActor, junctionAt, lesionStrands, nucleicForm, nucleicLength, otherStrand,
  readNucleicState, siteInterval, strandIntervals, withStrandIntervals, writeNucleicState,
} from './nucleic';
import { ActionRegistry, defineAlias, definePrimitive, field, type ApplyContext } from './registry';
import type {
  ActionSpec, Activity, ActorDefinition, ActorSite, InteractionEnd, LesionType, MechanismDefinition, MechanismState, NucleicState, Orientation, SiteStrand, StrandId, StrandSpan,
} from './types';

export const ACTIVITIES: readonly Activity[] = ['active', 'inactive', 'inhibited'];
export const LESIONS: readonly LesionType[] = ['single-strand-break', 'nick', 'double-strand-break', 'base-damage', 'abasic-site', 'adduct'];
const BREAKS: readonly LesionType[] = ['single-strand-break', 'nick', 'double-strand-break'];

const actorOf = (reference: string) => reference.split('.')[0]!;
const timing = ({ by, duration }: ActionSpec) => ({ by, duration });

// ---- Primitives ----

interface BindAction extends ActionSpec { actor: string; target: string; interface?: string; targetInterface?: string }
export const bind = definePrimitive<BindAction>({
  type: 'bind',
  description: 'Bind an instance to another instance (an interaction) or rest it on a nucleic acid (an occupancy).',
  fields: {
    actor: field.actor({ required: true }),
    target: field.reference({ required: true }),
    interface: field.string({ description: 'Interface of the actor used for this binding. Without one the binding is the anonymous legacy attachment, replaced by the next anonymous bind.' }),
    targetInterface: field.string({ description: 'Interface of the target used for this binding.' }),
  },
  presentation: { verb: 'binds' },
  validate(action, ctx) {
    if (actorOf(action.target) === action.actor) ctx.issue('an actor cannot bind itself');
    const target = instanceDefinition(ctx.definition, actorOf(action.target));
    if (target && isNucleicActor(target) && (action.interface || action.targetInterface)) {
      ctx.issue(`binding a nucleic acid is an occupancy, which has no interfaces ("${action.target}")`);
    }
    requireInterface(action.actor, action.interface, ctx);
    requireInterface(actorOf(action.target), action.targetInterface, ctx);
  },
  apply(state, action, ctx) {
    const actor = ctx.requirePresent(action.actor);
    const [targetInstance, site] = action.target.split('.') as [string, string | undefined];
    ctx.requirePresent(targetInstance);
    actor.visible = true;
    if (isNucleicActor(instanceDefinition(ctx.definition, targetInstance)!)) {
      requireExtantSite(state, ctx, action.target);
      if (state.occupancy[occupancyId(actor.id, targetInstance)]?.span) ctx.fail(`"${actor.id}" already occupies ${targetInstance}; vacate it first`);
      detachAnonymous(state, actor.id);
      addOccupancy(state, actor.id, targetInstance, site);
      return;
    }
    if (!action.interface) detachAnonymous(state, actor.id);
    const ends: [InteractionEnd, InteractionEnd] = [
      { instance: actor.id, ...(action.interface && { interface: action.interface }) },
      { instance: targetInstance, ...(site && { site }), ...(action.targetInterface && { interface: action.targetInterface }) },
    ];
    // Interface ends are strict: a full interface fails instead of silently dropping a partner.
    for (const end of ends) if (end.interface) requireFreeInterface(state, ctx, end.instance, end.interface);
    const symmetric = Boolean(action.interface) && action.interface === action.targetInterface && actorIdOf(actor.id) === actorIdOf(targetInstance);
    if (state.interactions[interactionId(ends, symmetric)]) ctx.fail(`"${actor.id}" is already bound to "${action.target}" this way`);
    addInteraction(state, ends, symmetric);
  },
});

interface UnbindAction extends ActionSpec { actor: string; target?: string; interface?: string }
export const unbind = definePrimitive<UnbindAction>({
  type: 'unbind',
  description: 'Release bindings of an instance: its anonymous attachment, or those to a given target or through a given interface.',
  fields: {
    actor: field.actor({ required: true }),
    target: field.reference({ description: 'Release only bindings to this instance, site or nucleic acid.' }),
    interface: field.string({ description: 'Release only bindings through this interface of the actor.' }),
  },
  presentation: { verb: 'releases' },
  validate(action, ctx) { requireInterface(action.actor, action.interface, ctx); },
  apply(state, action, ctx) {
    // Without a target or interface this is v3's unbind: drop the single attachment, if any.
    if (!action.target && !action.interface) { detachAnonymous(state, action.actor); return; }
    const matches = partnersOf(state, action.actor).filter(partner =>
      (!action.target || partner.reference === action.target || (partner.via === 'occupancy' && partner.reference.split('.')[0] === action.target))
      && (!action.interface || partner.interface === action.interface));
    if (!matches.length) ctx.fail(`"${action.actor}" is not bound${action.target ? ` to "${action.target}"` : ''}${action.interface ? ` through "${action.interface}"` : ''}`);
    for (const match of matches) delete (match.via === 'interaction' ? state.interactions : state.occupancy)[match.id];
  },
});

// ---- Occupancy (RFC 0005 §5): instances claiming nucleotides on a nucleic acid ----

/** Static checks shared by occupy and coat: the target is a nucleic acid, optionally one of its sites. */
function requireOccupancyTarget(target: string, ctx: { definition: MechanismDefinition; issue(message: string): void }) {
  const acid = instanceDefinition(ctx.definition, actorOf(target));
  if (acid && !isNucleicActor(acid)) ctx.issue(`"${acid.id}" is not a nucleic acid; bind to it instead`);
}

/** The molecule, its optional site and its length, for an occupancy target `acid` or `acid.site`. */
function occupancyTarget(target: string, ctx: ApplyContext) {
  const [acidId, siteId] = target.split('.') as [string, string | undefined];
  ctx.requirePresent(acidId);
  const acid = instanceDefinition(ctx.definition, acidId)!;
  return { acid: acidId, site: siteId ? acid.sites!.find(item => item.id === siteId)! : undefined, length: nucleicLength(acid) };
}

interface OccupyAction extends ActionSpec { actor: string; target: string; span?: [number, number]; strand?: SiteStrand; orientation?: Orientation }
export const occupy = definePrimitive<OccupyAction>({
  type: 'occupy',
  description: 'Rest one instance on a nucleic acid, covering a span of nucleotides on a strand.',
  fields: {
    actor: field.actor({ required: true }),
    target: field.reference({ required: true, description: 'The nucleic acid, or one of its sites; a span site gives the span, a point site anchors the footprint.' }),
    span: field.interval({ description: 'Nucleotides covered, overriding the site and the footprint length.' }),
    strand: field.enum(['top', 'bottom', 'both'], { description: 'Defaults to the strand the footprint form allows.' }),
    orientation: field.enum(['forward', 'reverse'], { description: 'Relative to top 5′→3′. At a point site, forward covers [at, at + length), reverse [at − length, at).' }),
  },
  presentation: { verb: 'occupies' },
  validate(action, ctx) {
    requireOccupancyTarget(action.target, ctx);
    const actor = instanceDefinition(ctx.definition, action.actor);
    const site = locate(action.target, ctx.definition)?.site;
    if (!action.span && !site?.span && !actor?.footprint) ctx.issue(`"${action.actor}" has no footprint: give a span, or a site with a span`);
    if (!action.span && site && !siteInterval(site)) ctx.issue(`site "${action.target}" has no coordinate; a position is layout only`);
    if (!action.span && !site) ctx.issue('name a site or give a span: a whole molecule is not a span');
  },
  apply(state, action, ctx) {
    const actor = ctx.requirePresent(action.actor);
    const { acid, site } = occupancyTarget(action.target, ctx);
    if (state.occupancy[occupancyId(actor.id, acid)]) ctx.fail(`"${actor.id}" is already on ${acid}; vacate it first`);
    const footprint = instanceDefinition(ctx.definition, actor.id)!.footprint;
    const excised = excisedOf(state.actors[acid]);
    requireExtantSite(state, ctx, action.target);
    // A footprint counts extant nucleotides (RFC 0007 §6.2): anchored at a point it follows covalent order across a junction.
    let span: { from: number; to: number };
    if (action.span) span = extantHull(state, ctx, acid, { from: action.span[0], to: action.span[1] });
    else if (site!.span) span = extantHull(state, ctx, acid, { from: site!.span[0], to: site!.span[1] });
    else span = extantRun(excised, site!.at!, footprint!.length, action.orientation);
    const covered = extantLength(excised, span);
    if (!action.span && footprint && covered !== footprint.length) {
      ctx.fail(`"${actor.id}" covers ${footprint.length} nt but "${action.target}" spans ${covered}; give a span, or use coat for several copies`);
    }
    const strand = action.strand ?? defaultStrand(state, ctx.definition, acid, span, occupantForm(ctx, actor.id), ctx.fail);
    placeOccupancy(state, ctx, {
      id: occupancyId(actor.id, acid), instance: actor.id, acid, ...(site && { site: site.id }), span, strand,
      ...(action.orientation && { orientation: action.orientation }),
    });
    actor.visible = true;
  },
});

interface CoatAction extends ActionSpec { actors: string[]; target: string; span?: [number, number]; strand?: SiteStrand; orientation?: Orientation }
export const coat = definePrimitive<CoatAction>({
  type: 'coat',
  description: 'Place the listed instances side by side along a span, each covering its footprint, from one end.',
  fields: {
    actors: field.actors({ required: true, description: 'Instances in placement order. Only these are placed: nothing picks free copies.' }),
    target: field.reference({ required: true, description: 'The nucleic acid, or a site with a span.' }),
    span: field.interval({ description: 'Span to coat, overriding the site.' }),
    strand: field.enum(['top', 'bottom', 'both'], { description: 'Defaults to the strand the footprint form allows.' }),
    orientation: field.enum(['forward', 'reverse'], { description: 'Forward fills from the span start towards increasing coordinates, reverse from its end.' }),
  },
  presentation: { verb: 'coats' },
  validate(action, ctx) {
    requireOccupancyTarget(action.target, ctx);
    if (!action.span && !locate(action.target, ctx.definition)?.site.span) ctx.issue('coat needs a span: a site with a span, or span');
    for (const instance of action.actors) {
      if (instanceDefinition(ctx.definition, instance) && !instanceDefinition(ctx.definition, instance)!.footprint) ctx.issue(`"${instance}" has no footprint to coat with`);
    }
  },
  apply(state, action, ctx) {
    const { acid, site } = occupancyTarget(action.target, ctx);
    const excised = excisedOf(state.actors[acid]);
    requireExtantSite(state, ctx, action.target);
    const span = extantHull(state, ctx, acid, action.span ? { from: action.span[0], to: action.span[1] } : { from: site!.span![0], to: site!.span![1] });
    const sizes = action.actors.map(instance => instanceDefinition(ctx.definition, instance)!.footprint!.length);
    const total = sizes.reduce((sum, size) => sum + size, 0);
    const room = extantLength(excised, span);
    if (total > room) ctx.fail(`${action.actors.length} instances need ${total} nt but ${acid} ${span.from}–${span.to} has ${room}`);
    let cursor = action.orientation === 'reverse' ? span.to : span.from;
    action.actors.forEach((instance, index) => {
      const actor = ctx.requirePresent(instance);
      if (state.occupancy[occupancyId(instance, acid)]) ctx.fail(`"${instance}" is already on ${acid}; vacate it first`);
      const size = sizes[index]!;
      // Side by side along the covalent order: a copy that meets a junction continues on its other flank.
      const covered = extantRun(excised, cursor, size, action.orientation);
      cursor = action.orientation === 'reverse' ? covered.from : covered.to;
      const strand = action.strand ?? defaultStrand(state, ctx.definition, acid, covered, occupantForm(ctx, instance), ctx.fail);
      placeOccupancy(state, ctx, {
        id: occupancyId(instance, acid), instance, acid, ...(site && { site: site.id }), span: covered, strand,
        ...(action.orientation && { orientation: action.orientation }),
      });
      actor.visible = true;
    });
  },
});

interface VacateAction extends ActionSpec { actor: string; target?: string }
export const vacate = definePrimitive<VacateAction>({
  type: 'vacate',
  description: 'Lift an instance off a nucleic acid.',
  fields: { actor: field.actor({ required: true }), target: field.reference({ description: 'The nucleic acid, when the instance occupies more than one.' }) },
  presentation: { verb: 'leaves' },
  validate(action, ctx) { if (action.target) requireOccupancyTarget(action.target, ctx); },
  apply(state, action, ctx) {
    const acid = action.target?.split('.')[0];
    const held = Object.values(state.occupancy).filter(item => item.instance === action.actor && (!acid || item.acid === acid));
    if (!held.length) ctx.fail(`"${action.actor}" is not on ${acid ?? 'any nucleic acid'}`);
    if (held.length > 1) ctx.fail(`"${action.actor}" is on several nucleic acids; name one with target`);
    delete state.occupancy[held[0]!.id];
  },
});

/** Static check: an interface named in an action must be declared by that instance's actor. */
function requireInterface(instance: string, name: string | undefined, ctx: { definition: MechanismDefinition; issue(message: string): void }) {
  if (!name) return;
  const actor = instanceDefinition(ctx.definition, instance);
  if (actor && !actor.interfaces?.some(item => item.id === name)) ctx.issue(`"${actor.id}" declares no interface "${name}"`);
}

function requireFreeInterface(state: MechanismState, ctx: ApplyContext, instance: string, name: string) {
  const valence = instanceDefinition(ctx.definition, instance)!.interfaces!.find(item => item.id === name)!.valence ?? 1;
  if (interfaceUse(state, instance, name) >= valence) ctx.fail(`"${instance}" has no free "${name}" interface (valence ${valence})`);
}

interface SetStateAction extends ActionSpec { target: string; visible?: boolean; activity?: Activity; lesion?: LesionType | 'none' }
export const setState = definePrimitive<SetStateAction>({
  type: 'set-state',
  description: 'Set visibility or activity of an actor, or the lesion state of a site.',
  fields: {
    target: field.reference({ required: true }),
    visible: field.boolean(),
    activity: field.enum(ACTIVITIES),
    lesion: field.enum([...LESIONS, 'none']),
  },
  presentation: { verb: 'changes' },
  validate(action, ctx) {
    const isSite = action.target.includes('.');
    if (action.visible === undefined && action.activity === undefined && action.lesion === undefined) ctx.issue('set at least one of visible, activity, lesion');
    if (isSite && (action.visible !== undefined || action.activity !== undefined)) ctx.issue('visible and activity apply to actors, not sites');
    if (!isSite && action.lesion !== undefined) ctx.issue('lesion applies to a site (actor.site)');
  },
  apply(state, action, ctx) {
    if (action.lesion !== undefined) {
      const site = ctx.site(action.target);
      // A break is read at the boundary, a base lesion at the nucleotide (RFC 0007 D14). Clearing follows the lesion that is there.
      const lesion = action.lesion === 'none' ? site.lesion : action.lesion;
      requireExtantSite(state, ctx, action.target, { base: !lesion || !BREAKS.includes(lesion) });
      if (action.lesion === 'none') delete site.lesion;
      else site.lesion = action.lesion;
      return;
    }
    const actor = ctx.actor(action.target);
    if (action.visible !== undefined) actor.visible = action.visible;
    if (action.activity !== undefined) actor.activity = action.by ? { state: action.activity, by: action.by } : { state: action.activity };
  },
});

interface ModifyAction extends ActionSpec { actor: string; kind: string; site?: string; label?: string; length?: number; remove?: boolean }
export const modify = definePrimitive<ModifyAction>({
  type: 'modify',
  description: 'Add or remove a covalent modification, chain, or filament on an actor.',
  fields: {
    actor: field.actor({ required: true }),
    kind: field.string({ required: true, description: 'Open vocabulary, e.g. phosphorylation, ubiquitination.' }),
    site: field.string({ description: 'Residue or region, e.g. Y1068.' }),
    label: field.string(),
    length: field.integer({ min: 1, description: 'Chain or filament length.' }),
    remove: field.boolean(),
  },
  presentation: { verb: 'modifies' },
  apply(_state, action, ctx) {
    const actor = ctx.requirePresent(action.actor);
    const id = action.site ? `${action.kind}@${action.site}` : action.kind;
    const index = actor.modifications.findIndex(item => item.id === id);
    if (action.remove) {
      if (index < 0) ctx.fail(`"${action.actor}" has no ${id} to remove`);
      actor.modifications.splice(index, 1);
      return;
    }
    const modification = {
      id, kind: action.kind, label: action.label ?? action.kind,
      ...(action.site && { site: action.site }),
      ...(action.length && { length: action.length }),
    };
    if (index >= 0) actor.modifications[index] = modification;
    else actor.modifications.push(modification);
  },
});

interface TranslocateAction extends ActionSpec { actor: string; to: string; includeBound?: boolean }
export const translocate = definePrimitive<TranslocateAction>({
  type: 'translocate',
  description: 'Move an actor to another compartment. Bindings are never changed.',
  fields: {
    actor: field.actor({ required: true }),
    to: field.compartment({ required: true }),
    includeBound: field.boolean({ description: 'Also move every actor bound to this one, directly or transitively, keeping their bindings.' }),
  },
  presentation: { verb: 'translocates to' },
  apply(state, action, ctx) {
    const actor = ctx.requirePresent(action.actor);
    if (actor.compartment === action.to) ctx.fail(`"${action.actor}" is already in "${action.to}"`);
    const moving = new Set([actor.id]);
    const queue = action.includeBound ? [actor.id] : [];
    while (queue.length) for (const other of boundTo(state, queue.shift()!)) if (!moving.has(other)) { moving.add(other); queue.push(other); }
    for (const id of moving) ctx.actor(id).compartment = action.to;
  },
});

interface SynthesizeAction extends ActionSpec { product: string; compartment?: string }
export const synthesize = definePrimitive<SynthesizeAction>({
  type: 'synthesize',
  description: 'Bring a declared product into existence (initial.present: false).',
  fields: { product: field.actor({ required: true }), compartment: field.compartment() },
  presentation: { verb: 'synthesizes', tone: 'activating' },
  apply(_state, action, ctx) {
    const product = ctx.actor(action.product);
    if (product.present) ctx.fail(`"${action.product}" is already present; declare initial: { present: false }`);
    product.present = true;
    product.visible = true;
    const compartment = action.compartment ?? (action.by ? ctx.actor(action.by).compartment : undefined);
    if (compartment) product.compartment = compartment;
  },
});

interface DegradeAction extends ActionSpec { actor: string }
export const degrade = definePrimitive<DegradeAction>({
  type: 'degrade',
  description: 'Remove an actor from existence and release everything bound to it.',
  fields: { actor: field.actor({ required: true }) },
  presentation: { verb: 'degrades', tone: 'inhibitory' },
  apply(state, action, ctx) {
    const actor = ctx.requirePresent(action.actor);
    actor.present = false;
    actor.visible = false;
    releaseAll(state, actor.id);
  },
});

interface CleaveAction extends ActionSpec { target: string; lesion?: LesionType }
export const cleave = definePrimitive<CleaveAction>({
  type: 'cleave',
  description: 'Break the backbone of a nucleic acid at a site.',
  fields: { target: field.site({ required: true }), lesion: field.enum(BREAKS) },
  presentation: { verb: 'cleaves' },
  validate(action, ctx) {
    requireNucleicAcid(action.target, ctx);
    const site = locate(action.target, ctx.definition)?.site;
    if (action.lesion === 'double-strand-break' && (site?.strand === 'top' || site?.strand === 'bottom')) {
      ctx.issue(`a double-strand break cuts both strands, but site "${action.target}" is on the ${site.strand} strand`);
    }
  },
  apply(state, action, ctx) {
    requireExtantSite(state, ctx, action.target);
    ctx.site(action.target).lesion = action.lesion ?? 'single-strand-break';
  },
});

interface LigateAction extends ActionSpec { target: string }
export const ligate = definePrimitive<LigateAction>({
  type: 'ligate',
  description: 'Seal a backbone break at a site.',
  fields: { target: field.site({ required: true }) },
  presentation: { verb: 'ligates' },
  validate(action, ctx) { requireNucleicAcid(action.target, ctx); },
  apply(_state, action, ctx) {
    requireExtantSite(_state, ctx, action.target);
    const site = ctx.site(action.target);
    if (!site.lesion || !BREAKS.includes(site.lesion)) ctx.fail(`no strand break to ligate at "${action.target}"`);
    // A ligase seals adjacent ends only: a strand still missing nucleotides at the break has a gap, not a nick.
    const located = locate(action.target, ctx.definition);
    if (located?.site.at !== undefined) {
      const state = readNucleicState(ctx.actor(located.acid.id));
      for (const strand of lesionStrands(located.acid, located.site, site.lesion)) {
        // Partial synthesis moves the gap away from the break, so look past the nascent stretch on either side.
        const nascent = strandIntervals(state.nascent, strand);
        const left = runEdge(nascent, state.excised, located.site.at, 'left');
        const right = runEdge(nascent, state.excised, located.site.at, 'right');
        if (missingOn(state, strand).some(gap => gap.to === left || gap.from === right)) {
          ctx.fail(`the ${strand} strand is missing nucleotides at "${action.target}"; fill the gap with extend before ligating`);
        }
      }
    }
    delete site.lesion;
  },
});

// ---- Strand geometry (RFC 0004 §5). Coordinates grow along top 5′→3′; bottom is antiparallel. ----

function locate(reference: string, definition: MechanismDefinition): { acid: ActorDefinition; site: ActorSite } | undefined {
  const [actorId, siteId] = reference.split('.');
  const acid = instanceDefinition(definition, actorId!);
  const site = acid?.sites?.find(item => item.id === siteId);
  return acid && site ? { acid, site } : undefined;
}

/** Static checks shared by the strand primitives: a nucleic-acid site with the right kind of coordinate. */
function requireCoordinate(reference: string, ctx: { definition: MechanismDefinition; issue(message: string): void }, options: { point?: boolean; duplex?: boolean }) {
  const located = locate(reference, ctx.definition);
  if (!located) return;
  const { acid, site } = located;
  if (acid.type !== 'dna' && acid.type !== 'rna') return ctx.issue(`"${acid.id}" is not a nucleic acid`);
  if (!siteInterval(site)) return ctx.issue(`site "${reference}" has no coordinate (at or span); a position is layout only`);
  if (options.point && site.at === undefined) ctx.issue(`site "${reference}" needs a point coordinate (at), not a span`);
  if (options.duplex && nucleicForm(acid) !== 'duplex') ctx.issue(`"${acid.id}" is single-stranded; this action needs a duplex`);
}

/** Resolve a validated strand action: the molecule, its site, and its present actor state. */
function strandTarget(reference: string, ctx: ApplyContext) {
  const located = locate(reference, ctx.definition) ?? ctx.fail(`unknown site "${reference}"`);
  const actor = ctx.requirePresent(located.acid.id);
  return { ...located, actor, state: readNucleicState(actor), length: nucleicLength(located.acid) };
}

const missingOn = (state: NucleicState, strand: StrandId) => strandIntervals(state.missing, strand);

// ---- Excision (RFC 0007 §6): coordinates are stable, but nothing acts on a nucleotide that was excised ----

/** True when nothing of a site is left: a span with no extant nucleotide, or a point strictly inside an excised interval. */
const siteExcised = (excised: readonly Interval[], site: Pick<ActorSite, 'at' | 'span'>) =>
  site.span ? !extantLength(excised, { from: site.span[0], to: site.span[1] }) : site.at !== undefined && insideExcised(excised, site.at);

/**
 * An action acts on extant nucleotides only (RFC 0007 §6.8): a site that was excised cannot be a target,
 * and nothing falls back to a neighbour. A point site at either end of an excised interval is the
 * junction, unless the action reads it as a base (`base`): then `at` is still the nucleotide [at, at + 1),
 * which at the lower end was excised (D14).
 */
function requireExtantSite(state: MechanismState, ctx: ApplyContext, reference: string, options: { base?: boolean } = {}): void {
  const located = locate(reference, ctx.definition);
  if (!located || !isNucleicActor(located.acid)) return;
  const excised = excisedOf(state.actors[actorOf(reference)]);
  if (siteExcised(excised, located.site)) ctx.fail(`site "${reference}" was excised`);
  if (options.base && located.site.at !== undefined && intervalAt(excised, located.site.at)) ctx.fail(`the nucleotide at "${reference}" was excised`);
}

/** A span cut back to its first and last extant nucleotide; what it covers in between is derived. Fails when nothing is there. */
function extantHull(state: MechanismState, ctx: ApplyContext, acid: string, span: Interval): Interval {
  const extant = extantIntervals(excisedOf(state.actors[acid]), span);
  if (!extant.length) ctx.fail(`${acid} ${span.from}–${span.to} was excised: nothing is there`);
  return { from: extant[0]!.from, to: extant.at(-1)!.to };
}

/** A pairing span may not contain an excised nucleotide (RFC 0007 D10): across a junction it is one pairing per flank. */
function requireUnexcised(state: MechanismState, ctx: ApplyContext, acid: string, span: Interval): void {
  const extant = extantLength(excisedOf(state.actors[acid]), span);
  if (!extant) ctx.fail(`${acid} ${span.from}–${span.to} was excised: nothing is there`);
  if (extant < span.to - span.from) ctx.fail(`${acid} ${span.from}–${span.to} crosses a junction; pair each flank separately`);
}

/**
 * Where a covalent run stops on one side of the boundary `at`: past the stretch of `list` that reaches
 * it and across any junction, as often as they follow each other. `list` is one strand's nascent or
 * missing nucleotides; without one at `at` and away from a junction the edge is `at` itself.
 */
function runEdge(list: readonly Interval[], excised: readonly Interval[], at: number, side: 'left' | 'right'): number {
  for (let edge = at; ;) {
    const next = side === 'left'
      ? intervalAt(list, edge - 1)?.from ?? excised.find(item => item.to === edge)?.from
      : intervalAt(list, edge)?.to ?? excised.find(item => item.from === edge)?.to;
    if (next === undefined) return edge;
    edge = next;
  }
}
const spanLabel = (span: StrandSpan) => `${span.acid} ${span.strand} strand ${span.from}–${span.to}`;
const rangeLabel = (strand: StrandId, range: Interval) => `${strand} strand ${range.from}–${range.to}`;

interface ResectAction extends ActionSpec { target: string; length: number }
export const resect = definePrimitive<ResectAction>({
  type: 'resect',
  description: 'Remove nucleotides 5′→3′ from every 5′ end at a strand break, leaving 3′ overhangs.',
  fields: {
    target: field.site({ required: true, description: 'Site with a break and a point coordinate (at).' }),
    length: field.integer({ required: true, min: 1, description: 'Nucleotides removed from each 5′ end.' }),
  },
  presentation: { verb: 'resects' },
  validate(action, ctx) { requireCoordinate(action.target, ctx, { point: true }); },
  apply(_state, action, ctx) {
    requireExtantSite(_state, ctx, action.target);
    const lesion = ctx.site(action.target).lesion;
    if (!lesion || !BREAKS.includes(lesion)) ctx.fail(`no strand break to resect at "${action.target}"`);
    const { acid, site, actor, state, length } = strandTarget(action.target, ctx);
    const at = site.at!;
    for (const strand of lesionStrands(acid, site, lesion)) {
      // The 5′ end at the break: on top it faces increasing coordinates, on bottom decreasing ones.
      // Earlier resection has already moved it away from the break, so continue from where it is now.
      // It counts extant nucleotides (RFC 0007 §6.6), so what it removes may lie either side of an excised interval.
      const missing = missingOn(state, strand);
      const end = runEdge(missing, state.excised, at, strand === 'top' ? 'right' : 'left');
      const range = extantRun(state.excised, end, action.length, strand === 'top' ? 'forward' : 'reverse');
      if (range.from < 0 || range.to > length) {
        const room = extantLength(state.excised, strand === 'top' ? { from: end, to: length } : { from: 0, to: end });
        ctx.fail(`resecting ${action.length} nt from the 5′ end on the ${strand} strand runs past the molecule end (${room} nt left)`);
      }
      const removed = extantIntervals(state.excised, range);
      if (removed.some(piece => overlapsInterval(state.open, piece))) ctx.fail(`cannot resect into an unwound region (${rangeLabel(strand, range)}); anneal it first`);
      state.missing = withStrandIntervals(state.missing, strand, [...missing, ...removed]);
      state.nascent = withStrandIntervals(state.nascent, strand, subtractAll(strandIntervals(state.nascent, strand), removed));
    }
    writeNucleicState(actor, state);
    requireOccupantsFit(_state, ctx, actor.id);
    requirePairingsHold(_state, ctx, actor.id);
  },
});

interface ExtendAction extends ActionSpec { target: string; length: number; strand?: StrandId }
export const extend = definePrimitive<ExtendAction>({
  type: 'extend',
  description: 'Synthesise nucleotides 5′→3′ from a 3′ end at a site into a gap, copying the strand that 3′ end is paired with: its own molecule\'s, or another molecule\'s through an existing pairing, which it prolongs.',
  fields: {
    target: field.site({ required: true, description: 'Site with a point coordinate (at) where the 3′ end sits.' }),
    length: field.integer({ required: true, min: 1, description: 'Nucleotides added.' }),
    strand: field.enum(['top', 'bottom'], { description: 'Strand to extend; needed only when both offer a 3′ end.' }),
  },
  presentation: { verb: 'extends', tone: 'activating' },
  validate(action, ctx) { requireCoordinate(action.target, ctx, { point: true }); },
  apply(_state, action, ctx) {
    requireExtantSite(_state, ctx, action.target);
    const { acid, site, actor, state, length } = strandTarget(action.target, ctx);
    const at = site.at!;
    const duplex = nucleicForm(acid) === 'duplex';
    const nascentRun = (strand: StrandId) => strandIntervals(state.nascent, strand);
    // The 3′ end that faces a gap at the site, past anything already synthesised from it.
    const gapFrom = (strand: StrandId): Interval | undefined => {
      const missing = missingOn(state, strand);
      if (strand === 'top') {
        const end = runEdge(nascentRun('top'), state.excised, at, 'right');
        const gap = missing.find(item => item.from === end);
        return gap && end > 0 ? gap : undefined;
      }
      const end = runEdge(nascentRun('bottom'), state.excised, at, 'left');
      const gap = missing.find(item => item.to === end);
      return gap && end < length ? gap : undefined;
    };
    const strands: readonly StrandId[] = duplex ? ['top', 'bottom'] : ['top'];
    const candidates = strands.filter(strand => (!action.strand || action.strand === strand) && gapFrom(strand));
    if (!candidates.length) ctx.fail(`no 3′ end facing a gap${action.strand ? ` on the ${action.strand} strand` : ''} at "${action.target}"`);
    // The template is whatever the 3′-terminal nucleotide is paired with (RFC 0006 §6.1): nothing is searched for.
    const terminal = (strand: StrandId) => {
      const gap = gapFrom(strand)!;
      // The 3′-terminal nucleotide is the gap's covalent neighbour, which a junction puts further away by coordinate.
      const nucleotide = strand === 'top'
        ? (edge => ({ from: edge - 1, to: edge }))(junctionAt(state.excised, gap.from).lower)
        : (edge => ({ from: edge, to: edge + 1 }))(junctionAt(state.excised, gap.to).upper);
      return partnerOf(_state, ctx.definition, { acid: actor.id, strand, ...nucleotide })[0]!;
    };
    if (ctx.site(action.target).lesion === 'double-strand-break') {
      // Across a break the 3′ end and its own molecule's template lie on different fragments (RFC 0004 §5).
      // They are joined only when the template strand bridges the break and the 3′ end is paired with it.
      const flank = (strand: StrandId, nucleotide: number) => !overlapsInterval(missingOn(state, strand), { from: nucleotide, to: nucleotide + 1 });
      const bridged = (strand: StrandId) => {
        const template = otherStrand(strand);
        return terminal(strand).partner === 'cis' && flank(template, at - 1) && flank(template, at)
          && Boolean(intervalAt(nascentRun(template), at - 1) ?? intervalAt(nascentRun(template), at));
      };
      if (!candidates.some(strand => terminal(strand).partner === 'trans' || bridged(strand))) {
        ctx.fail(`extension at a double-strand break needs a template from another molecule: pair the 3′ end first, or anneal a strand that bridges the break ("${action.target}")`);
      }
      if (candidates.length === 1 && terminal(candidates[0]!).partner !== 'trans' && !bridged(candidates[0]!)) ctx.fail(`the ${candidates[0]} strand has no template across the break at "${action.target}"`);
    }
    if (candidates.length > 1) ctx.fail(`both strands have a 3′ end facing a gap at "${action.target}"; set strand`);
    const strand = candidates[0]!;
    const gap = gapFrom(strand)!;
    if (action.length > gap.to - gap.from) ctx.fail(`extending ${action.length} nt overfills the ${gap.to - gap.from}-nt gap on the ${strand} strand`);
    const range = strand === 'top' ? { from: gap.from, to: gap.from + action.length } : { from: gap.to - action.length, to: gap.to };
    const end = terminal(strand);
    const fill = () => {
      state.missing = withStrandIntervals(state.missing, strand, subtractInterval(missingOn(state, strand), range));
      state.nascent = withStrandIntervals(state.nascent, strand, addInterval(nascentRun(strand), range));
    };
    if (end.partner === 'trans') {
      // Prolong the pairing that holds the 3′ end, along the same correspondence. No other partner is considered.
      const own: StrandSpan = { acid: actor.id, strand, ...range };
      const template = continuePairing({ from: end.from, to: end.to }, end.with, own);
      const donorLength = nucleicLength(instanceDefinition(ctx.definition, template.acid)!);
      if (template.from < 0 || template.to > donorLength) ctx.fail(`extending ${action.length} nt runs past the end of the template (${spanLabel({ ...template, from: Math.max(template.from, 0), to: Math.min(template.to, donorLength) })})`);
      const aligned = ctx.definition.alignments.some(item => {
        const mapped = alignedSpan(item, own, template.acid);
        return mapped && mapped.strand === template.strand && mapped.from === template.from && mapped.to === template.to;
      });
      if (!aligned) ctx.fail(`extending ${action.length} nt runs past the alignment between "${actor.id}" and "${template.acid}"`);
      const conflict = pairingConflicts(_state, ctx.definition, template);
      if (conflict) ctx.fail(`no template: ${conflict}`);
      // The new strand is paired with its template and with nothing else: where its own molecule's other
      // strand is present, the two stay unpaired until an explicit anneal (RFC 0006 §6.2).
      const facing = duplex ? subtractAll([range], missingOn(state, otherStrand(strand))) : [];
      fill();
      state.open = facing.reduce((open, item) => addInterval(open, item), state.open);
      writeNucleicState(actor, state);
      addPairing(_state, own, template);
      requireOccupantsFit(_state, ctx);
      requirePairingsHold(_state, ctx, actor.id);
      requirePairingsHold(_state, ctx, template.acid);
      return;
    }
    if (!duplex) ctx.fail(`no template: "${actor.id}" is single-stranded, so its 3′ end must be paired with another molecule`);
    if (overlapsInterval(missingOn(state, otherStrand(strand)), range)) ctx.fail(`no template: the ${otherStrand(strand)} strand is missing across ${range.from}–${range.to}`);
    fill();
    writeNucleicState(actor, state);
    requireOccupantsFit(_state, ctx, actor.id);
    requirePairingsHold(_state, ctx, actor.id);
  },
});

/** Parts of `list` not covered by any of `cuts`. */
const subtractAll = (list: readonly Interval[], cuts: readonly Interval[]) => cuts.reduce<Interval[]>((rest, cut) => subtractInterval(rest, cut), [...list]);

/**
 * The strand span that continues a pairing over `next`, given one paired nucleotide and its partner.
 * Strands of different names run the same way along the coordinate; strands of the same name run mirrored.
 */
function continuePairing(paired: Interval, partner: StrandSpan, next: StrandSpan): StrandSpan {
  if (partner.strand !== next.strand) {
    const offset = partner.from - paired.from;
    return { ...partner, from: next.from + offset, to: next.to + offset };
  }
  const sum = partner.from + paired.from;
  return { ...partner, from: sum - next.to + 1, to: sum - next.from + 1 };
}

interface UnwindAction extends ActionSpec { target: string; length?: number }
export const unwind = definePrimitive<UnwindAction>({
  type: 'unwind',
  description: 'Separate both strands into an unpaired bubble around a site.',
  fields: {
    target: field.site({ required: true, description: 'Site with a coordinate; a span is the bubble itself.' }),
    length: field.integer({ min: 1, description: 'Bubble length, centred on a point site (at). Not used with a span.' }),
  },
  presentation: { verb: 'unwinds' },
  validate(action, ctx) {
    requireCoordinate(action.target, ctx, { duplex: true });
    const site = locate(action.target, ctx.definition)?.site;
    if (site?.at !== undefined && action.length === undefined) ctx.issue('length is required for a point site (at)');
    if (site?.span && action.length !== undefined) ctx.issue(`length is not used with a span; "${action.target}" already gives the bubble`);
  },
  apply(_state, action, ctx) {
    requireExtantSite(_state, ctx, action.target);
    const { site, actor, state, length } = strandTarget(action.target, ctx);
    // A bubble is a stretch of extant nucleotides: centred on a point it is counted along the covalent order.
    const half = Math.floor((action.length ?? 0) / 2);
    const range = site.span
      ? extantHull(_state, ctx, actor.id, { from: site.span[0], to: site.span[1] })
      : { from: extantRun(state.excised, site.at!, half, 'reverse').from, to: extantRun(state.excised, site.at!, action.length! - half, 'forward').to };
    if (range.from < 0 || range.to > length) ctx.fail(`a ${extantLength(state.excised, range)}-nt bubble at "${action.target}" runs past the molecule ends (0–${length})`);
    // Across a junction the bubble is stored as one interval per flank (RFC 0007 §6.8).
    const opened = extantIntervals(state.excised, range);
    for (const strand of ['top', 'bottom'] as const) {
      if (opened.some(piece => overlapsInterval(missingOn(state, strand), piece))) ctx.fail(`cannot unwind ${range.from}–${range.to}: the ${strand} strand is missing there`);
    }
    if (opened.some(piece => overlapsInterval(state.open, piece))) ctx.fail(`${range.from}–${range.to} is already unwound`);
    state.open = normalizeIntervals([...state.open, ...opened]);
    writeNucleicState(actor, state);
    requireOccupantsFit(_state, ctx, actor.id);
    requirePairingsHold(_state, ctx, actor.id);
  },
});

interface AnnealAction extends ActionSpec { target: string; span?: [number, number] }
export const anneal = definePrimitive<AnnealAction>({
  type: 'anneal',
  description: 'Re-pair the unwound bubble at a site, or only part of it.',
  fields: {
    target: field.site({ required: true, description: 'Site with a coordinate inside or at the edge of the bubble.' }),
    span: field.interval({ description: 'Close only these nucleotides of the bubble (a junction moving along it). Without it the whole bubble closes.' }),
  },
  presentation: { verb: 'anneals' },
  validate(action, ctx) { requireCoordinate(action.target, ctx, { duplex: true }); },
  apply(_state, action, ctx) {
    requireExtantSite(_state, ctx, action.target);
    const { site, actor, state } = strandTarget(action.target, ctx);
    const probe = siteInterval(site)!;
    const found = state.open.find(region => region.from <= probe.to && probe.from <= region.to)
      ?? ctx.fail(`no unwound region at "${action.target}" to anneal`);
    // A bubble across a junction is stored as one interval per flank; they are one bubble and close together.
    const regions = [found];
    const bubble = { ...found };
    for (let grown = true; grown;) {
      grown = false;
      for (const region of state.open) {
        if (regions.includes(region)) continue;
        const before = junctionAt(state.excised, bubble.from).lower === region.to && region.to !== bubble.from;
        const after = junctionAt(state.excised, bubble.to).upper === region.from && region.from !== bubble.to;
        if (!before && !after) continue;
        regions.push(region);
        if (before) bubble.from = region.from; else bubble.to = region.to;
        grown = true;
      }
    }
    if (action.span) {
      const part = { from: action.span[0], to: action.span[1] };
      if (part.from < bubble.from || part.to > bubble.to) ctx.fail(`${part.from}–${part.to} is not inside the unwound region ${bubble.from}–${bubble.to} at "${action.target}"`);
      state.open = subtractInterval(state.open, part);
    } else state.open = state.open.filter(region => !regions.includes(region));
    writeNucleicState(actor, state);
    requireOccupantsFit(_state, ctx, actor.id);
    requirePairingsHold(_state, ctx, actor.id);
  },
});

// ---- Nucleic topology (RFC 0006 §5): base pairing between strands of different molecules ----

/** Strand actions never break a pairing silently: afterwards every pairing on the molecule must still hold. */
function requirePairingsHold(state: MechanismState, ctx: ApplyContext, acid: string): void {
  const broken = brokenPairings(state, ctx.definition, acid);
  if (broken) ctx.fail(broken);
}

interface PairAction extends ActionSpec { target: string; with: string; strand?: StrandId; span?: [number, number]; alignment?: string }
export const pair = definePrimitive<PairAction>({
  type: 'pair',
  description: 'Base-pair a strand span of one nucleic acid with the aligned strand span of another. Both must be present and unpaired: it never unwinds or displaces.',
  fields: {
    target: field.reference({ required: true, description: 'The nucleic acid, or a site with a span, whose strand pairs.' }),
    with: field.actor({ required: true, description: 'The nucleic acid it pairs with; the span and strand follow from the alignment.' }),
    strand: field.enum(['top', 'bottom'], { description: 'Strand of the target. Defaults to the site\'s strand, else the one unpaired strand across the span.' }),
    span: field.interval({ description: 'Nucleotides of the target that pair, overriding the site.' }),
    alignment: field.string({ description: 'Alignment to pair through; needed only when several relate the two molecules over the span.' }),
  },
  presentation: { verb: 'pairs with' },
  validate(action, ctx) {
    requireNucleicAcid(action.target, ctx);
    requireNucleicAcid(action.with, ctx);
    const site = locate(action.target, ctx.definition)?.site;
    if (!action.span && !site?.span) ctx.issue('pair needs a span: a site with a span, or span');
    const related = ctx.definition.alignments.filter(item => alignmentRelates(item, actorOf(action.target), action.with));
    if (action.alignment && !ctx.definition.alignments.some(item => item.id === action.alignment)) ctx.issue(`unknown alignment "${action.alignment}"`);
    else if (!related.some(item => !action.alignment || item.id === action.alignment)) {
      ctx.issue(`no alignment${action.alignment ? ` "${action.alignment}"` : ''} relates "${actorOf(action.target)}" and "${action.with}"; declare one in alignments`);
    }
  },
  apply(state, action, ctx) {
    const acid = actorOf(action.target);
    ctx.requirePresent(acid);
    ctx.requirePresent(action.with);
    const site = locate(action.target, ctx.definition)?.site;
    const range = action.span ? { from: action.span[0], to: action.span[1] } : { from: site!.span![0], to: site!.span![1] };
    requireExtantSite(state, ctx, action.target);
    requireUnexcised(state, ctx, acid, range);
    const named = action.strand ?? (site?.strand === 'top' || site?.strand === 'bottom' ? site.strand : undefined);
    const conflicts = (['top', 'bottom'] as const).map(strand => pairingConflicts(state, ctx.definition, { acid, strand, ...range }));
    const free = (['top', 'bottom'] as const).filter((_, index) => !conflicts[index]);
    if (!named && free.length === 2) ctx.fail(`both strands are unpaired across ${acid} ${range.from}–${range.to}; name the strand`);
    if (!named && !free.length) ctx.fail(`no strand is unpaired across ${acid} ${range.from}–${range.to}: ${conflicts.join('; ')}`);
    const own: StrandSpan = { acid, strand: named ?? free[0]!, ...range };
    const partners = ctx.definition.alignments
      .filter(item => !action.alignment || item.id === action.alignment)
      .flatMap(item => alignedSpan(item, own, action.with) ?? []);
    if (!partners.length) ctx.fail(`no alignment between "${acid}" and "${action.with}" covers ${acid} ${range.from}–${range.to}`);
    if (partners.length > 1) ctx.fail(`several alignments between "${acid}" and "${action.with}" cover ${acid} ${range.from}–${range.to}; name one with alignment`);
    const partner = partners[0]!;
    requireUnexcised(state, ctx, partner.acid, partner);
    for (const span of [own, partner]) {
      const conflict = pairingConflicts(state, ctx.definition, span);
      if (conflict) ctx.fail(`cannot pair ${spanLabel(own)} with ${spanLabel(partner)}: ${conflict}`);
    }
    addPairing(state, own, partner);
    requireOccupantsFit(state, ctx);
  },
});

interface UnpairAction extends ActionSpec { target: string; strand?: StrandId; span?: [number, number] }
export const unpair = definePrimitive<UnpairAction>({
  type: 'unpair',
  description: 'Separate a strand span from the strand of another molecule it is paired with. Both become unpaired: it never anneals.',
  fields: {
    target: field.reference({ required: true, description: 'The nucleic acid, or a site with a span. A bare molecule means its whole length.' }),
    strand: field.enum(['top', 'bottom'], { description: 'Defaults to the site\'s strand, else both.' }),
    span: field.interval({ description: 'Nucleotides to unpair, overriding the site.' }),
  },
  presentation: { verb: 'unpairs from' },
  validate(action, ctx) {
    requireNucleicAcid(action.target, ctx);
    const site = locate(action.target, ctx.definition)?.site;
    if (!action.span && site && !site.span) ctx.issue(`site "${action.target}" has no span; give a span`);
  },
  apply(state, action, ctx) {
    const acid = actorOf(action.target);
    ctx.requirePresent(acid);
    const site = locate(action.target, ctx.definition)?.site;
    const range = action.span ? { from: action.span[0], to: action.span[1] }
      : site?.span ? { from: site.span[0], to: site.span[1] }
      : { from: 0, to: nucleicLength(instanceDefinition(ctx.definition, acid)!) };
    const named = action.strand ?? (site?.strand === 'top' || site?.strand === 'bottom' ? site.strand : undefined);
    const strands: readonly StrandId[] = named ? [named] : ['top', 'bottom'];
    const removed = strands.reduce((sum, strand) => sum + removePairings(state, { acid, strand, ...range }), 0);
    if (!removed) ctx.fail(`nothing is paired with ${acid} ${named ? `${named} strand ` : ''}${range.from}–${range.to}`);
    requireOccupantsFit(state, ctx);
  },
});

// ---- Excision (RFC 0007 §4): an internal interval leaves, and its flanks become covalent neighbours ----

interface ExciseIntervalAction extends ActionSpec { target: string; span?: [number, number] }
export const exciseInterval = definePrimitive<ExciseIntervalAction>({
  type: 'excise-interval',
  description: 'Remove an internal interval of a nucleic acid, on every strand, and join the nucleotides either side of it. Coordinates are not renumbered. Not a gap: nothing is left to fill or ligate.',
  fields: {
    target: field.reference({ required: true, description: 'The nucleic acid, or one of its sites with a span.' }),
    span: field.interval({ description: 'Interval to remove, overriding the site. It must be internal: it reaches neither end of the molecule.' }),
  },
  presentation: { verb: 'excises' },
  validate(action, ctx) {
    const acid = instanceDefinition(ctx.definition, actorOf(action.target));
    if (acid && !isNucleicActor(acid)) return ctx.issue(`"${acid.id}" is not a nucleic acid; excise-interval needs a nucleic acid and an interval`);
    const span = action.span ?? locate(action.target, ctx.definition)?.site.span;
    if (!span) return ctx.issue('excise-interval needs an interval: a site with a span, or span');
    if (!acid) return;
    const length = nucleicLength(acid);
    if (span[1] > length) ctx.issue(`${span[0]}–${span[1]} runs past the molecule (0–${length})`);
    else if (span[0] === 0 || span[1] === length) ctx.issue(`${span[0]}–${span[1]} is not internal: removing an end of "${acid.id}" is truncation, not excision`);
  },
  apply(state, action, ctx) {
    const acidId = actorOf(action.target);
    const actor = ctx.requirePresent(acidId);
    const acid = instanceDefinition(ctx.definition, acidId)!;
    const [from, to] = action.span ?? locate(action.target, ctx.definition)!.site.span!;
    const interval = { from, to };
    const where = `${acidId} ${from}–${to}`;
    const nucleic = readNucleicState(actor);
    const strands: readonly StrandId[] = nucleicForm(acid) === 'duplex' ? ['top', 'bottom'] : ['top'];
    if (!extantLength(nucleic.excised, interval)) ctx.fail(`${where} was already excised: nothing left to excise there`);
    // The junction is one bond between exactly these two nucleotides; it never looks for the next surviving one.
    for (const flank of [from - 1, to]) {
      if (intervalAt(nucleic.excised, flank)) ctx.fail(`nothing to join at ${where}: nucleotide ${flank} was excised; excise one interval that covers both`);
      for (const strand of strands) {
        if (intervalAt(missingOn(nucleic, strand), flank)) ctx.fail(`nothing to join at ${where}: nucleotide ${flank} is missing on the ${strand} strand; fill the gap first`);
      }
    }
    for (const strand of strands) {
      if (overlapsInterval(missingOn(nucleic, strand), interval)) ctx.fail(`the ${strand} strand is missing within ${where}: the interval must be present; a gap is filled or resected, not excised`);
    }
    const excised = addInterval(nucleic.excised, interval);
    for (const occupancy of Object.values(state.occupancy)) {
      if (occupancy.acid !== acidId) continue;
      if (occupancy.span && overlapsInterval(coveredIntervals(state, occupancy), interval)) {
        ctx.fail(`"${occupancy.instance}" occupies ${acidId} ${occupancy.span.from}–${occupancy.span.to}, within ${where}; vacate it first`);
      }
      const resting = occupancy.span ? undefined : acid.sites?.find(item => item.id === occupancy.site);
      if (resting && siteExcised(excised, resting)) ctx.fail(`"${occupancy.instance}" rests on "${acidId}.${resting.id}", within ${where}; release it first`);
    }
    for (const { ends } of Object.values(state.pairings).flat()) {
      ends.forEach((end, index) => {
        if (end.acid === acidId && overlapsInterval([end], interval)) ctx.fail(`${spanLabel(end)} is paired with ${spanLabel(ends[1 - index]!)}, within ${where}; unpair it first`);
      });
    }
    for (const region of nucleic.open) {
      if (overlapsInterval([region], interval) && (region.from < from || region.to > to)) {
        ctx.fail(`${where} overlaps the unwound region ${region.from}–${region.to} only in part; anneal it, or excise the whole bubble`);
      }
    }
    // Excised nucleotides are in no other list (I3): what was newly made or unwound there goes with them.
    nucleic.excised = excised;
    nucleic.open = subtractInterval(nucleic.open, interval);
    for (const strand of strands) nucleic.nascent = withStrandIntervals(nucleic.nascent, strand, subtractInterval(strandIntervals(nucleic.nascent, strand), interval));
    writeNucleicState(actor, nucleic);
    // The bond a break at either boundary interrupted no longer exists: the junction replaces it (D7).
    // A lesion on a nucleotide that left goes with it; one on the nucleotide at `to`, which stays, is kept (D14).
    for (const site of acid.sites ?? []) {
      const siteState = state.sites[`${acidId}.${site.id}`];
      if (!siteState?.lesion) continue;
      const gone = siteExcised(excised, site) || site.at === from;
      if (gone || (site.at === to && BREAKS.includes(siteState.lesion))) delete siteState.lesion;
    }
    requireOccupantsFit(state, ctx, acidId);
    requirePairingsHold(state, ctx, acidId);
  },
});

function requireNucleicAcid(reference: string, ctx: { definition: MechanismDefinition; issue(message: string): void }) {
  const actor = instanceDefinition(ctx.definition, actorOf(reference));
  if (actor && actor.type !== 'dna' && actor.type !== 'rna') ctx.issue(`"${actor.id}" is not a nucleic acid`);
}

// ---- Aliases ----

type ActorAction = ActionSpec & { actor: string };
type SiteAction = ActionSpec & { target: string };

export const recruit = defineAlias<BindAction>({
  type: 'recruit',
  description: 'Bind an actor that is brought in by its target.',
  fields: bind.fields,
  presentation: { verb: 'recruits' },
  expand: action => ({ ...action, type: 'bind' }),
});

export const invade = defineAlias<PairAction>({
  type: 'invade',
  description: 'Pair a strand with another molecule, told as an invasion. Exactly a pair: the other duplex must already be unwound.',
  fields: pair.fields,
  presentation: { verb: 'invades' },
  expand: action => ({ ...action, type: 'pair' }),
});

const visibility = (type: string, visible: boolean, verb: string) => defineAlias<ActorAction>({
  type, description: `${visible ? 'Show' : 'Hide'} an actor without changing its biology.`,
  fields: { actor: field.actor({ required: true }) },
  presentation: { verb },
  expand: action => ({ type: 'set-state', target: action.actor, visible, ...timing(action) }),
});

const activity = (type: string, state: Activity, verb: string, tone: 'activating' | 'inhibitory') => defineAlias<ActorAction>({
  type, description: `Mark an actor as ${state}.`,
  fields: { actor: field.actor({ required: true }) },
  presentation: { verb, tone },
  expand: action => ({ type: 'set-state', target: action.actor, activity: state, ...timing(action) }),
});

type ResidueAction = ActorAction & { site?: string; label?: string };
const modification = (type: string, kind: string, verb: string, label: string, options: { remove?: boolean; tone?: 'activating' | 'inhibitory' } = {}) =>
  defineAlias<ResidueAction>({
    type, description: `${options.remove ? 'Remove' : 'Add'} ${kind}, optionally at a named residue.`,
    fields: { actor: field.actor({ required: true }), site: field.string(), label: field.string() },
    presentation: { verb, tone: options.tone ?? 'neutral' },
    expand: action => ({ type: 'modify', actor: action.actor, kind, site: action.site, label: action.label ?? label, remove: options.remove, ...timing(action) }),
  });

export const parylate = defineAlias<ActorAction & { length?: number }>({
  type: 'parylate',
  description: 'Attach a poly(ADP-ribose) chain.',
  fields: { actor: field.actor({ required: true }), length: field.integer({ min: 1 }) },
  presentation: { verb: 'PARylates' },
  expand: action => ({ type: 'modify', actor: action.actor, kind: 'parylation', label: 'PAR', length: action.length ?? 7, ...timing(action) }),
});

export const polymerize = defineAlias<ActorAction & { product: string; length?: number }>({
  type: 'polymerize',
  description: 'Grow a chain or filament on an actor.',
  fields: { actor: field.actor({ required: true }), product: field.string({ required: true }), length: field.integer({ min: 1 }) },
  presentation: { verb: 'polymerizes' },
  expand: action => ({ type: 'modify', actor: action.actor, kind: 'polymer', label: action.product, length: action.length ?? 7, ...timing(action) }),
});

const siteLesion = (type: string, lesion: LesionType | 'none', verb: string, choices?: readonly LesionType[]) =>
  defineAlias<SiteAction & { lesion?: LesionType }>({
    type, description: lesion === 'none' ? 'Restore an intact site.' : `Mark a site as ${lesion}.`,
    fields: { target: field.site({ required: true }), ...(choices && { lesion: field.enum(choices) }) },
    presentation: { verb },
    expand: action => ({ type: 'set-state', target: action.target, lesion: action.lesion ?? lesion, ...timing(action) }),
  });

export const builtinActions = [
  bind, unbind, setState, modify, translocate, synthesize, degrade, cleave, ligate,
  resect, extend, unwind, anneal,
  occupy, coat, vacate,
  pair, unpair,
  exciseInterval,
  recruit, invade,
  visibility('show', true, 'shows'),
  visibility('hide', false, 'hides'),
  activity('activate', 'active', 'activates', 'activating'),
  activity('inactivate', 'inactive', 'inactivates', 'inhibitory'),
  activity('inhibit', 'inhibited', 'inhibits', 'inhibitory'),
  modification('phosphorylate', 'phosphorylation', 'phosphorylates', 'P'),
  modification('dephosphorylate', 'phosphorylation', 'dephosphorylates', 'P', { remove: true }),
  modification('ubiquitinate', 'ubiquitination', 'ubiquitinates', 'Ub'),
  parylate,
  polymerize,
  siteLesion('damage', 'base-damage', 'damages', ['base-damage', 'adduct']),
  siteLesion('excise', 'abasic-site', 'excises the base at'),
  siteLesion('fill-gap', 'nick', 'fills the gap at'),
  siteLesion('repair', 'none', 'repairs'),
];

export const builtinRegistry = new ActionRegistry(builtinActions);
