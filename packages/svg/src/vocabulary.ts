import { hashString } from './scene';

export type VocabularyCategory =
  | 'enzymes'
  | 'proteins'
  | 'molecules'
  | 'nucleic-acids'
  | 'lesions'
  | 'modifications'
  | 'compartments';

export type VocabularyVisual =
  | 'enzyme'
  | 'protein'
  | 'molecule'
  | 'dna'
  | 'rna'
  | 'trna'
  | 'ribosome'
  | 'lesion'
  | 'modification'
  | 'compartment';

export interface VocabularyItem {
  id: string;
  label: string;
  description: string;
  category: VocabularyCategory;
  visual: VocabularyVisual;
  color: string;
  /** Short labels used by the illustrative reaction, from left to right. */
  labels?: readonly string[];
}

export const VOCABULARY_CATEGORY_LABELS: Record<VocabularyCategory, string> = {
  enzymes: 'Enzymes and catalytic activities',
  proteins: 'Non-catalytic proteins',
  molecules: 'Small molecules and cofactors',
  'nucleic-acids': 'Nucleic acids and related structures',
  lesions: 'DNA damage and lesions',
  modifications: 'Post-translational modifications',
  compartments: 'Common compartments',
};

const item = (id: string, label: string, description: string, category: VocabularyCategory, visual: VocabularyVisual, color: string, labels?: readonly string[]): VocabularyItem => ({
  id, label, description, category, visual, color, ...(labels && { labels }),
});

/**
 * The built-in vocabulary is semantic data, not hard-coded cards. Applications may use it as-is,
 * filter it, or pass their own `VocabularyItem` to the same renderer.
 */
