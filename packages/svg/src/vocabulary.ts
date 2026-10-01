import {
  contactOffset, firstContact, nascentStrandGeometry, primitiveCss, proteinAnchors, proteinGeometry, proteinOutlineWidth, renderActionVisual,
  renderCompartmentPrimitive, renderInteractionPrimitive, renderMembranePrimitive, renderNucleicAcidPrimitive,
  renderProteinPrimitive, renderSmallMoleculePrimitive, renderTransmembranePrimitive, transmembraneGeometry, PROTEIN_MORPHOLOGIES,
  type ActionVisualKind, type CompartmentVisualKind, type ContactShape, type ContactSide, type ModificationVisualKind, type ProteinAnchors, type ProteinVisualState, type TransmembraneOptions, type VisualLesion,
} from './primitives';

export type VocabularyCategory =
  | 'proteins' | 'protein-identity' | 'nucleic-acids' | 'enzymatic-actions' | 'modifications'
  | 'dna-damage' | 'small-molecules' | 'gene-expression' | 'interactions'
  | 'membranes' | 'compartments' | 'receptors-complexes' | 'molecular-events' | 'test-scenes';
export type VocabularyVisual = 'protein' | 'nucleic-acid' | 'enzyme' | 'modification' | 'lesion'
  | 'molecule' | 'expression' | 'interaction' | 'membrane' | 'compartment' | 'receptor' | 'event' | 'test-scene';

export interface VocabularyItem {
  id: string; label: string; description: string; category: VocabularyCategory;
  visual: VocabularyVisual; color?: string; labels?: readonly string[];
}
export interface VocabularyRenderOptions { idPrefix?: string; width?: number; height?: number; decorative?: boolean }

export const VOCABULARY_CATEGORY_LABELS: Record<VocabularyCategory, string> = {
  proteins: 'Proteins and states', 'protein-identity': 'Protein identity test', 'nucleic-acids': 'Nucleic acids',
  'enzymatic-actions': 'Enzymatic actions', modifications: 'Post-translational modifications',
  'dna-damage': 'DNA damage and lesions', 'small-molecules': 'Small molecules and cofactors',
  'gene-expression': 'RNA and gene expression', interactions: 'Interactions and binding',
  membranes: 'Membranes', compartments: 'Compartments',
  'receptors-complexes': 'Receptors and complexes', 'molecular-events': 'Molecular events',
  'test-scenes': 'Renderer test scenes',
};

const make = (category: VocabularyCategory, visual: VocabularyVisual) =>
  (id: string, label: string, description: string, color?: string): VocabularyItem => ({ id, label, description, category, visual, color });
const protein = make('proteins', 'protein'); const acid = make('nucleic-acids', 'nucleic-acid');
const enzyme = make('enzymatic-actions', 'enzyme'); const modification = make('modifications', 'modification');
const lesion = make('dna-damage', 'lesion'); const molecule = make('small-molecules', 'molecule');
const expression = make('gene-expression', 'expression'); const interaction = make('interactions', 'interaction');
const membrane = make('membranes', 'membrane'); const compartment = make('compartments', 'compartment');
const receptor = make('receptors-complexes', 'receptor'); const event = make('molecular-events', 'event');
const testScene = make('test-scenes', 'test-scene');
const identity = make('protein-identity', 'protein');
/** Seeds match the PARP1 mechanism actor ids, so each card shows the silhouette used there. */
const IDENTITY_PROTEINS = [['parp1', 'PARP1'], ['xrcc1', 'XRCC1'], ['polb', 'POLβ'], ['lig3', 'LIG3'], ['ogg1', 'OGG1'], ['ape1', 'APE1']] as const;
const IDENTITY_STATES = ['normal', 'active', 'inhibited', 'future'] as const;
const IDENTITY_COLOR = '#7774d8';
const STATE_PROTEIN_SEED = 'reference-protein';

