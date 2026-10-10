import { parseMechanism } from '@molecular-motion/core/yaml';
import type { MechanismDefinition } from '@molecular-motion/core';
import parpSource from '../../../../examples/parp1-ssb-repair.yaml?raw';
import hrSource from '../../../../examples/homologous-recombination.yaml?raw';
import egfrSource from '../../../../examples/egfr-dimerization.yaml?raw';
import p53Source from '../../../../examples/p53-mdm2-feedback.yaml?raw';
import cgasSource from '../../../../examples/cgas-sting.yaml?raw';
import geneExpressionSource from '../../../../examples/gene-expression.yaml?raw';
import dhjSource from '../../../../examples/double-holliday-junction.yaml?raw';

/** The one host the site is served from. Every canonical URL, and the `$id` of each JSON Schema, is under it. */
export const SITE = 'https://molecular-motion.alvaroesteban.dev';
export const REPOSITORY = 'https://github.com/alvaroestebanperez/molecular-motion';
export const NPM = 'https://www.npmjs.com/package/@molecular-motion';
/** The author, as the entity alvaroesteban.dev already publishes. Referenced by `@id`, never redefined. */
export const AUTHOR = { '@type': 'Person', '@id': 'https://alvaroesteban.dev/#person', name: 'Álvaro Esteban Pérez', url: 'https://alvaroesteban.dev/' };

export const TAGLINE = 'Interactive and animated molecular biology visualization for the web.';
/** The one-sentence definition of the project. The README and the package descriptions say the same. */
export const DEFINITION = 'Molecular Motion is an open-source TypeScript library for creating interactive and animated molecular biology visualizations with SVG.';

/** The smallest complete document, shown on the home page. The tests compile it. */
export const QUICK_START = `schemaVersion: 7
mechanism: { id: nick-repair, name: Repair of a nick }
compartments: [nucleus]
actors:
  - id: dna
    type: dna
    compartment: nucleus
    nucleic: { length: 60 }
    sites:
      - { id: nick, at: 30, strand: top }
  - id: ligase
    type: protein
    label: DNA ligase
    compartment: nucleus
steps:
  - id: damage
    title: A nick appears
    actions:
      - { type: cleave, target: dna.nick, lesion: nick }
  - id: repair
    title: Ligase seals it
    actions:
      - { type: recruit, actor: ligase, target: dna.nick }
      - { type: ligate, target: dna.nick, by: ligase }`;

export interface Mechanism { id: string; source: string; definition: MechanismDefinition }
const mechanism = (source: string): Mechanism => {
  const definition = parseMechanism(source);
  return { id: definition.mechanism.id, source, definition };
};
export const MECHANISMS = Object.fromEntries([parpSource, hrSource, dhjSource, geneExpressionSource, egfrSource, cgasSource, p53Source].map(source => {
  const item = mechanism(source);
  return [item.id, item];
})) as Record<string, Mechanism>;

/** A page about one biological subject, built around one mechanism of `examples/`. Prose fields are trusted HTML. */
export interface ExamplePage {
  /** The page is served at `/examples/<slug>/`. */
  slug: string;
  mechanism: string;
  /** The step drawn before the player loads, and the one the player opens on. */
  poster: string;
  title: string;
  description: string;
  heading: string;
  /** Name in listings and breadcrumbs. */
  name: string;
  lede: string;
  /** What the mechanism is, for a reader who does not know it. */
  biology: string[];
  /** How the document expresses it: which parts of the language carry which part of the biology. */
  representation: string[];
  /** Actors and steps quoted from the YAML file itself, by id, so the page cannot show a document that does not compile. */
  excerpt: { actors: string[]; steps: string[] };
  related: { href: string; label: string; note: string }[];
}