export const MOLECULAR_VOCABULARY: readonly VocabularyItem[] = [
  item('kinase', 'Kinase', 'Transfers a phosphate group from ATP to a substrate.', 'enzymes', 'enzyme', '#8068e8', ['ATP', 'P']),
  item('phosphatase', 'Phosphatase', 'Removes a phosphate group from a substrate.', 'enzymes', 'enzyme', '#58bc91', ['P', 'Pi']),
  item('protease', 'Protease', 'Cleaves peptide bonds in a protein.', 'enzymes', 'enzyme', '#ed6998', ['protein', 'fragments']),
  item('nuclease', 'Nuclease', 'Cleaves DNA or RNA.', 'enzymes', 'enzyme', '#4c91e7', ['DNA', 'cleaved DNA']),
  item('polymerase', 'DNA/RNA polymerase', 'Synthesizes nucleic acids from a template.', 'enzymes', 'enzyme', '#8068e8', ['dNTPs', 'new strand']),
  item('helicase', 'Helicase', 'Unwinds double-stranded nucleic acids using ATP.', 'enzymes', 'enzyme', '#40b7d8', ['ATP', 'unwound DNA']),
  item('ligase', 'Ligase', 'Joins two molecules using ATP.', 'enzymes', 'enzyme', '#ee9d55', ['ATP', 'joined DNA']),
  item('glycosylase', 'Glycosylase', 'Removes a damaged base from DNA.', 'enzymes', 'enzyme', '#e957ae', ['damaged base', 'AP site']),
  item('transferase', 'Transferase', 'Transfers a chemical group between molecules.', 'enzymes', 'enzyme', '#58bc91', ['donor', 'modified']),
  item('glycosyltransferase', 'Glycosyltransferase', 'Transfers a sugar moiety to a substrate.', 'enzymes', 'enzyme', '#d76ab5', ['UDP-sugar', 'glycosylated']),
  item('ubiquitin-ligase', 'Ubiquitin ligase (E3)', 'Adds ubiquitin to a substrate for signaling or degradation.', 'enzymes', 'enzyme', '#8068e8', ['Ub', 'ubiquitinated']),
  item('deacetylase', 'Deacetylase', 'Removes an acetyl group from a substrate.', 'enzymes', 'enzyme', '#e8ad43', ['Ac', 'deacetylated']),
  item('atpase', 'ATPase / GTPase', 'Hydrolyzes ATP or GTP to power work or a conformational change.', 'enzymes', 'enzyme', '#4c91e7', ['ATP', 'ADP + Pi']),
  item('isomerase', 'Isomerase', 'Catalyzes an intramolecular rearrangement.', 'enzymes', 'enzyme', '#58bc91', ['isomer A', 'isomer B']),
  item('oxidoreductase', 'Oxidoreductase', 'Catalyzes electron-transfer reactions.', 'enzymes', 'enzyme', '#eb6a78', ['NADH', 'NAD+']),
  item('lyase', 'Lyase', 'Breaks or forms bonds without hydrolysis or oxidation.', 'enzymes', 'enzyme', '#e4b735', ['substrate', 'product + CO₂']),

  item('receptor', 'Receptor', 'Binds an extracellular ligand and transduces a signal.', 'proteins', 'protein', '#4c91e7', ['ligand', 'membrane']),
  item('transcription-factor', 'Transcription factor', 'Binds DNA and regulates gene expression.', 'proteins', 'protein', '#8068e8', ['promoter', 'DNA']),
  item('scaffold', 'Adaptor / scaffold', 'Brings multiple proteins together.', 'proteins', 'protein', '#58bc91', ['partner A', 'partner B']),
  item('transporter', 'Transporter / channel', 'Moves molecules across a membrane.', 'proteins', 'protein', '#ed6998', ['outside', 'inside']),
  item('structural-protein', 'Structural protein', 'Provides structural support, such as histones or tubulin.', 'proteins', 'protein', '#4c91e7', ['assembly']),
  item('binding-protein', 'Antibody / binding protein', 'Specifically binds a molecular target.', 'proteins', 'protein', '#4c91e7', ['target']),

  item('atp', 'ATP', 'Adenosine triphosphate.', 'molecules', 'molecule', '#4c91e7', ['ATP']),
  item('adp', 'ADP', 'Adenosine diphosphate.', 'molecules', 'molecule', '#6688c5', ['ADP']),
  item('gtp', 'GTP', 'Guanosine triphosphate.', 'molecules', 'molecule', '#8068e8', ['GTP']),
  item('nad-plus', 'NAD⁺', 'Oxidized nicotinamide adenine dinucleotide.', 'molecules', 'molecule', '#4c91e7', ['NAD⁺']),
  item('nadh', 'NADH', 'Reduced nicotinamide adenine dinucleotide.', 'molecules', 'molecule', '#5578b6', ['NADH']),
  item('camp', 'cAMP / cGAMP', 'Cyclic nucleotide second messenger.', 'molecules', 'molecule', '#8068e8', ['cAMP']),
  item('calcium', 'Ca²⁺', 'Calcium ion.', 'molecules', 'molecule', '#9d6ee8', ['Ca²⁺']),
  item('zinc', 'Zn²⁺', 'Zinc ion.', 'molecules', 'molecule', '#91a0b8', ['Zn²⁺']),
  item('glucose', 'Glucose', 'A monosaccharide and central metabolite.', 'molecules', 'molecule', '#df6673', ['glucose']),
  item('cholesterol', 'Cholesterol', 'A membrane sterol.', 'molecules', 'molecule', '#707987', ['cholesterol']),

  item('double-stranded-dna', 'Double-stranded DNA', 'Paired antiparallel DNA strands.', 'nucleic-acids', 'dna', '#4c91e7'),
  item('single-stranded-dna', 'Single-stranded DNA', 'One unpaired DNA strand.', 'nucleic-acids', 'rna', '#4c91e7'),
  item('mrna', 'RNA (mRNA)', 'Single-stranded messenger RNA.', 'nucleic-acids', 'rna', '#ec6680'),
  item('trna', 'tRNA', 'Adaptor RNA that carries an amino acid.', 'nucleic-acids', 'trna', '#8068e8'),
  item('promoter-gene', 'Promoter / gene', 'A regulatory region followed by a transcribed gene.', 'nucleic-acids', 'dna', '#527ed0', ['promoter', 'gene']),
  item('ribosome', 'Ribosome', 'Ribonucleoprotein machine that translates mRNA.', 'nucleic-acids', 'ribosome', '#4c91e7', ['mRNA']),

  item('normal-base', 'Normal base', 'Intact base pair.', 'lesions', 'lesion', '#4c91e7', ['normal']),
  item('damaged-base', 'Damaged base / adduct', 'Chemically altered or bulky base.', 'lesions', 'lesion', '#ed5867', ['adduct']),
  item('ap-site', 'AP site', 'Abasic position lacking a nucleobase.', 'lesions', 'lesion', '#ed5867', ['AP']),
  item('nick', 'Nick', 'Discontinuity in one phosphodiester bond.', 'lesions', 'lesion', '#ed5867', ['nick']),
  item('ssb', 'Single-strand break', 'Gap or break affecting one DNA strand.', 'lesions', 'lesion', '#ed5867', ['SSB']),
  item('dsb', 'Double-strand break', 'Break across both DNA strands.', 'lesions', 'lesion', '#ed5867', ['DSB']),
  item('mismatch', 'Mismatch', 'Non-complementary base pair.', 'lesions', 'lesion', '#ed5867', ['mismatch']),
  item('crosslink', 'Crosslink', 'Covalent link within or between strands.', 'lesions', 'lesion', '#ed5867', ['crosslink']),

  item('phosphorylation', 'Phosphorylation', 'Addition of a phosphate group.', 'modifications', 'modification', '#f2b544', ['P']),
  item('acetylation', 'Acetylation', 'Addition of an acetyl group.', 'modifications', 'modification', '#f0a63a', ['Ac']),
  item('methylation', 'Methylation', 'Addition of a methyl group.', 'modifications', 'modification', '#df6686', ['Me']),
  item('ubiquitination', 'Ubiquitination', 'Attachment of ubiquitin.', 'modifications', 'modification', '#e55eb5', ['Ub']),
  item('sumoylation', 'SUMOylation', 'Attachment of a SUMO protein.', 'modifications', 'modification', '#68a7e5', ['SUMO']),
  item('glycosylation', 'Glycosylation', 'Attachment of a glycan.', 'modifications', 'modification', '#e55e8d', ['sugar']),
  item('parylation', 'PARylation', 'Attachment of a branched poly(ADP-ribose) chain.', 'modifications', 'modification', '#cc50d3', ['PAR']),

  item('extracellular', 'Extracellular space', 'Space outside the plasma membrane.', 'compartments', 'compartment', '#b8d5f0'),
  item('plasma-membrane', 'Plasma membrane', 'Lipid bilayer surrounding the cell.', 'compartments', 'compartment', '#e59a83'),
  item('cytoplasm', 'Cytoplasm', 'Intracellular space outside membrane-bound organelles.', 'compartments', 'compartment', '#aebdda'),
  item('nucleus', 'Nucleus', 'Genome-containing organelle.', 'compartments', 'compartment', '#7d85dc'),
  item('endoplasmic-reticulum', 'Endoplasmic reticulum', 'Membrane network for synthesis and trafficking.', 'compartments', 'compartment', '#6f91d8'),
  item('golgi', 'Golgi apparatus', 'Stacked membranes that modify and sort cargo.', 'compartments', 'compartment', '#4f82d9'),
  item('mitochondrion', 'Mitochondrion', 'Organelle for respiration and energy metabolism.', 'compartments', 'compartment', '#ed743f'),
  item('lysosome', 'Lysosome', 'Acidic degradative organelle.', 'compartments', 'compartment', '#8267c4'),
  item('endosome', 'Endosome', 'Membrane compartment of the endocytic pathway.', 'compartments', 'compartment', '#5b8fd8'),
];