export const MOLECULAR_VOCABULARY: readonly VocabularyItem[] = [
  protein('protein-normal','Normal','A stable, conceptual protein surface.','#7774d8'),
  protein('protein-active','Active','A subtle halo communicates activity.','#7774d8'),
  protein('protein-inactive','Inactive','Lower contrast communicates inactivity.','#7774d8'),
  protein('protein-inhibited','Inhibited','A consistent inhibition ring and slash.','#7774d8'),
  protein('protein-degraded','Degraded','Fragments disperse while identity remains legible.','#7774d8'),
  protein('protein-selected','Selected','Selection is distinct from biological activity.','#7774d8'),
  protein('protein-future','Future / preview','Blurred, muted and non-interactive.','#7774d8'),
  protein('protein-morphologies','Morphology families','Six deterministic silhouette families, distinguishable in a single colour.','#7774d8'),
  ...IDENTITY_PROTEINS.map(([seed, name]) => identity(`identity-${seed}`, name, 'Same colour and size as every identity card: only the silhouette differs.', IDENTITY_COLOR)),
  ...IDENTITY_STATES.map(state => identity(`identity-parp1-${state}`, `PARP1 · ${state}`, 'Same silhouette as PARP1: only the state presentation changes.', IDENTITY_COLOR)),
  acid('double-stranded-dna','Double-stranded DNA','Front and rear strands create restrained depth.'),
  acid('single-stranded-dna','Single-stranded DNA','An exposed DNA strand.'),
  acid('generic-rna','Generic RNA','A single conceptual RNA strand.'), acid('mrna','mRNA','Messenger RNA.'),
  acid('unwound-dna','Unwound DNA','Paired strands separate without changing identity.'),
  acid('resected-dna','Resected DNA','Single-stranded overhang after end resection.'),
  acid('elongating-dna','Elongating strand','A nascent strand is extended from its free 3′ end along a continuous template.'),
  acid('repaired-dna','Repaired DNA','Continuous, intact double-stranded DNA.'),
  enzyme('kinase','Kinase','ATP-dependent phosphate transfer.'),
  enzyme('phosphatase','Phosphatase','Removal of a phosphate group.'),
  enzyme('protease','Protease','Cleavage of a protein substrate.'), enzyme('nuclease','Nuclease','Cleavage of a nucleic acid.'),
  enzyme('polymerase','Polymerase','Template-directed nucleic-acid synthesis.'),
  enzyme('helicase','Helicase','ATP-driven strand separation.'), enzyme('ligase','Ligase','Joining discontinuous DNA ends.'),
  enzyme('glycosylase','Glycosylase','Damaged-base removal creates an AP site.'),
  enzyme('transferase','Transferase','Transfer of a generic chemical group.'),
  enzyme('ubiquitin-ligase','E3 ubiquitin ligase','Attachment of ubiquitin to a substrate.'),
  enzyme('deacetylase','Deacetylase','Removal of an acetyl group.'),
  enzyme('atpase','ATPase / GTPase','Nucleotide hydrolysis coupled to state change.'),
  modification('phosphorylation','Phosphorylation','P marker physically attached to its actor.'),
  modification('acetylation','Acetylation','Ac marker using the shared marker system.'),
  modification('methylation','Methylation','Me marker using the shared marker system.'),
  modification('ubiquitination','Ubiquitination','Ubiquitin is a small protein: a chain of linked ubiquitins on the substrate surface.'),
  modification('sumoylation','SUMOylation','SUMO marker attached to a protein.'),
  modification('glycosylation','Glycosylation','A compact conceptual sugar marker.'),
  modification('parylation-linear','Linear PARylation','A connected linear PAR chain.'),
  modification('parylation-branched','Branched PARylation','A connected branched PAR chain.'),
  lesion('damaged-base','Damaged base','A visibly altered base pair.'), lesion('ap-site','AP site','A missing base is an empty site.'),
  lesion('mismatch','Mismatch','Bases pair with displaced geometry.'), lesion('nick','Nick','A small discontinuity in one backbone.'),
  lesion('ssb','Single-strand break','One strand is broken while the other remains intact.'),
  lesion('dsb','Double-strand break','Both backbones are physically discontinuous.'),
  lesion('crosslink','Crosslink','An anomalous bridge crosses the helix.'), lesion('adduct','DNA adduct','A bulky group projects from a base.'),
  molecule('atp','ATP','Conceptual ball-and-stick ATP.'), molecule('adp','ADP','Conceptual ball-and-stick ADP.'),
  molecule('gtp','GTP','Conceptual ball-and-stick GTP.'), molecule('gdp','GDP','Conceptual ball-and-stick GDP.'),
  molecule('nad-plus','NAD⁺','Oxidized nicotinamide adenine dinucleotide.'), molecule('nadh','NADH','Reduced nicotinamide adenine dinucleotide.'),
  molecule('cgamp','cGAMP','A cyclic dinucleotide messenger.'), molecule('glucose','Glucose','A compact carbohydrate representation.'),
  molecule('calcium','Ca²⁺','A labeled ion.','#9368d8'), molecule('zinc','Zn²⁺','A labeled ion.','#8290a8'),
  expression('promoter-gene','Promoter and gene','A regulatory DNA region followed by a gene.'),
  expression('transcription-factor','Transcription factor','A protein bound to a regulatory region.'),
  expression('transcription','Transcription','RNA polymerase produces mRNA from DNA.'),
  expression('translation','Translation','A ribosome produces a polypeptide from mRNA.'),
  expression('ribosome','Ribosome','A conceptual ribonucleoprotein assembly.'), expression('nucleosome','Nucleosome','DNA wrapped around a histone core.'),
  interaction('bind','Bind','Two separate partners come into direct surface contact.'), interaction('unbind','Unbind','Touching partners separate; their surfaces no longer meet.'),
  interaction('recruit','Recruit','One actor is drawn toward a partner: a directed relation, not yet contact.'), interaction('dimerize','Dimerize','Two copies of the same protein touch to form a dimer.'),
  interaction('complex-abc','A:B:C complex','Three distinct proteins touch as one unit; each remains selectable.'),
  membrane('membrane-horizontal','Horizontal membrane','A reusable lipid bilayer.'),
  membrane('membrane-vertical','Vertical membrane','The same bilayer vertically.'), membrane('membrane-curved','Curved membrane','A gently curved bilayer.'),
  membrane('membrane-closed','Closed membrane','The same bilayer closed on itself, with inner and outer leaflets.'),
  compartment('extracellular','Extracellular space','Outside the cell: banded matrix fibres and sparse particles.'), compartment('cytoplasm','Cytoplasm','Crowded soluble interior: fine solutes, a faint filament, no organelles.'),
  compartment('nucleus','Nucleus','Double envelope crossed by pores, around a dense nucleolus.'), compartment('generic-organelle','Generic organelle','A single closed bilayer around a lumen.'),
  compartment('er','Endoplasmic reticulum','One lumen shaped into a network of connected tubules.'), compartment('golgi','Golgi apparatus','Stacked curved cisternae; vesicles leave the concave trans face.'),
  compartment('mitochondrion','Mitochondrion','Double membrane whose inner bilayer folds into cristae.'), compartment('lysosome','Lysosome','A round vesicle whose lumen is packed with dense material.'),
  compartment('endosome','Endosome','A vesicle budding off, with membrane-bound cargo sorted into the bud.'),
  receptor('generic-receptor','Generic receptor','A membrane-spanning protein bound to ligand.'),
  receptor('rtk','Receptor tyrosine kinase','Ligand-driven dimerization and phosphorylation.'), receptor('gpcr','GPCR','A conceptual multi-pass receptor.'),
  receptor('ion-channel','Ion channel','A membrane pore with transported ions.'), receptor('proteasome','Proteasomal degradation','Ubiquitinated protein enters a proteolytic complex.'),
  ...(['bind','unbind','recruit','dimerize','activate','inhibit','phosphorylate','dephosphorylate','acetylate','ubiquitinate','parylate','cleave','ligate','polymerize','synthesize','degrade','translocate','unwind','elongate','conformational-change'] as const)
    .map(id => event(`event-${id}`, id.split('-').map(word => word[0]!.toUpperCase()+word.slice(1)).join(' '), `Generic ${id.replace('-', ' ')} event.`)),
  testScene('test-kinase','Kinase test','ATP + kinase + substrate → phosphorylated substrate + ADP.'),
  testScene('test-protease','Protease test','Protein substrate → peptide fragments.'),
  testScene('test-translocation','Translocation test','IRF3-P crosses the nuclear envelope.'),
];

