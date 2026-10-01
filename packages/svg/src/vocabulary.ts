import {
  contactOffset, nascentStrandGeometry, primitiveCss, proteinAnchors, proteinGeometry, renderActionVisual,
  renderCompartmentPrimitive, renderInteractionPrimitive, renderMembranePrimitive, renderNucleicAcidPrimitive,
  renderProteinPrimitive, renderSmallMoleculePrimitive, PROTEIN_MORPHOLOGIES,
  type ActionVisualKind, type ContactSide, type ModificationVisualKind, type ProteinAnchors, type ProteinVisualState, type VisualLesion,
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
  modification('ubiquitination','Ubiquitination','Single ubiquitin or a connected chain.'),
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
  compartment('extracellular','Extracellular space','Sparse extracellular context.'), compartment('cytoplasm','Cytoplasm','Subtle intracellular context.'),
  compartment('nucleus','Nucleus','A schematic nucleus.'), compartment('generic-organelle','Generic organelle','A neutral membrane-bound compartment.'),
  compartment('er','Endoplasmic reticulum','A schematic membrane network.'), compartment('golgi','Golgi apparatus','A stack of curved cisternae.'),
  compartment('mitochondrion','Mitochondrion','An organelle with a cristae cue.'), compartment('lysosome','Lysosome','A compact degradative compartment.'),
  compartment('endosome','Endosome','A compact trafficking compartment.'),
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
 * Binding grammar shared by the Interactions cards and the binding events:
 * relation / recruitment → dotted (directed) link; physical binding → touching surfaces placed
 * anchor-to-anchor with `contactOffset`; complex → several distinct actors touching as one unit.
 * Each actor keeps its own group (`data-actor`), so members of a complex stay separately selectable.
 */
interface BindingActor { id:string; seed:string; color:string }
const PARTNER_A:BindingActor={id:'A',seed:'A',color:'#7774d8'};
const PARTNER_B:BindingActor={id:'B',seed:'B',color:'#54a488'};
/** Seed chosen for a third silhouette family, so A, B and C differ in grey as well as in colour. */
const PARTNER_C:BindingActor={id:'C',seed:'Cc',color:'#dd9957'};
/** A second copy of A for dimers: same seed and colour, its own actor id. */
const PARTNER_A2:BindingActor={...PARTNER_A,id:'A2'};
interface Placed { actor:BindingActor; radius:number; x:number; y:number; anchors:ProteinAnchors; state:ProteinVisualState }
const NORMALS:Record<ContactSide,[number,number]>={left:[-1,0],right:[1,0],top:[0,-1],bottom:[0,1]};
const OPPOSITE:Record<ContactSide,ContactSide>={left:'right',right:'left',top:'bottom',bottom:'top'};
const r1=(value:number)=>Math.round(value*10)/10;
const place=(actor:BindingActor,radius:number,x=0,y=0,state:ProteinVisualState='normal'):Placed=>({actor,radius,x,y,state,anchors:proteinAnchors(proteinGeometry(actor.seed,radius),radius)});
/** `partner` against `anchor` on `side`, anchor-to-anchor; a positive `gap` pulls it away along the same axis. */
const against=(anchor:Placed,partner:BindingActor,side:ContactSide='right',gap=0,state:ProteinVisualState='normal'):Placed=>{
  const placed=place(partner,anchor.radius,0,0,state); const offset=contactOffset(anchor.anchors,placed.anchors,side); const [nx,ny]=NORMALS[side];
  return {...placed,x:r1(anchor.x+offset.x+nx*gap),y:r1(anchor.y+offset.y+ny*gap)};
};
/** Moves a group so the union of its visible bounds is centred on (cx, cy). */
const centred=(group:Placed[],cx:number,cy:number):Placed[]=>{
  const x0=Math.min(...group.map(p=>p.x+p.anchors.bounds.x)); const x1=Math.max(...group.map(p=>p.x+p.anchors.bounds.x+p.anchors.bounds.width));
  const y0=Math.min(...group.map(p=>p.y+p.anchors.bounds.y)); const y1=Math.max(...group.map(p=>p.y+p.anchors.bounds.y+p.anchors.bounds.height));
  const dx=cx-(x0+x1)/2; const dy=cy-(y0+y1)/2;
  return group.map(p=>({...p,x:r1(p.x+dx),y:r1(p.y+dy)}));
};
const anchorOf=(p:Placed,side:ContactSide)=>({id:p.actor.id,x:r1(p.x+p.anchors[side].x),y:r1(p.y+p.anchors[side].y)});
const actor=(p:Placed)=>`<g transform="translate(${p.x} ${p.y})" data-actor="${esc(p.actor.id)}" data-radius="${p.radius}">${renderProteinPrimitive({visualSeed:p.actor.seed,fill:p.actor.color,radius:p.radius,state:p.state})}</g>`;
/** Contact shadow between two touching actors; drawn before them so it only shows in the crevice. */
const contact=(a:Placed,b:Placed,side:ContactSide)=>renderInteractionPrimitive([anchorOf(a,side),anchorOf(b,OPPOSITE[side])],{kind:'contact'});

/** Two partners side by side, either touching (bound) or apart, centred on (cx, cy). */
function pairPanel(a:BindingActor,b:BindingActor,cx:number,cy:number,radius:number,bound:boolean):string {
  const first=place(a,radius); const [left,right]=centred([first,against(first,b,'right',bound?0:radius*.6)],cx,cy);
  return `${bound?contact(left!,right!,'right'):''}${actor(left!)}${actor(right!)}`;
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

/** Three distinct actors touching as one unit, B ↔ A ↔ C, anchor-to-anchor. */
function complexScene(radius:number):string {
  const a=place(PARTNER_A,radius); const b=against(a,PARTNER_B,'left'); const c=against(a,PARTNER_C,'right');
  const [pb,pa,pc]=centred([b,a,c],150,104);
  return `${contact(pa!,pb!,'left')}${contact(pa!,pc!,'right')}${actor(pb!)}${actor(pa!)}${actor(pc!)}`;
}

function interactionScene(id:string,radius:number):string {
  if(id==='bind'||id==='unbind'||id==='dimerize') return bindingTransition(id,radius);
  if(id==='recruit') return recruitScene(radius);
  return complexScene(radius);
}

function enzymeScene(id:string):string {
  const center=proteinAt(id,150,68,'#6f72d8','normal',37);
  if(id==='protease') return `${center}${proteinAt('substrate',55,128,'#8b94d8','normal',24)}${proteinAt('fragment-a',235,128,'#8b94d8','degraded',20)}${renderActionVisual('cleave',{x:92,y:128},{x:200,y:128})}`;
  if(id==='nuclease') return `${center}${at(25,130,renderNucleicAcidPrimitive({width:250,lesion:'dsb'}))}${renderActionVisual('cleave',{x:150,y:100},{x:150,y:128})}`;
  if(id==='polymerase') {
    const dna={x:25,y:136,width:250,state:'elongating' as const}; const {threePrime:end,follow}=nascentStrandGeometry(dna);
    return `${renderNucleicAcidPrimitive(dna)}<g ${follow}>${proteinAt(id,end.x+8,end.y-30,'#6f72d8','normal',32)}</g>`;
  }
  if(id==='helicase'||id==='ligase'||id==='glycosylase') {
    const state=id==='helicase'?'unwound':'normal'; const dnaLesion=id==='ligase'?'nick':id==='glycosylase'?'ap-site':undefined;
    return `${center}${at(25,130,renderNucleicAcidPrimitive({width:250,state,lesion:dnaLesion}))}${id==='helicase'?renderSmallMoleculePrimitive({visualSeed:'ATP',label:'ATP',x:42,y:45,scale:.6}):''}${renderActionVisual(id==='ligase'?'ligate':id==='helicase'?'unwind':'modify',{x:150,y:100},{x:150,y:126})}`;
  }
  const before:ModificationVisualKind|undefined=id==='phosphatase'?'phosphorylation':id==='deacetylase'?'acetylation':undefined;
  const after:ModificationVisualKind|undefined=id==='kinase'?'phosphorylation':id==='transferase'?'acetylation':id==='ubiquitin-ligase'?'ubiquitination':undefined;
  return `${['kinase','atpase'].includes(id)?renderSmallMoleculePrimitive({visualSeed:'ATP',label:'ATP',x:42,y:45,scale:.6}):''}${proteinAt(`${id}-substrate`,55,128,'#8b94d8','normal',24,before?[{kind:before}]:[])}${center}${proteinAt(`${id}-substrate`,245,128,'#8b94d8',id==='atpase'?'active':'normal',24,after?[{kind:after,length:3}]:[])}${renderActionVisual('modify',{x:92,y:128},{x:207,y:128})}`;
}

function expressionScene(id:string):string {
  if(id==='ribosome'||id==='translation') return `${at(28,130,renderNucleicAcidPrimitive({kind:'mrna',width:245}))}${proteinAt('ribosome',150,92,'#4c91e7','normal',45)}${renderActionVisual('synthesize',{x:150,y:55},{x:225,y:30})}`;
  if(id==='nucleosome') return `${at(25,106,renderNucleicAcidPrimitive({width:250}))}${proteinAt('histone-core',150,106,'#557ac1','normal',38)}`;
  const dna=at(25,128,renderNucleicAcidPrimitive({width:250}));
  if(id==='promoter-gene') return `${dna}${label('promoter',82,82)}${label('gene',215,82)}`;
  if(id==='transcription-factor') return `${dna}${renderInteractionPrimitive([{id:'tf',x:92,y:118},{id:'promoter',x:92,y:128}])}${proteinAt('TF',92,96,'#8068e8','active',30)}`;
  return `${dna}${proteinAt('RNA-Pol-II',150,96,'#4f8ad7','active',38)}${at(162,55,renderNucleicAcidPrimitive({kind:'mrna',width:112}))}${renderActionVisual('synthesize',{x:150,y:83},{x:205,y:58})}`;
}

function receptorScene(id:string):string {
  if(id==='proteasome') return `${proteinAt('target',55,67,'#7e83d5','normal',25,[{kind:'ubiquitination',length:3}])}${proteinAt('proteasome',150,110,'#4c91e7','active',48)}${proteinAt('peptides',246,112,'#7e83d5','degraded',20)}${renderActionVisual('degrade',{x:90,y:76},{x:112,y:98})}`;
  const bilayer=renderMembranePrimitive({x:20,y:116,length:260}); const count=id==='gpcr'?4:id==='rtk'?2:1;
  const proteins=Array.from({length:count},(_,i)=>proteinAt(`${id}-${i}`,150+(i-(count-1)/2)*34,105,'#4c91e7',id==='rtk'?'active':'normal',24,id==='rtk'?[{kind:'phosphorylation'}]:[])).join('');
  const ligand=id==='generic-receptor'||id==='rtk'?renderSmallMoleculePrimitive({visualSeed:'ligand',label:'ligand',x:150,y:38,scale:.6}):'';
  const ions=id==='ion-channel'?[105,150,195].map((x,i)=>renderSmallMoleculePrimitive({visualSeed:`ion-${i}`,x,y:52+i*10,scale:.55,ion:true})).join(''):'';
  return `${bilayer}${proteins}${ligand}${ions}`;
}

function eventScene(rawId:string):string {
  const id=rawId.replace(/^event-/,''); const before=id==='dephosphorylate'?[{kind:'phosphorylation' as const}]:[];
  const map:Record<string,ModificationVisualKind>={phosphorylate:'phosphorylation',acetylate:'acetylation',ubiquitinate:'ubiquitination',parylate:'parylation'};
  const after=map[id]?[{kind:map[id]!,length:id==='ubiquitinate'?3:undefined,branched:id==='parylate'}]:[];
  const finalState:ProteinVisualState=id==='activate'?'active':id==='inhibit'?'inhibited':id==='degrade'?'degraded':'normal';
  const action=(map[id]?'modify':id) as ActionVisualKind;
  if(id==='bind'||id==='unbind'||id==='dimerize'||id==='recruit') return interactionScene(id,24);
  if(id==='cleave'||id==='degrade') return `${proteinAt('event-actor',60,108,'#7774d8','normal',29)}${renderActionVisual(id as ActionVisualKind,{x:100,y:108},{x:180,y:108})}${proteinAt('event-fragments',238,108,'#7774d8','degraded',25)}`;
  if(id==='polymerize') return `${proteinAt('event-actor',72,108,'#7774d8','normal',29)}${renderActionVisual('polymerize',{x:110,y:108},{x:176,y:108})}${proteinAt('event-actor',215,108,'#7774d8','normal',29,[{kind:'parylation',length:7}])}`;
  if(id==='translocate') return `${label('CYTOPLASM',45,22)}${label('NUCLEUS',40,166)}${renderMembranePrimitive({x:20,y:92,length:260})}${proteinAt('event-actor',150,52,'#7774d8','active',24)}${proteinAt('event-actor',150,140,'#7774d8','active',24)}${renderActionVisual('translocate',{x:150,y:76},{x:150,y:115})}`;
  if(id==='elongate') {
    const dna={x:25,y:112,width:250,state:'elongating' as const,showDirectionality:true}; const {fivePrime,threePrime}=nascentStrandGeometry(dna);
    return `${renderNucleicAcidPrimitive(dna)}${renderActionVisual('elongate',{x:fivePrime.x+30,y:fivePrime.y-34},{x:threePrime.x-10,y:threePrime.y-34})}`;
  }
  if(['unwind','ligate'].includes(id)) return `${at(25,108,renderNucleicAcidPrimitive({width:250,state:id==='unwind'?'unwound':'normal',lesion:id==='ligate'?'nick':undefined}))}${renderActionVisual(action,{x:80,y:55},{x:150,y:90})}`;
  return `${proteinAt('event-actor',62,108,'#7774d8','normal',29,before)}${proteinAt('event-actor',238,108,'#7774d8',finalState,29,after)}${renderActionVisual(action,{x:100,y:108},{x:198,y:108})}`;
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
  if(entry.category==='membranes') return renderMembranePrimitive({x:entry.id.endsWith('vertical')?145:25,y:entry.id.endsWith('vertical')?12:96,length:entry.id.endsWith('vertical')?150:250,orientation:entry.id.replace('membrane-','') as 'horizontal'|'vertical'|'curved'});
  if(entry.category==='compartments') return renderCompartmentPrimitive(entry.id==='generic-organelle'?'organelle':entry.id as Parameters<typeof renderCompartmentPrimitive>[0],{x:55,y:48});
  if(entry.category==='receptors-complexes') return receptorScene(entry.id);
  if(entry.category==='molecular-events') return eventScene(entry.id);
  if(entry.id==='test-kinase') return enzymeScene('kinase'); if(entry.id==='test-protease') return enzymeScene('protease');
  return `${label('CYTOPLASM',45,24)}${label('NUCLEUS',40,165)}${renderMembranePrimitive({x:20,y:93,length:260})}${proteinAt('IRF3',150,52,'#7774d8','active',27,[{kind:'phosphorylation'}])}${proteinAt('IRF3',150,140,'#7774d8','active',27,[{kind:'phosphorylation'}])}${renderActionVisual('translocate',{x:150,y:78},{x:150,y:112})}`;
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
.mm-vocab__svg{display:block;max-width:100%;height:auto;overflow:visible;color:#18213a;font-family:Inter,system-ui,sans-serif}.mm-vocab__label{text-anchor:middle;fill:currentColor;font-size:10px;font-weight:650;letter-spacing:.02em}.mm-vocab__svg .mm-action path,.mm-vocab__svg .mm-primitive--interaction path{vector-effect:non-scaling-stroke}@media(prefers-color-scheme:dark){.mm-vocab__svg{color:#e7ecf6}.mm-modification rect{stroke:#dce4f2}}`;