export interface VocabularyRenderOptions {
  idPrefix?: string;
  width?: number;
  height?: number;
  /** Hide title and description when the host already provides an accessible name. */
  decorative?: boolean;
}

const esc = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const rnd = (value: number) => Math.round(value * 10) / 10;

/** Reusable molecular-surface primitive. Coordinates are deterministic for stable animation. */
export function proteinSurface(seedText: string, x: number, y: number, radius: number, fill: string): string {
  let state = hashString(seedText) || 1;
  const random = () => { state = Math.imul(state ^ (state >>> 15), 2246822507) ^ Math.imul(state ^ (state >>> 13), 3266489909); return ((state ^= state >>> 16) >>> 0) / 4294967296; };
  const circles = Array.from({ length: 27 }, (_, index) => {
    const angle = index * 2.399963 + random() * .4;
    const distance = radius * (.12 + .57 * Math.sqrt(index / 27));
    const r = radius * (.17 + random() * .09);
    return `<circle cx="${rnd(x + Math.cos(angle) * distance * 1.08)}" cy="${rnd(y + Math.sin(angle) * distance * .9)}" r="${rnd(r)}"/>`;
  }).join('');
  return `<g class="mm-vocab__protein" fill="${esc(fill)}">${circles}</g>`;
}

/** Reusable ball-and-stick primitive for cofactors, substrates and products. */
export function smallMolecule(seedText: string, x: number, y: number, scale = 1): string {
  const colors = ['#4f83cf', '#a6b2c5', '#ed5c64', '#efb343', '#8068e8'];
  const count = seedText === 'calcium' || seedText === 'zinc' ? 1 : seedText === 'cholesterol' ? 10 : 6;
  const points = Array.from({ length: count }, (_, index) => ({
    x: x + (index - (count - 1) / 2) * 9 * scale,
    y: y + Math.sin(index * 2.2 + hashString(seedText) % 5) * 9 * scale,
  }));
  const bonds = points.slice(1).map((point, index) => `<path d="M${rnd(points[index]!.x)} ${rnd(points[index]!.y)}L${rnd(point.x)} ${rnd(point.y)}"/>`).join('');
  const atoms = points.map((point, index) => `<circle cx="${rnd(point.x)}" cy="${rnd(point.y)}" r="${rnd((count === 1 ? 9 : 5.5) * scale)}" fill="${colors[(index + hashString(seedText)) % colors.length]}"/>`).join('');
  return `<g class="mm-vocab__molecule"><g class="mm-vocab__bonds">${bonds}</g>${atoms}</g>`;
}