const esc = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const at = (x:number,y:number,markup:string) => `<g transform="translate(${x} ${y})">${markup}</g>`;
const label = (text:string,x:number,y:number) => `<text class="mm-vocab__label" x="${x}" y="${y}">${esc(text)}</text>`;
const proteinAt = (seed:string,x:number,y:number,color:string,state:ProteinVisualState='normal',radius=34,mods:Parameters<typeof renderProteinPrimitive>[0]['modifications']=[]) =>
  at(x,y,renderProteinPrimitive({visualSeed:seed,fill:color,radius,state,modifications:mods}));

/*
 * Action arrows between catalogue elements. An end is a free point, an actor drawn with `proteinAt`
 * (same seed, radius and state), or a point with an explicit `reach` (e.g. a helix crossing). Actor
 * and reach ends keep ARROW_CLEARANCE px off the visible outline along the arrow, so no arrow ever
 * touches what it links; the arrow itself (shape, head, curvature) is entirely the shared primitive's.
 */
type ArrowEnd = Point & { seed?:string; radius?:number; state?:ProteinVisualState; reach?:number };
const ARROW_CLEARANCE=5;
/** Half-thickness of a backbone, or of a helix crossing, that an arrow points at. */
const STRAND_REACH=4;
/** Distance from an actor's centre to its visible outline along the unit direction (ux, uy): the support of its particle ellipses. */
function arrowReach(end:ArrowEnd,ux:number,uy:number):number {
  if(end.reach!==undefined) return end.reach;
  if(!end.seed||!end.radius) return 0;
  const margin=proteinOutlineWidth(end.radius); const scatter=end.state==='degraded'?2.05:1;
  const support=Math.max(...proteinGeometry(end.seed,end.radius).map(p=>{
    const t=p.rotation*Math.PI/180; const along=ux*Math.cos(t)+uy*Math.sin(t); const across=-ux*Math.sin(t)+uy*Math.cos(t);
    return (p.x*ux+p.y*uy)*scatter+Math.hypot(p.rx*along,p.ry*across)+margin;
  }));
  // The inhibition ring (radius + 8) is part of an inhibited actor's outline.
  return end.state==='inhibited'?Math.max(support,end.radius+9):support;
}
function actionArrow(kind:ActionVisualKind,from:ArrowEnd,to:ArrowEnd):string {
  const d=Math.hypot(to.x-from.x,to.y-from.y)||1; const ux=(to.x-from.x)/d; const uy=(to.y-from.y)/d;
  const gap=(end:ArrowEnd,sx:number,sy:number)=>{const reach=arrowReach(end,sx,sy); return reach?r1(reach+ARROW_CLEARANCE):0;};
  return renderActionVisual(kind,{x:from.x,y:from.y},{x:to.x,y:to.y},{startGap:gap(from,ux,uy),endGap:gap(to,-ux,-uy)});
}

/*
 * Binding grammar shared by the Interactions cards and the binding events:
 * relation / recruitment → dotted (directed) link; physical binding → touching surfaces placed by
 * `firstContact` (the outlines meet, no lobe buried in the partner); complex → several distinct
 * actors touching as one compact unit.
 * Each actor keeps its own group (`data-actor`), so members of a complex stay separately selectable.
 */