export const EXAMPLE_PAGES: ExamplePage[] = [
  {
    slug: 'dna-repair',
    mechanism: 'parp1-ssb-repair',
    poster: 'parylation',
    title: 'Interactive DNA Repair Visualization | Molecular Motion',
    description: 'Animated, step-by-step SVG visualization of DNA repair: base excision repair and PARP1 signalling at a single-strand break, with its YAML source.',
    heading: 'Interactive DNA Repair Visualization',
    name: 'DNA repair',
    lede: 'Base excision repair of an oxidized base, and how PARP1 signals the single-strand break it leaves behind, as an animated SVG figure you can step through. The whole figure is generated from one YAML file.',
    biology: [
      'Reactive oxygen species oxidize guanine to 8-oxoguanine, one of the most common oxidative lesions in DNA. <strong>Base excision repair</strong> removes the damaged base: the glycosylase OGG1 cuts it out and leaves an abasic site, and the endonuclease APE1 cuts the backbone there, which turns the lesion into a single-strand break.',
      'That break is detected by <strong>PARP1</strong>. Binding to it activates the enzyme, which uses NAD<sup>+</sup> to build branched chains of poly(ADP-ribose) on itself. The chains recruit the scaffold protein XRCC1, which brings DNA polymerase β to fill the one-nucleotide gap and DNA ligase IIIα to seal the nick. PARP inhibitors block this signalling and trap PARP1 on the DNA, which is selectively toxic to cells without functional BRCA1 or BRCA2.',
    ],
    representation: [
      'The DNA is one <code>dna</code> actor of 100 base pairs with a guanine site at coordinate 50 on the top strand. Everything that happens to the DNA happens <em>at that site</em>: <code>damage</code> marks the base as damaged, <code>excise</code> leaves an abasic site, <code>cleave</code> breaks the backbone, <code>fill-gap</code> and <code>ligate</code> restore it. The renderer draws each state of the lesion differently, so the helix shows the damaged base, the abasic site, the break and the repaired strand without any drawing instructions in the file.',
      'Proteins are <code>protein</code> actors that <code>bind</code> the site or are <code>recruit</code>ed to another protein. <code>activate</code> changes the state of PARP1, and <code>parylate</code> grows a poly(ADP-ribose) chain of a given length on it. NAD<sup>+</sup> is a <code>molecule</code> actor drawn with its own small-molecule glyph.',
      'The compiler checks the biology it can check. A document that ligates a site with no break, or binds an actor that was degraded, is rejected with the path of the action at fault. Each step is folded into an immutable snapshot, so going back and forward always shows the same state.',
    ],
    excerpt: { actors: ['dna', 'parp1'], steps: ['binding', 'parylation'] },
    related: [
      { href: '/examples/protein-dna-interaction/', label: 'Protein–DNA interactions in homologous recombination', note: 'Repair of a double-strand break: RPA and RAD51 on single-stranded DNA.' },
      { href: '/app/#/mechanisms/double-holliday-junction', label: 'Double Holliday junction', note: 'Second-end capture, and resolution as a crossover.' },
      { href: '/app/#/mechanisms/homologous-recombination', label: 'Homologous recombination in the viewer', note: 'Every step, with thumbnails and SVG or PNG export.' },
    ],
  },
  {
    slug: 'protein-dna-interaction',
    mechanism: 'homologous-recombination',
    poster: 'filament',
    title: 'Protein–DNA Interaction Visualization | Molecular Motion',
    description: 'Animated SVG visualization of protein–DNA interactions: RPA and RAD51 binding single-stranded DNA in homologous recombination, written in YAML.',
    heading: 'Visualizing Protein–DNA Interactions',
    name: 'Protein–DNA interactions',
    lede: 'Proteins that bind, coat and leave a stretch of DNA, drawn where they sit on the molecule. The example is the repair of a double-strand break by homologous recombination, from the break to an intact chromatid.',
    biology: [
      'A double-strand break is repaired from the sister chromatid. The MRN complex senses the broken ends, and nucleases resect the 5′ strands, leaving 3′ single-stranded overhangs. <strong>RPA</strong> coats that single-stranded DNA at once and protects it.',
      '<strong>BRCA2</strong> then loads <strong>RAD51</strong>, which displaces RPA and polymerizes into a filament along the overhang. The filament finds the matching sequence in the sister chromatid and invades it; the 3′ end is extended using the sister as template, the new strand is released and anneals to the other end of the break, and the remaining gap is filled and sealed. This pathway is synthesis-dependent strand annealing.',
    ],
    representation: [
      'A protein–DNA interaction here is more than an arrow between two shapes. The DNA has <strong>coordinates</strong>: an 80-base-pair chromatid with the break at position 40 and each overhang declared as a <code>span</code>. A protein declares a <strong>footprint</strong>, the number of nucleotides it covers and the form of DNA it binds, so RPA (<code>form: single</code>) can only sit on single-stranded DNA.',
      '<code>coat</code> places several copies of a protein side by side on a span, and <code>vacate</code> removes one. The compiler keeps track of occupancy, so two proteins cannot be put on the same nucleotides: RAD51 can only take the place RPA has left. <code>copies: 6</code> declares six RAD51 protomers, addressed as <code>rad51#1</code> to <code>rad51#6</code>, each with its own state.',
      'Protein–protein contacts within the filament use <strong>interfaces</strong>: each RAD51 has a <code>protomer</code> interface with a valence of two, and each <code>bind</code> between neighbours uses one. The strands themselves are part of the state too: <code>resect</code>, <code>unwind</code>, <code>invade</code>, <code>extend</code> and <code>anneal</code> change which nucleotides exist and which are paired, and the figure is drawn from that.',
    ],
    excerpt: { actors: ['dna', 'rpa', 'rad51'], steps: ['nucleation'] },
    related: [
      { href: '/examples/dna-repair/', label: 'DNA repair: base excision repair and PARP1', note: 'A single-strand break, detected and signalled by PARP1.' },
      { href: '/app/#/mechanisms/double-holliday-junction', label: 'Double Holliday junction', note: 'The other outcome of strand invasion: a crossover.' },
      { href: '/app/#/mechanisms/cgas-sting', label: 'cGAS–STING sensing of cytosolic DNA', note: 'A protein that assembles on double-stranded DNA in the cytosol.' },
    ],
  },
];