/** Reusable nucleic-acid primitive: double helix, single strand, or a local break. */
export function nucleicAcid(x: number, y: number, width: number, mode: 'double' | 'single' | 'break' = 'double', color = '#4c91e7'): string {
  const points = (phase: number, from = 0, to = width) => Array.from({ length: Math.ceil((to - from) / 6) + 1 }, (_, index) => {
    const px = from + index * 6;
    return `${rnd(x + Math.min(px, to))} ${rnd(y + Math.sin((px / width) * Math.PI * 3 + phase) * 13)}`;
  }).join('L');
  if (mode === 'single') return `<path class="mm-vocab__strand" stroke="${esc(color)}" d="M${points(0)}"/>`;
  const half = width / 2;
  const paths = mode === 'break'
    ? `<path d="M${points(0, 0, half - 8)}M${points(0, half + 8, width)}"/><path d="M${points(Math.PI, 0, half - 8)}M${points(Math.PI, half + 8, width)}"/>`
    : `<path d="M${points(0)}"/><path d="M${points(Math.PI)}"/>`;
  const rungs = Array.from({ length: Math.floor(width / 16) }, (_, index) => {
    const px = index * 16 + 5;
    if (mode === 'break' && Math.abs(px - half) < 13) return '';
    const a = y + Math.sin((px / width) * Math.PI * 3) * 13;
    const b = y + Math.sin((px / width) * Math.PI * 3 + Math.PI) * 13;
    return `<path d="M${rnd(x + px)} ${rnd(a)}L${rnd(x + px)} ${rnd(b)}"/>`;
  }).join('');
  return `<g class="mm-vocab__dna" stroke="${esc(color)}">${rungs}${paths}</g>`;
}