interface BindingActor { id:string; seed:string; color:string }
const PARTNER_A:BindingActor={id:'A',seed:'A',color:'#7774d8'};
const PARTNER_B:BindingActor={id:'B',seed:'B',color:'#54a488'};
/** Seed chosen for a third silhouette family, so A, B and C differ in grey as well as in colour. */
const PARTNER_C:BindingActor={id:'C',seed:'Cc',color:'#dd9957'};
/** A second copy of A for dimers: same seed and colour, its own actor id. */
const PARTNER_A2:BindingActor={...PARTNER_A,id:'A2'};
interface Placed { actor:BindingActor; radius:number; x:number; y:number; anchors:ProteinAnchors; shape:ContactShape; state:ProteinVisualState; touch?:Point; touches?:Point[] }
interface Point { x:number; y:number }
const NORMALS:Record<ContactSide,[number,number]>={left:[-1,0],right:[1,0],top:[0,-1],bottom:[0,1]};
const r1=(value:number)=>Math.round(value*10)/10;
const place=(actor:BindingActor,radius:number,x=0,y=0,state:ProteinVisualState='normal'):Placed=>{
  const particles=proteinGeometry(actor.seed,radius);
  return {actor,radius,x,y,state,anchors:proteinAnchors(particles,radius),shape:{particles,margin:proteinOutlineWidth(radius)}};
};
/** Where `partner` (at `at`) first touches `anchor`, in card coordinates. */
const fitAgainst=(anchor:Placed,partner:Placed,direction:ContactSide|Point,originX?:number)=>{
  const fit=firstContact(anchor.shape,partner.shape,direction,originX===undefined?{}:{origin:{x:originX-anchor.x,y:0}});
  return {x:anchor.x+fit.offset.x,y:anchor.y+fit.offset.y,touch:{x:r1(anchor.x+fit.point.x),y:r1(anchor.y+fit.point.y)}};
};
/** `partner` against `anchor` on `side` at first contact; a positive `gap` pulls it away along the same axis. */
const against=(anchor:Placed,partner:BindingActor,side:ContactSide='right',gap=0,state:ProteinVisualState='normal'):Placed=>{
  const placed=place(partner,anchor.radius,0,0,state); const fit=fitAgainst(anchor,placed,side); const [nx,ny]=NORMALS[side];
  return {...placed,x:r1(fit.x+nx*gap),y:r1(fit.y+ny*gap),touch:gap?undefined:fit.touch};
};
/** Moves a group (and its contact points) so the union of its visible bounds is centred on (cx, cy). */
const centred=(group:Placed[],cx:number,cy:number):Placed[]=>{
  const x0=Math.min(...group.map(p=>p.x+p.anchors.bounds.x)); const x1=Math.max(...group.map(p=>p.x+p.anchors.bounds.x+p.anchors.bounds.width));
  const y0=Math.min(...group.map(p=>p.y+p.anchors.bounds.y)); const y1=Math.max(...group.map(p=>p.y+p.anchors.bounds.y+p.anchors.bounds.height));
  const dx=cx-(x0+x1)/2; const dy=cy-(y0+y1)/2;
  const shift=(point:Point)=>({x:r1(point.x+dx),y:r1(point.y+dy)});
  return group.map(p=>({...p,x:r1(p.x+dx),y:r1(p.y+dy),...(p.touch&&{touch:shift(p.touch)}),...(p.touches&&{touches:p.touches.map(shift)})}));
};
const anchorOf=(p:Placed,side:ContactSide)=>({id:p.actor.id,x:r1(p.x+p.anchors[side].x),y:r1(p.y+p.anchors[side].y)});
const actor=(p:Placed)=>`<g transform="translate(${p.x} ${p.y})" data-actor="${esc(p.actor.id)}" data-radius="${p.radius}">${renderProteinPrimitive({visualSeed:p.actor.seed,fill:p.actor.color,radius:p.radius,state:p.state})}</g>`;
/** Contact shadow where two actors touch; drawn before them so it only shows in the crevice. */
const contact=(a:Placed,b:Placed,at:Point)=>renderInteractionPrimitive([{id:a.actor.id,...at},{id:b.actor.id,...at}],{kind:'contact'});

/** Two partners side by side, either touching (bound) or apart, centred on (cx, cy). */
function pairPanel(a:BindingActor,b:BindingActor,cx:number,cy:number,radius:number,bound:boolean):string {
  const first=place(a,radius); const [left,right]=centred([first,against(first,b,'right',bound?0:radius*.6)],cx,cy);
  return `${bound?contact(left!,right!,right!.touch!):''}${actor(left!)}${actor(right!)}`;
}

/** Before → after for bind, unbind and dimerize: the only change is whether the surfaces touch. */
function bindingTransition(id:'bind'|'unbind'|'dimerize',radius:number):string {
  const partner=id==='dimerize'?PARTNER_A2:PARTNER_B;
  const bound=id!=='unbind';
  return `${pairPanel(PARTNER_A,partner,70,104,radius,!bound)}${renderActionVisual(id,{x:131,y:104},{x:169,y:104})}${pairPanel(PARTNER_A,partner,230,104,radius,bound)}`;
}

/**
 * B approaches A: a faded trace of B where it started, B nearer A, and a directed dotted relation
 * A ·····→ B. B travels left to right because action arrows always point rightwards.
 */
function recruitScene(radius:number):string {
  const a=place(PARTNER_A,radius,238,116);
  const near=against(a,PARTNER_B,'left',radius*1.9);
  const start=against(a,PARTNER_B,'left',radius*5.2,'future');
  const from=anchorOf(a,'left'); const to=anchorOf(near,'right');
  const relation=renderInteractionPrimitive([{...from,x:r1(from.x-5)},{...to,x:r1(to.x+5)}],{kind:'directed'});
  const motionY=r1(Math.min(near.y+near.anchors.bounds.y,start.y+start.anchors.bounds.y)-10);
  return `${actor(start)}${renderActionVisual('recruit',{x:r1(start.x),y:motionY},{x:r1(near.x-4),y:motionY})}${relation}${actor(a)}${actor(near)}`;
}

