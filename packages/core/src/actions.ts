import { ActionRegistry, defineAlias, definePrimitive, field } from './registry';
import type { ActionSpec, Activity, LesionType } from './types';

export const ACTIVITIES: readonly Activity[] = ['active', 'inactive', 'inhibited'];
export const LESIONS: readonly LesionType[] = ['single-strand-break', 'double-strand-break', 'base-damage', 'abasic-site', 'adduct'];
const BREAKS: readonly LesionType[] = ['single-strand-break', 'double-strand-break'];

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
  validate(action, ctx) { requireNucleicAcid(action.target, ctx); },
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
    delete site.lesion;
  },
});

function requireNucleicAcid(reference: string, ctx: { definition: { actors: { id: string; type: string }[] }; issue(message: string): void }) {
  const actor = ctx.definition.actors.find(item => item.id === actorOf(reference));
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
  siteLesion('repair', 'none', 'repairs'),
];

export const builtinRegistry = new ActionRegistry(builtinActions);