const arrow = (x1: number, y1: number, x2: number, y2: number) => `<path class="mm-vocab__arrow" d="M${x1} ${y1}L${x2} ${y2}m-9-6 9 6-9 6"/>`;
const pill = (text: string, x: number, y: number, color: string) => `<g class="mm-vocab__pill"><rect x="${x - Math.max(18, text.length * 4.2)}" y="${y - 10}" width="${Math.max(36, text.length * 8.4)}" height="20" rx="10" fill="${esc(color)}"/><text x="${x}" y="${y + 4}">${esc(text)}</text></g>`;

function enzymeArt(entry: VocabularyItem): string {
  const labels = entry.labels ?? ['substrate', 'product'];
  const dnaEnzyme = ['nuclease', 'polymerase', 'helicase', 'ligase', 'glycosylase'].includes(entry.id);
  const cleavage = entry.id === 'protease' || entry.id === 'nuclease';
  const substrate = dnaEnzyme ? nucleicAcid(18, 112, 92, entry.id === 'ligase' ? 'break' : 'double') : proteinSurface(`${entry.id}-substrate`, 55, 124, 25, '#8893dd');
  const product = dnaEnzyme ? nucleicAcid(190, 112, 92, entry.id === 'helicase' ? 'single' : 'double') : proteinSurface(`${entry.id}-product`, 248, 124, 25, '#8893dd');
  const accessory = ['kinase', 'phosphatase', 'ligase', 'helicase', 'polymerase', 'oxidoreductase', 'atpase'].includes(entry.id)
    ? smallMolecule(labels[0]!, 42, 55, .72) + pill(labels[0]!, 42, 31, '#dbeafe') : '';
  const mark = cleavage ? `<path class="mm-vocab__cut" d="m142 116 9 17m0-17-9 17"/>` : '';
  return `${accessory}${substrate}${proteinSurface(entry.id, 150, 76, 48, entry.color)}${product}${arrow(102, 124, 195, 124)}${mark}${pill(entry.label.replace('DNA/RNA ', ''), 150, 18, entry.color + '55')}<text class="mm-vocab__caption" x="55" y="166">${esc(labels[0]!)}</text><text class="mm-vocab__caption" x="248" y="166">${esc(labels[1]!)}</text>`;
}

function proteinArt(entry: VocabularyItem): string {
  const membrane = entry.id === 'receptor' || entry.id === 'transporter';
  const dna = entry.id === 'transcription-factor';
  const partners = entry.id === 'scaffold' ? proteinSurface('a', 86, 115, 30, '#7d83d8') + proteinSurface('b', 220, 115, 30, '#eda158') : '';
  const context = membrane
    ? `<g class="mm-vocab__membrane"><path d="M15 130H285M15 148H285"/>${Array.from({ length: 18 }, (_, i) => `<circle cx="${24 + i * 15}" cy="130" r="4"/><circle cx="${24 + i * 15}" cy="148" r="4"/>`).join('')}</g>`
    : dna ? nucleicAcid(52, 133, 196, 'double') : '';
  return `${context}${partners}${proteinSurface(entry.id, 150, membrane ? 112 : 94, 50, entry.color)}${entry.labels?.[0] ? pill(entry.labels[0], 150, 28, entry.color + '44') : ''}`;
}