/**
 * Three distinct actors as one compact unit, not a row: A and B touch side by side and C nestles
 * into the crevice beneath them, touching both. C approaches from below; its approach axis slides
 * between A and B until it meets both outlines at once (bisection on first contact).
 */
function complexScene(radius:number):string {
  const a=place(PARTNER_A,radius); const b=against(a,PARTNER_B,'right'); const c=place(PARTNER_C,radius);
  const below={x:0,y:1};
  let lo=a.x; let hi=b.x; let fitA=fitAgainst(a,c,below,lo); let fitB=fitAgainst(b,c,below,lo);
  for(let i=0;i<18;i++){
    const mid=(lo+hi)/2; fitA=fitAgainst(a,c,below,mid); fitB=fitAgainst(b,c,below,mid);
    if(fitA.y>fitB.y) lo=mid; else hi=mid;
  }
  // The first outline met along the axis decides where C stops; the other is touched within a fraction of a px.
  const stop=fitA.y>=fitB.y?fitA:fitB;
  const nested:Placed={...c,x:r1(stop.x),y:r1(stop.y),touches:[fitA.touch,fitB.touch]};
  const [pa,pb,pc]=centred([a,b,nested],150,96);
  return `${contact(pa!,pb!,pb!.touch!)}${contact(pa!,pc!,pc!.touches![0]!)}${contact(pb!,pc!,pc!.touches![1]!)}${actor(pa!)}${actor(pb!)}${actor(pc!)}`;
}

function interactionScene(id:string,radius:number):string {
  if(id==='bind'||id==='unbind'||id==='dimerize') return bindingTransition(id,radius);
  if(id==='recruit') return recruitScene(radius);
  return complexScene(radius);
}

function enzymeScene(id:string):string {
  const center=proteinAt(id,150,68,'#6f72d8','normal',37);
  if(id==='protease') return `${center}${proteinAt('substrate',55,128,'#8b94d8','normal',24)}${proteinAt('fragment-a',235,128,'#8b94d8','degraded',20)}${actionArrow('cleave',{x:55,y:128,seed:'substrate',radius:24},{x:235,y:128,seed:'fragment-a',radius:20,state:'degraded'})}`;
  if(id==='nuclease') return `${center}${at(25,130,renderNucleicAcidPrimitive({width:250,lesion:'dsb'}))}${actionArrow('cleave',{x:150,y:68,seed:id,radius:37},{x:150,y:130,reach:STRAND_REACH})}`;
  if(id==='polymerase') {
    const dna={x:25,y:136,width:250,state:'elongating' as const}; const {threePrime:end,follow}=nascentStrandGeometry(dna);
    return `${renderNucleicAcidPrimitive(dna)}<g ${follow}>${proteinAt(id,end.x+8,end.y-30,'#6f72d8','normal',32)}</g>`;
  }
  if(id==='helicase'||id==='ligase'||id==='glycosylase') {
    const state=id==='helicase'?'unwound':'normal'; const dnaLesion=id==='ligase'?'nick':id==='glycosylase'?'ap-site':undefined;
    return `${center}${at(25,130,renderNucleicAcidPrimitive({width:250,state,lesion:dnaLesion}))}${id==='helicase'?renderSmallMoleculePrimitive({visualSeed:'ATP',label:'ATP',x:42,y:45,scale:.6}):''}${actionArrow(id==='ligase'?'ligate':id==='helicase'?'unwind':'modify',{x:150,y:68,seed:id,radius:37},{x:150,y:130,reach:STRAND_REACH})}`;
  }
  const before:ModificationVisualKind|undefined=id==='phosphatase'?'phosphorylation':id==='deacetylase'?'acetylation':undefined;
  const after:ModificationVisualKind|undefined=id==='kinase'?'phosphorylation':id==='transferase'?'acetylation':id==='ubiquitin-ligase'?'ubiquitination':undefined;
  return `${['kinase','atpase'].includes(id)?renderSmallMoleculePrimitive({visualSeed:'ATP',label:'ATP',x:42,y:45,scale:.6}):''}${proteinAt(`${id}-substrate`,55,128,'#8b94d8','normal',24,before?[{kind:before}]:[])}${center}${proteinAt(`${id}-substrate`,245,128,'#8b94d8',id==='atpase'?'active':'normal',24,after?[{kind:after,length:3}]:[])}${actionArrow('modify',{x:55,y:128,seed:`${id}-substrate`,radius:24},{x:245,y:128,seed:`${id}-substrate`,radius:24,state:id==='atpase'?'active':'normal'})}`;
}

