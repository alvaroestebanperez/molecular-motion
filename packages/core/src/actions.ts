import { instanceDefinition } from './instances';
import { addInterval, intervalAt, overlapsInterval, subtractInterval, type Interval } from './intervals';
import {
  lesionStrands, nucleicForm, nucleicLength, otherStrand, readNucleicState, siteInterval, strandIntervals, withStrandIntervals, writeNucleicState,
} from './nucleic';
import { ActionRegistry, defineAlias, definePrimitive, field, type ApplyContext } from './registry';
import type { ActionSpec, Activity, ActorDefinition, ActorSite, LesionType, MechanismDefinition, NucleicState, StrandId } from './types';

export const ACTIVITIES: readonly Activity[] = ['active', 'inactive', 'inhibited'];
export const LESIONS: readonly LesionType[] = ['single-strand-break', 'nick', 'double-strand-break', 'base-damage', 'abasic-site', 'adduct'];
const BREAKS: readonly LesionType[] = ['single-strand-break', 'nick', 'double-strand-break'];

const actorOf = (reference: string) => reference.split('.')[0]!;
const timing = ({ by, duration }: ActionSpec) => ({ by, duration });

// ---- Primitives ----

interface BindAction extends ActionSpec { actor: string; target: string }
export const bind = definePrimitive<BindAction>({
  type: 'bind',
  description: 'Associate an actor with another actor or one of its sites.',
  fields: { actor: field.actor({ required: true }), target: field.reference({ required: true }) },
  presentation: { verb: 'binds' },
  validate(action, ctx) {
    if (actorOf(action.target) === action.actor) ctx.issue('an actor cannot bind itself');
  },
  apply(_state, action, ctx) {
    const actor = ctx.requirePresent(action.actor);
    ctx.requirePresent(actorOf(action.target));
    actor.boundTo = action.target;
    actor.visible = true;
  },
});

interface UnbindAction extends ActionSpec { actor: string }
export const unbind = definePrimitive<UnbindAction>({
  type: 'unbind',
  description: 'Release an actor from its binding partner.',
  fields: { actor: field.actor({ required: true }) },
  presentation: { verb: 'releases' },
  apply(_state, action, ctx) { delete ctx.actor(action.actor).boundTo; },
});

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
  apply(_state, action, ctx) {
    if (action.lesion !== undefined) {
      const site = ctx.site(action.target);
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
    for (let grew = Boolean(action.includeBound); grew;) {
      grew = false;
      for (const other of Object.values(state.actors)) {
        if (!moving.has(other.id) && other.boundTo && moving.has(actorOf(other.boundTo))) { moving.add(other.id); grew = true; }
      }
    }
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
    delete actor.boundTo;
    for (const other of Object.values(state.actors)) if (other.boundTo && actorOf(other.boundTo) === actor.id) delete other.boundTo;
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
  apply(_state, action, ctx) { ctx.site(action.target).lesion = action.lesion ?? 'single-strand-break'; },
});