function lesionArt(entry: VocabularyItem): string {
  const broken = entry.id === 'dsb';
  const base = nucleicAcid(35, 98, 230, broken ? 'break' : 'double');
  if (entry.id === 'normal-base') return base;
  const marker = entry.id === 'ap-site' ? `<circle class="mm-vocab__lesion-ring" cx="150" cy="98" r="7"/>`
    : entry.id === 'crosslink' ? `<path class="mm-vocab__cut" d="m142 84 16 28m0-28-16 28"/>`
    : entry.id === 'nick' || entry.id === 'ssb' || broken ? `<path class="mm-vocab__cut" d="m142 88 16 20m0-20-16 20"/>`
    : `<circle class="mm-vocab__lesion-dot" cx="150" cy="98" r="7"/>`;
  return `${base}<circle class="mm-vocab__lesion-glow" cx="150" cy="98" r="28"/>${marker}${pill(entry.labels?.[0] ?? entry.label, 150, 34, '#fecdd3')}`;
}

function modificationArt(entry: VocabularyItem): string {
  const label = entry.labels?.[0] ?? entry.label;
  if (entry.id === 'parylation' || entry.id === 'glycosylation') {
    const beads = Array.from({ length: 8 }, (_, i) => `<circle cx="${72 + i * 21}" cy="${110 - Math.sin(i * .8) * 25}" r="8"/>`).join('');
    return `<g class="mm-vocab__chain" fill="${esc(entry.color)}">${beads}</g>${pill(label, 150, 35, entry.color + '55')}`;
  }
  if (entry.id === 'ubiquitination') return `${proteinSurface('ub', 150, 100, 42, entry.color)}${pill(label, 193, 60, entry.color + '55')}`;
  return `<circle class="mm-vocab__badge" cx="150" cy="98" r="29" fill="${esc(entry.color)}"/><text class="mm-vocab__badge-text" x="150" y="104">${esc(label)}</text>`;
}

function compartmentArt(entry: VocabularyItem): string {
  if (entry.id === 'plasma-membrane') return proteinArt({ ...entry, id: 'receptor', labels: [] });
  if (entry.id === 'extracellular' || entry.id === 'cytoplasm') return Array.from({ length: 15 }, (_, i) => `<ellipse cx="${25 + (i * 37) % 250}" cy="${45 + (i * 29) % 95}" rx="${8 + i % 3 * 3}" ry="${4 + i % 2 * 2}" fill="${esc(entry.color)}" opacity="${.25 + i % 4 * .12}"/>`).join('');
  if (entry.id === 'golgi' || entry.id === 'endoplasmic-reticulum') return Array.from({ length: 5 }, (_, i) => `<path class="mm-vocab__organelle-line" stroke="${esc(entry.color)}" d="M${55 + i * 8} ${62 + i * 16}C105 ${42 + i * 16} 200 ${82 + i * 8} ${242 - i * 10} ${60 + i * 16}"/>`).join('');
  const inner = entry.id === 'mitochondrion' ? `<path class="mm-vocab__organelle-line" d="M70 95c25-40 48 40 76 0s50 40 82 0"/>` : entry.id === 'nucleus' ? nucleicAcid(90, 95, 120, 'double', '#6573d3') : '';
  return `<ellipse class="mm-vocab__organelle" cx="150" cy="98" rx="94" ry="57" fill="${esc(entry.color)}"/>${inner}`;
}

function glyphArt(entry: VocabularyItem): string {
  switch (entry.visual) {
    case 'enzyme': return enzymeArt(entry);
    case 'protein': return proteinArt(entry);
    case 'molecule': return `${smallMolecule(entry.id, 150, 95, entry.id === 'calcium' || entry.id === 'zinc' ? 1.8 : 1.5)}${pill(entry.labels?.[0] ?? entry.label, 150, 35, entry.color + '44')}`;
    case 'dna': return `${nucleicAcid(30, 95, 240, 'double', entry.color)}${entry.labels?.map((label, index) => pill(label, 95 + index * 110, 35, entry.color + '33')).join('') ?? ''}`;
    case 'rna': return nucleicAcid(30, 95, 240, 'single', entry.color);
    case 'trna': return `<path class="mm-vocab__strand" stroke="${esc(entry.color)}" d="M150 150V42m0 35-38-28m38 28 38-28m-38 62-34 30m34-30 34 30"/><circle cx="150" cy="37" r="7" fill="#ed6673"/>`;
    case 'ribosome': return `${nucleicAcid(25, 130, 250, 'single', '#ec6680')}${proteinSurface('ribosome', 150, 94, 58, entry.color)}`;
    case 'lesion': return lesionArt(entry);
    case 'modification': return modificationArt(entry);
    case 'compartment': return compartmentArt(entry);
  }
}