function expressionScene(id:string):string {
  if(id==='ribosome'||id==='translation') return `${at(28,130,renderNucleicAcidPrimitive({kind:'mrna',width:245}))}${proteinAt('ribosome',150,92,'#4c91e7','normal',45)}${actionArrow('synthesize',{x:150,y:92,seed:'ribosome',radius:45},{x:225,y:30})}`;
  if(id==='nucleosome') return `${at(25,106,renderNucleicAcidPrimitive({width:250}))}${proteinAt('histone-core',150,106,'#557ac1','normal',38)}`;
  const dna=at(25,128,renderNucleicAcidPrimitive({width:250}));
  if(id==='promoter-gene') return `${dna}${label('promoter',82,82)}${label('gene',215,82)}`;
  if(id==='transcription-factor') return `${dna}${renderInteractionPrimitive([{id:'tf',x:92,y:118},{id:'promoter',x:92,y:128}])}${proteinAt('TF',92,96,'#8068e8','active',30)}`;
  return `${dna}${proteinAt('RNA-Pol-II',150,96,'#4f8ad7','active',38)}${at(162,55,renderNucleicAcidPrimitive({kind:'mrna',width:112}))}${actionArrow('synthesize',{x:150,y:96,seed:'RNA-Pol-II',radius:38},{x:205,y:58,reach:STRAND_REACH})}`;
}

function receptorScene(id:string):string {
  if(id==='proteasome') return `${proteinAt('target',55,67,'#7e83d5','normal',25,[{kind:'ubiquitination',length:3}])}${proteinAt('proteasome',150,110,'#4c91e7','active',48)}${proteinAt('peptides',246,112,'#7e83d5','degraded',20)}${actionArrow('degrade',{x:55,y:67,seed:'target',radius:25},{x:150,y:110,seed:'proteasome',radius:48,state:'active'})}`;
  const sides=`${label('EXTRACELLULAR',58,16)}${label('CYTOSOL',40,174)}`;
  return `${sides}${renderMembranePrimitive(RECEPTOR_MEMBRANE)}${id==='rtk'?dimerReceptorScene():id==='gpcr'?multiPassScene():id==='ion-channel'?channelScene():singlePassScene()}`;
}

/*
 * Receptors compose one generic membrane-spanning chain (renderTransmembranePrimitive) over the shared
 * bilayer. The top leaflet faces the extracellular side; ligands touch the outer domain anchor-to-anchor
 * (binding = contact, no dotted link) and receptor dimers touch through their domains.
 */
const RECEPTOR_MEMBRANE={x:20,y:96,length:260} as const;
const RECEPTOR_CENTRE=RECEPTOR_MEMBRANE.length/2;
const LIGAND:BindingActor={id:'ligand',seed:'ligand',color:'#e79ac6'};
const unit=(id:string,options:TransmembraneOptions)=>`<g data-actor="${esc(id)}">${renderTransmembranePrimitive(options)}</g>`;
/** A small protein ligand pressed onto the outer domain's top anchor; the contact shadow is returned separately so it can sit underneath. */
function ligandOn(target:ProteinAnchors,id:string,radius=10){
  const ligand=place({...LIGAND,id},radius); const offset=contactOffset(target,ligand.anchors,'top');
  const placed={...ligand,x:offset.x,y:offset.y};
  return {shadow:renderInteractionPrimitive([{id:'receptor',...target.top},anchorOf(placed,'bottom')],{kind:'contact'}),markup:actor(placed)};
}

/** Outer domain + one membrane-spanning segment + cytosolic domain, with a ligand bound outside. */
function singlePassScene():string {
  const options:TransmembraneOptions={visualSeed:'receptor',membrane:RECEPTOR_MEMBRANE,fill:'#5b95e0',outside:{radius:28},inside:{radius:23}};
  const ligand=ligandOn(transmembraneGeometry(options).outsideAnchors!,'ligand',11);
  return `${ligand.shadow}${unit('receptor',options)}${ligand.markup}`;
}

/** Two copies of the same single-pass receptor, mirror images touching through their domains, each with a ligand and phosphorylated cytosolic domain. */
function dimerReceptorScene():string {
  const options=(along:number,mirror:boolean):TransmembraneOptions=>({visualSeed:'rtk',membrane:RECEPTOR_MEMBRANE,along,mirror,fill:'#4f86d6',outside:{radius:23},inside:{radius:19},
    modifications:[{kind:'phosphorylation',side:'inside',angle:Math.PI/2+.4},{kind:'phosphorylation',side:'inside',angle:Math.PI/2+1.5}]});
  const probeA=transmembraneGeometry(options(RECEPTOR_CENTRE,false)); const probeB=transmembraneGeometry(options(RECEPTOR_CENTRE,true));
  // The spacing that makes either pair of facing domains touch, whichever needs more room; spans never closer than 16 px.
  const spacing=Math.max(16,contactOffset(probeA.outsideAnchors!,probeB.outsideAnchors!,'right').x,contactOffset(probeA.insideAnchors!,probeB.insideAnchors!,'right').x);
  const left=options(r1(RECEPTOR_CENTRE-spacing/2),false); const right=options(r1(RECEPTOR_CENTRE+spacing/2),true);
  const a=transmembraneGeometry(left); const b=transmembraneGeometry(right);
  const touching=(p:ProteinAnchors,q:ProteinAnchors)=>Math.hypot(p.right.x-q.left.x,p.right.y-q.left.y)<=3;
  const contacts=([[a.outsideAnchors!,b.outsideAnchors!],[a.insideAnchors!,b.insideAnchors!]] as const).filter(([p,q])=>touching(p,q))
    .map(([p,q])=>renderInteractionPrimitive([{id:'R1',...p.right},{id:'R2',...q.left}],{kind:'contact'})).join('');
  const la=ligandOn(a.outsideAnchors!,'ligand-1'); const lb=ligandOn(b.outsideAnchors!,'ligand-2');
  return `${contacts}${la.shadow}${lb.shadow}${unit('R1',left)}${unit('R2',right)}${la.markup}${lb.markup}`;
}