/** The mechanisms that have no page of their own yet. They are listed, and open in the viewer. */
export const VIEWER_ONLY: { mechanism: string; name: string; note: string }[] = [
  { mechanism: 'gene-expression', name: 'Gene expression', note: 'Transcription by RNA polymerase II, splicing of the intron, and the mRNA at a ribosome in the cytoplasm.' },
  { mechanism: 'egfr-dimerization', name: 'Membrane receptor signalling', note: 'EGFR binds its ligand, dimerizes in the membrane and is phosphorylated in trans.' },
  { mechanism: 'cgas-sting', name: 'Cell signalling across compartments', note: 'cGAS–STING: from cytosolic DNA to IRF3 entering the nucleus.' },
  { mechanism: 'p53-mdm2-feedback', name: 'A negative feedback loop', note: 'p53 turnover, the stress response and induction of its inhibitor MDM2.' },
  { mechanism: 'double-holliday-junction', name: 'Double Holliday junction', note: 'Second-end capture and resolution as a crossover by reconnecting strands.' },
];

export const CAPABILITIES: { title: string; text: string }[] = [
  { title: 'Proteins', text: 'Globular proteins, enzymes, complexes and membrane-spanning receptors, with their activity state, several copies of one protein, and interfaces between them.' },
  { title: 'DNA and RNA', text: 'A double helix with coordinates and strand polarity: breaks, lesions, resection, synthesis, unwinding, pairing between molecules, splicing and strand exchange.' },
  { title: 'Molecular interactions', text: 'Binding and release, recruitment, activation, inhibition, phosphorylation, ubiquitination, PARylation, cleavage, ligation, degradation and translocation.' },
  { title: 'Membranes and compartments', text: 'A lipid bilayer with proteins that span it, and bands for the nucleus, cytoplasm, ER, Golgi, mitochondrion, endosome or compartments you name.' },
  { title: 'Animation and interaction', text: 'Steps morph into one another instead of redrawing. A React player adds a timeline, playback, keyboard navigation and selectable molecules.' },
  { title: 'Figures for publication', text: 'Any step exports as a standalone SVG, or as PNG in the browser, in a light or dark theme. The same code runs in Node, without a browser.' },
];

export const USE_CASES: { title: string; text: string; href?: string }[] = [
  { title: 'DNA repair visualization', text: 'Base excision repair, single-strand break repair and homologous recombination, lesion by lesion.', href: '/examples/dna-repair/' },
  { title: 'Protein–DNA interactions', text: 'Proteins that bind a site or coat a stretch of DNA, placed by coordinate.', href: '/examples/protein-dna-interaction/' },
  { title: 'Transcription and gene expression', text: 'A transcript that grows on its template, loses its intron and meets a ribosome in the cytoplasm.', href: '/app/#/mechanisms/gene-expression' },
  { title: 'Membrane receptor signalling', text: 'Ligand binding, dimerization and trans-phosphorylation of a receptor in the membrane.', href: '/app/#/mechanisms/egfr-dimerization' },
  { title: 'Cell signalling', text: 'A signal followed across the cytosol, the ER, the Golgi and the nucleus.', href: '/app/#/mechanisms/cgas-sting' },
  { title: 'Teaching molecular biology', text: 'Lectures, courses and textbooks online where a student steps through a mechanism at their own pace.' },
  { title: 'Scientific figures in SVG', text: 'Consistent, editable figures for a review, a thesis or a poster, kept in version control with the text.' },
];

export const FAQ: { question: string; answer: string }[] = [
  { question: 'What is Molecular Motion?', answer: `${DEFINITION} You describe a mechanism in YAML or JSON, and it draws the molecules, animates each step and gives you a player to navigate them.` },
  { question: 'What does it visualize?', answer: 'Molecular mechanisms: proteins, DNA, RNA, small molecules, complexes, membranes and cell compartments, and what happens between them step by step. Examples in the repository cover DNA repair, homologous recombination, transcription and splicing, receptor signalling and a feedback loop.' },
  { question: 'Which language and technologies does it use?', answer: 'It is written in TypeScript and runs in any JavaScript project. Figures are SVG. The core and the renderer have no DOM dependency and run in Node; the player is a React component.' },
  { question: 'Can it draw DNA, RNA and proteins?', answer: 'Yes. DNA and RNA are drawn as helices and strands with real coordinates and 5′→3′ polarity, and proteins as surfaces with their state, modifications and binding partners.' },
  { question: 'Can it show molecular interactions?', answer: 'Yes. Binding, recruitment, activation, inhibition, post-translational modification, cleavage, ligation, synthesis, degradation and translocation are actions of the language, and each one is animated.' },
  { question: 'Are the diagrams interactive?', answer: 'Yes. The React player has a step timeline, play and pause, keyboard navigation and selectable molecules. It respects the reduced-motion preference, and every figure carries a text alternative.' },
  { question: 'How is it different from a molecular structure viewer?', answer: 'A structure viewer such as Mol* or NGL shows the three-dimensional structure of a molecule from its atomic coordinates. Molecular Motion shows what molecules do: a schematic, step-by-step account of a mechanism, at the level of a review figure. It does not read PDB files and is not a simulation.' },
];