/** Render one catalog entry as a self-contained, accessible SVG. */
export function renderVocabularyGlyph(entryOrId: VocabularyItem | string, options: VocabularyRenderOptions = {}): string {
  const entry = typeof entryOrId === 'string' ? MOLECULAR_VOCABULARY.find(candidate => candidate.id === entryOrId) : entryOrId;
  if (!entry) throw new Error(`Unknown molecular vocabulary item: ${entryOrId}`);
  const width = options.width ?? 300;
  const height = options.height ?? 180;
  const prefix = esc(options.idPrefix ?? `mm-vocab-${entry.id}`);
  const accessible = options.decorative ? 'aria-hidden="true"' : `role="img" aria-labelledby="${prefix}-title ${prefix}-desc"`;
  const title = options.decorative ? '' : `<title id="${prefix}-title">${esc(entry.label)}</title><desc id="${prefix}-desc">${esc(entry.description)}</desc>`;
  return `<svg class="mm-vocab__svg" viewBox="0 0 300 180" width="${width}" height="${height}" ${accessible} xmlns="http://www.w3.org/2000/svg">${title}<style>${VOCABULARY_SVG_CSS}</style>${glyphArt(entry)}</svg>`;
}

export const VOCABULARY_SVG_CSS = `
.mm-vocab__svg{display:block;max-width:100%;height:auto;overflow:visible;color:#18213a;font-family:Inter,system-ui,sans-serif}
.mm-vocab__protein{stroke:color-mix(in srgb,currentColor 16%,transparent);stroke-width:1}.mm-vocab__protein circle{filter:drop-shadow(0 3px 3px #24324a22)}
.mm-vocab__bonds,.mm-vocab__arrow,.mm-vocab__cut{fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.mm-vocab__bonds{stroke:#738097;stroke-width:4}
.mm-vocab__dna{fill:none;stroke-width:5;stroke-linecap:round;opacity:.95}.mm-vocab__dna>path:nth-last-child(-n+2){stroke-width:7}.mm-vocab__strand{fill:none;stroke-width:7;stroke-linecap:round;stroke-linejoin:round}
.mm-vocab__pill text,.mm-vocab__caption,.mm-vocab__badge-text{text-anchor:middle;fill:currentColor;font-size:11px;font-weight:650}.mm-vocab__caption{font-size:10px;font-weight:500}.mm-vocab__pill rect{stroke:currentColor;stroke-opacity:.13}
.mm-vocab__cut{stroke-width:3}.mm-vocab__lesion-glow{fill:#fb7185;opacity:.2}.mm-vocab__lesion-dot{fill:#ef4455}.mm-vocab__lesion-ring{fill:none;stroke:#ef4455;stroke-width:4}
.mm-vocab__badge{stroke:#fff;stroke-width:2}.mm-vocab__badge-text{font-size:13px}.mm-vocab__chain circle{stroke:#fff;stroke-width:1.5}.mm-vocab__membrane{fill:#e7a58e;stroke:#d78372;stroke-width:3}.mm-vocab__organelle{opacity:.85;stroke:currentColor;stroke-opacity:.2;stroke-width:2}.mm-vocab__organelle-line{fill:none;stroke:#fff;stroke-width:5;stroke-linecap:round;opacity:.85}
`;