/** One chain crossing the bilayer seven times: alternating loops on both sides, free ends on opposite sides. */
function multiPassScene():string {
  return unit('receptor',{visualSeed:'gpcr',membrane:RECEPTOR_MEMBRANE,passes:7,spacing:17,fill:'#3f9f8a'});
}

/** Two walls around an open pore; ions queue at the outer mouth, one is inside the pore and one leaves it. */
function channelScene():string {
  const options:TransmembraneOptions={visualSeed:'channel',membrane:RECEPTOR_MEMBRANE,passes:6,pore:true,spacing:15,poreWidth:14,fill:'#8a72cf'};
  const pore=transmembraneGeometry(options).pore!; const x=pore.outside.x;
  const ions=[[x-9,pore.outside.y-26],[x+8,pore.outside.y-20],[x,pore.outside.y-8],[x,(pore.outside.y+pore.inside.y)/2],[x+2,pore.inside.y+13]]
    .map(([ix,iy])=>renderSmallMoleculePrimitive({visualSeed:'ion',x:r1(ix!),y:r1(iy!),scale:.5,ion:true})).join('');
  return `${unit('channel',options)}${ions}`;
}

function eventScene(rawId:string):string {
  const id=rawId.replace(/^event-/,''); const before=id==='dephosphorylate'?[{kind:'phosphorylation' as const}]:[];
  const map:Record<string,ModificationVisualKind>={phosphorylate:'phosphorylation',acetylate:'acetylation',ubiquitinate:'ubiquitination',parylate:'parylation'};
  const after=map[id]?[{kind:map[id]!,length:id==='ubiquitinate'?3:undefined,branched:id==='parylate'}]:[];
  const finalState:ProteinVisualState=id==='activate'?'active':id==='inhibit'?'inhibited':id==='degrade'?'degraded':'normal';
  const action=(map[id]?'modify':id) as ActionVisualKind;
  if(id==='bind'||id==='unbind'||id==='dimerize'||id==='recruit') return interactionScene(id,24);
  if(id==='cleave'||id==='degrade') return `${proteinAt('event-actor',60,108,'#7774d8','normal',29)}${actionArrow(id as ActionVisualKind,{x:60,y:108,seed:'event-actor',radius:29},{x:238,y:108,seed:'event-fragments',radius:25,state:'degraded'})}${proteinAt('event-fragments',238,108,'#7774d8','degraded',25)}`;
  if(id==='polymerize') return `${proteinAt('event-actor',72,108,'#7774d8','normal',29)}${actionArrow('polymerize',{x:72,y:108,seed:'event-actor',radius:29},{x:215,y:108,seed:'event-actor',radius:29})}${proteinAt('event-actor',215,108,'#7774d8','normal',29,[{kind:'parylation',length:7}])}`;
  if(id==='translocate') return `${label('CYTOPLASM',45,22)}${label('NUCLEUS',40,166)}${renderMembranePrimitive({x:20,y:92,length:260})}${proteinAt('event-actor',150,52,'#7774d8','active',24)}${proteinAt('event-actor',150,140,'#7774d8','active',24)}${actionArrow('translocate',{x:150,y:52,seed:'event-actor',radius:24,state:'active'},{x:150,y:140,seed:'event-actor',radius:24,state:'active'})}`;
  if(id==='elongate') {
    const dna={x:25,y:112,width:250,state:'elongating' as const,showDirectionality:true}; const {fivePrime,threePrime}=nascentStrandGeometry(dna);
    return `${renderNucleicAcidPrimitive(dna)}${renderActionVisual('elongate',{x:fivePrime.x+30,y:fivePrime.y-34},{x:threePrime.x-10,y:threePrime.y-34})}`;
  }
  if(['unwind','ligate'].includes(id)) return `${at(25,108,renderNucleicAcidPrimitive({width:250,state:id==='unwind'?'unwound':'normal',lesion:id==='ligate'?'nick':undefined}))}${actionArrow(action,{x:80,y:55},{x:150,y:108,reach:STRAND_REACH})}`;
  return `${proteinAt('event-actor',62,108,'#7774d8','normal',29,before)}${proteinAt('event-actor',238,108,'#7774d8',finalState,29,after)}${actionArrow(action,{x:62,y:108,seed:'event-actor',radius:29},{x:238,y:108,seed:'event-actor',radius:29,state:finalState})}`;
}