interface LigateAction extends ActionSpec { target: string }
export const ligate = definePrimitive<LigateAction>({
  type: 'ligate',
  description: 'Seal a backbone break at a site.',
  fields: { target: field.site({ required: true }) },
  presentation: { verb: 'ligates' },
  validate(action, ctx) { requireNucleicAcid(action.target, ctx); },
  apply(_state, action, ctx) {
    const site = ctx.site(action.target);
    if (!site.lesion || !BREAKS.includes(site.lesion)) ctx.fail(`no strand break to ligate at "${action.target}"`);
    // A ligase seals adjacent ends only: a strand still missing nucleotides at the break has a gap, not a nick.
    const located = locate(action.target, ctx.definition);
    if (located?.site.at !== undefined) {
      const state = readNucleicState(ctx.actor(located.acid.id));
      for (const strand of lesionStrands(located.acid, located.site, site.lesion)) {
        // Partial synthesis moves the gap away from the break, so look past the nascent stretch on either side.
        const nascent = strandIntervals(state.nascent, strand);
        const left = intervalAt(nascent, located.site.at - 1)?.from ?? located.site.at;
        const right = intervalAt(nascent, located.site.at)?.to ?? located.site.at;
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
    const lesion = ctx.site(action.target).lesion;
    if (!lesion || !BREAKS.includes(lesion)) ctx.fail(`no strand break to resect at "${action.target}"`);
    const { acid, site, actor, state, length } = strandTarget(action.target, ctx);
    const at = site.at!;
    for (const strand of lesionStrands(acid, site, lesion)) {
      // The 5′ end at the break: on top it faces increasing coordinates, on bottom decreasing ones.
      // Earlier resection has already moved it away from the break, so continue from where it is now.
      const missing = missingOn(state, strand);
      const range = strand === 'top'
        ? (end => ({ from: end, to: end + action.length }))(intervalAt(missing, at)?.to ?? at)
        : (end => ({ from: end - action.length, to: end }))(intervalAt(missing, at - 1)?.from ?? at);
      if (range.from < 0 || range.to > length) {
        const room = strand === 'top' ? length - range.from : range.to;
        ctx.fail(`resecting ${action.length} nt from the 5′ end on the ${strand} strand runs past the molecule end (${room} nt left)`);
      }
      if (overlapsInterval(state.open, range)) ctx.fail(`cannot resect into an unwound region (${rangeLabel(strand, range)}); anneal it first`);
      state.missing = withStrandIntervals(state.missing, strand, addInterval(missing, range));
      state.nascent = withStrandIntervals(state.nascent, strand, subtractInterval(strandIntervals(state.nascent, strand), range));
    }
    writeNucleicState(actor, state);
  },
});

interface ExtendAction extends ActionSpec { target: string; length: number; strand?: StrandId }
export const extend = definePrimitive<ExtendAction>({
  type: 'extend',
  description: 'Synthesise nucleotides 5′→3′ from a 3′ end at a site into a gap, copying the opposite strand.',
  fields: {
    target: field.site({ required: true, description: 'Site with a point coordinate (at) where the 3′ end sits.' }),
    length: field.integer({ required: true, min: 1, description: 'Nucleotides added.' }),
    strand: field.enum(['top', 'bottom'], { description: 'Strand to extend; needed only when both offer a 3′ end.' }),
  },
  presentation: { verb: 'extends', tone: 'activating' },
  validate(action, ctx) { requireCoordinate(action.target, ctx, { point: true, duplex: true }); },
  apply(_state, action, ctx) {
    if (ctx.site(action.target).lesion === 'double-strand-break') {
      ctx.fail(`extension at a double-strand break needs a template from another molecule, which this model does not represent ("${action.target}")`);
    }
    const { site, actor, state, length } = strandTarget(action.target, ctx);
    const at = site.at!;
    const nascentRun = (strand: StrandId) => strandIntervals(state.nascent, strand);
    // The 3′ end that faces a gap at the site, past anything already synthesised from it.
    const gapFrom = (strand: StrandId): Interval | undefined => {
      const missing = missingOn(state, strand);
      if (strand === 'top') {
        const end = intervalAt(nascentRun('top'), at)?.to ?? at;
        const gap = missing.find(item => item.from === end);
        return gap && end > 0 ? gap : undefined;
      }
      const end = intervalAt(nascentRun('bottom'), at - 1)?.from ?? at;
      const gap = missing.find(item => item.to === end);
      return gap && end < length ? gap : undefined;
    };
    const candidates = (['top', 'bottom'] as const).filter(strand => (!action.strand || action.strand === strand) && gapFrom(strand));
    if (!candidates.length) ctx.fail(`no 3′ end facing a gap${action.strand ? ` on the ${action.strand} strand` : ''} at "${action.target}"`);
    if (candidates.length > 1) ctx.fail(`both strands have a 3′ end facing a gap at "${action.target}"; set strand`);
    const strand = candidates[0]!;
    const gap = gapFrom(strand)!;
    if (action.length > gap.to - gap.from) ctx.fail(`extending ${action.length} nt overfills the ${gap.to - gap.from}-nt gap on the ${strand} strand`);
    const range = strand === 'top' ? { from: gap.from, to: gap.from + action.length } : { from: gap.to - action.length, to: gap.to };
    if (overlapsInterval(missingOn(state, otherStrand(strand)), range)) ctx.fail(`no template: the ${otherStrand(strand)} strand is missing across ${range.from}–${range.to}`);
    state.missing = withStrandIntervals(state.missing, strand, subtractInterval(missingOn(state, strand), range));
    state.nascent = withStrandIntervals(state.nascent, strand, addInterval(nascentRun(strand), range));
    writeNucleicState(actor, state);
  },
});

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
    const { site, actor, state, length } = strandTarget(action.target, ctx);
    const range = site.span
      ? { from: site.span[0], to: site.span[1] }
      : (from => ({ from, to: from + action.length! }))(site.at! - Math.floor(action.length! / 2));
    if (range.from < 0 || range.to > length) ctx.fail(`a ${range.to - range.from}-nt bubble at "${action.target}" runs past the molecule ends (0–${length})`);
    for (const strand of ['top', 'bottom'] as const) {
      if (overlapsInterval(missingOn(state, strand), range)) ctx.fail(`cannot unwind ${range.from}–${range.to}: the ${strand} strand is missing there`);
    }
    if (overlapsInterval(state.open, range)) ctx.fail(`${range.from}–${range.to} is already unwound`);
    state.open = addInterval(state.open, range);
    writeNucleicState(actor, state);
  },
});

interface AnnealAction extends ActionSpec { target: string }
export const anneal = definePrimitive<AnnealAction>({
  type: 'anneal',
  description: 'Re-pair the unwound bubble at a site.',
  fields: { target: field.site({ required: true, description: 'Site with a coordinate inside or at the edge of the bubble.' }) },
  presentation: { verb: 'anneals' },
  validate(action, ctx) { requireCoordinate(action.target, ctx, { duplex: true }); },
  apply(_state, action, ctx) {
    const { site, actor, state } = strandTarget(action.target, ctx);
    const probe = siteInterval(site)!;
    const bubble = state.open.find(region => region.from <= probe.to && probe.from <= region.to);
    if (!bubble) ctx.fail(`no unwound region at "${action.target}" to anneal`);
    state.open = state.open.filter(region => region !== bubble);
    writeNucleicState(actor, state);
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
  recruit,
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