function art(entry:VocabularyItem):string {
  if(entry.id==='protein-morphologies') return PROTEIN_MORPHOLOGIES.map((family,i)=>{const x=55+(i%3)*95; const y=50+Math.floor(i/3)*78; return `${at(x,y,renderProteinPrimitive({visualSeed:`morphology-${family}`,morphology:family,fill:entry.color,radius:25}))}${label(family,x,y+39)}`;}).join('');
  if(entry.category==='protein-identity') { const [, seed, state='normal']=entry.id.split('-') as [string,string,ProteinVisualState?]; return proteinAt(seed,150,98,entry.color??IDENTITY_COLOR,state,52); }
  // Every state card shows the same protein, so the page proves that state never alters identity.
  if(entry.category==='proteins') return proteinAt(STATE_PROTEIN_SEED,150,98,entry.color??'#7774d8',entry.id.replace('protein-','') as ProteinVisualState,52);
  if(entry.category==='nucleic-acids') {
    const kind=entry.id==='generic-rna'?'rna':entry.id==='mrna'?'mrna':entry.id==='single-stranded-dna'?'ssdna':'dsdna';
    const state=entry.id.startsWith('unwound')?'unwound':entry.id.startsWith('resected')?'resected':entry.id.startsWith('elongating')?'elongating':entry.id.startsWith('repaired')?'repaired':'normal';
    return at(30,100,renderNucleicAcidPrimitive({kind,state,width:240}));
  }
  if(entry.category==='enzymatic-actions') return enzymeScene(entry.id);
  if(entry.category==='modifications') { const kind=entry.id.startsWith('parylation')?'parylation':entry.id as ModificationVisualKind; return proteinAt('modified-protein',130,104,'#7774d8','normal',44,[{kind,length:entry.id.includes('parylation')?8:entry.id==='ubiquitination'?4:undefined,branched:entry.id.endsWith('branched')}]); }
  if(entry.category==='dna-damage') return at(30,100,renderNucleicAcidPrimitive({width:240,lesion:entry.id as VisualLesion}));
  if(entry.category==='small-molecules') return renderSmallMoleculePrimitive({visualSeed:entry.id,label:entry.label,x:150,y:100,scale:1.25,ion:entry.id==='calcium'||entry.id==='zinc'});
  if(entry.category==='gene-expression') return expressionScene(entry.id);
  if(entry.category==='interactions') return interactionScene(entry.id,entry.id==='complex-abc'?30:26);
  if(entry.id==='membrane-closed') return renderMembranePrimitive({shape:{kind:'ellipse',cx:150,cy:96,rx:105,ry:58}});
  if(entry.category==='membranes') return renderMembranePrimitive({x:entry.id.endsWith('vertical')?150:25,y:entry.id.endsWith('vertical')?15:entry.id.endsWith('curved')?108:96,length:entry.id.endsWith('vertical')?150:250,orientation:entry.id.replace('membrane-','') as 'horizontal'|'vertical'|'curved'});
  if(entry.category==='compartments') return renderCompartmentPrimitive(entry.id==='generic-organelle'?'organelle':entry.id as CompartmentVisualKind,{x:20,y:15},{width:260,height:150});
  if(entry.category==='receptors-complexes') return receptorScene(entry.id);
  if(entry.category==='molecular-events') return eventScene(entry.id);
  if(entry.id==='test-kinase') return enzymeScene('kinase'); if(entry.id==='test-protease') return enzymeScene('protease');
  return `${label('CYTOPLASM',45,24)}${label('NUCLEUS',40,165)}${renderMembranePrimitive({x:20,y:93,length:260})}${proteinAt('IRF3',150,52,'#7774d8','active',27,[{kind:'phosphorylation'}])}${proteinAt('IRF3',150,140,'#7774d8','active',27,[{kind:'phosphorylation'}])}${actionArrow('translocate',{x:150,y:52,seed:'IRF3',radius:27,state:'active'},{x:150,y:140,seed:'IRF3',radius:27,state:'active'})}`;
}

/** Backwards-compatible wrappers around the generic primitives. */
export const proteinSurface=(seed:string,x:number,y:number,radius:number,fill:string)=>proteinAt(seed,x,y,fill,'normal',radius);
export const smallMolecule=(seed:string,x:number,y:number,scale=1)=>renderSmallMoleculePrimitive({visualSeed:seed,x,y,scale});
export const nucleicAcid=(x:number,y:number,width:number,mode:'double'|'single'|'break'='double')=>at(x,y,renderNucleicAcidPrimitive({kind:mode==='single'?'ssdna':'dsdna',width,lesion:mode==='break'?'dsb':undefined}));

export function renderVocabularyGlyph(entryOrId:VocabularyItem|string,options:VocabularyRenderOptions={}):string {
  const entry=typeof entryOrId==='string'?MOLECULAR_VOCABULARY.find(candidate=>candidate.id===entryOrId):entryOrId;
  if(!entry) throw new Error(`Unknown molecular vocabulary item: ${entryOrId}`);
  const prefix=esc(options.idPrefix??`mm-vocab-${entry.id}`); const accessible=options.decorative?'aria-hidden="true"':`role="img" aria-labelledby="${prefix}-title ${prefix}-desc"`;
  const title=options.decorative?'':`<title id="${prefix}-title">${esc(entry.label)}</title><desc id="${prefix}-desc">${esc(entry.description)}</desc>`;
  return `<svg class="mm-vocab__svg" viewBox="0 0 300 180" width="${options.width??300}" height="${options.height??180}" ${accessible} xmlns="http://www.w3.org/2000/svg">${title}<style>${VOCABULARY_SVG_CSS}</style>${art(entry)}</svg>`;
}

export const VOCABULARY_SVG_CSS=`${primitiveCss}
.mm-vocab__svg{display:block;max-width:100%;height:auto;overflow:visible;color:#18213a;font-family:Inter,system-ui,sans-serif}.mm-vocab__label{text-anchor:middle;fill:currentColor;font-size:10px;font-weight:650;letter-spacing:.02em}.mm-vocab__svg .mm-primitive--interaction:not(.mm-interaction--directed) path{vector-effect:non-scaling-stroke}@media(prefers-color-scheme:dark){.mm-vocab__svg{color:#e7ecf6}.mm-modification rect{stroke:#dce4f2}}`;
