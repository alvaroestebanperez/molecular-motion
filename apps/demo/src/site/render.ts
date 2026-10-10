// The static pages of the site: the landing, the examples and the files crawlers ask for. They are
// rendered to HTML at build time (vite.config.ts), with the figure of each mechanism already drawn, so
// a reader or a crawler without JavaScript gets the whole page. The player replaces the figure when it loads.
import { compileMechanism, type MechanismDefinition, type MechanismStep, type ReferenceDefinition } from '@molecular-motion/core';
import { buildSvgScene, exportCss, exportSvg, mechanismReservation } from '@molecular-motion/svg';
import {
  AUTHOR, CAPABILITIES, DEFINITION, EXAMPLE_PAGES, FAQ, MECHANISMS, NPM, QUICK_START, REPOSITORY, SITE, TAGLINE, USE_CASES, VIEWER_ONLY,
  type ExamplePage, type Mechanism,
} from './pages';

/** Where the build put the files a page links to. In development they are the sources themselves. */
export interface SiteAssets { css: string; player: string }
export interface SiteFile { path: string; content: string }

const DOCS = `${REPOSITORY}/blob/main/docs`;
const WEBSITE_ID = `${SITE}/#website`;
const SOFTWARE_ID = `${SITE}/#software`;
const ICON = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2212%22 fill=%22%2322d3ee%22/%3E%3C/svg%3E';
const LOGO = '<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 21 16 9l8 13M9 21h15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="8.5" r="4.5" fill="currentColor"/><circle cx="8" cy="22" r="4" fill="currentColor" opacity=".75"/><circle cx="24.5" cy="22.5" r="5" fill="currentColor" opacity=".9"/></svg>';
// The theme the reader chose in the viewer, applied before the first paint. Old links to the viewer,
// from when it was the home page (`/#/playground`), are sent on to where it lives now.
const BOOT = `if(location.pathname==='/'&&location.hash.indexOf('#/')===0)location.replace('/app/'+location.hash);try{var t=localStorage.getItem('molecular-motion:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** JSON that is safe inside a `<script>` element. */
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
const url = (path: string) => `${SITE}${path}`;

interface Crumb { name: string; path: string }
interface Page {
  path: string;
  title: string;
  description: string;
  body: string;
  /** From the home page down to this one. Absent on the home page. */
  crumbs?: Crumb[];
  graph: object[];
  /** The page holds a figure for the player to take over. */
  player?: boolean;
}

function document(page: Page, assets: SiteAssets): string {
  const crumbs = page.crumbs ?? [];
  const graph = [...page.graph, ...(crumbs.length ? [{
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: url(crumb.path) })),
  }] : [])];
  const trail = crumbs.length ? `<nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs.map((crumb, index) => index === crumbs.length - 1
    ? `<li aria-current="page">${escapeHtml(crumb.name)}</li>`
    : `<li><a href="${crumb.path}">${escapeHtml(crumb.name)}</a></li>`).join('')}</ol></nav>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="canonical" href="${url(page.path)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Molecular Motion">
<meta property="og:title" content="${escapeHtml(page.title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:url" content="${url(page.path)}">
<meta property="og:image" content="${url('/og.png')}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Molecular Motion: a protein bound to a DNA double helix, drawn as an SVG figure.">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${ICON}">
<script>${BOOT}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="${assets.css}">
${page.player ? `<style>${exportCss}</style>\n<script type="module" src="${assets.player}"></script>` : ''}
<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': graph })}</script>
</head>
<body>
<a class="skip-link" href="#content">Skip to content</a>
<header class="site-header">
<a class="brand" href="/">${LOGO}<span>Molecular Motion</span></a>
<nav aria-label="Main">
<a href="/examples/">Examples</a>
<a href="/app/">Viewer</a>
<a href="/app/#/playground">Playground</a>
<a href="/app/#/visual-language">Visual language</a>
<a href="${DOCS}/language.md">Documentation</a>
<a href="${REPOSITORY}">GitHub</a>
</nav>
</header>
<main id="content">
${trail}
${page.body}
</main>
<footer class="site-footer">
<p>Molecular Motion is open source under the MIT license, by <a href="${AUTHOR.url}">${AUTHOR.name}</a>.</p>
<p>Explanatory models, not clinical decision tools.</p>
</footer>
</body>
</html>
`;
}

// ---- Parts shared by pages ----

/** The figure of one step, drawn now, and the mechanism for the player that takes its place. */
function figure(mechanism: Mechanism, stepId: string): string {
  const compiled = compileMechanism(mechanism.definition);
  const snapshot = compiled.at(stepId);
  const svg = exportSvg(buildSvgScene(snapshot, { reservation: mechanismReservation(compiled) }), { theme: 'auto', styles: false }).replace(/^<\?xml[^>]*\?>\s*/, '');
  return `<div class="figure" data-player data-step="${escapeHtml(stepId)}">
<figure>${svg}<figcaption>${escapeHtml(mechanism.definition.mechanism.name)}: ${escapeHtml(snapshot.step.title)}.</figcaption></figure>
<script type="application/json">${json(mechanism.definition)}</script>
</div>`;
}

const code = (source: string, label: string) => `<figure class="code"><figcaption>${escapeHtml(label)}</figcaption><pre tabindex="0"><code>${escapeHtml(source)}</code></pre></figure>`;

/** One entry of a top-level YAML list, as it is written in the file: from its `- id:` line to the next entry. */
export function yamlEntry(source: string, section: 'actors' | 'steps', id: string): string {
  const lines = source.split('\n');
  const start = lines.indexOf(`${section}:`);
  const first = lines.findIndex((line, index) => index > start && line === `  - id: ${id}`);
  if (start < 0 || first < 0) throw new Error(`No ${section} entry "${id}" in the mechanism source`);
  const rest = lines.slice(first + 1);
  const length = rest.findIndex(line => /^(  - |\S)/.test(line));
  return [lines[first]!, ...rest.slice(0, length < 0 ? undefined : length)].join('\n').trimEnd();
}

function excerpt(page: ExamplePage, source: string): string {
  const entries = (section: 'actors' | 'steps', ids: string[]) => ids.length ? `${section}:\n${ids.map(id => yamlEntry(source, section, id)).join('\n\n')}` : '';
  return [entries('actors', page.excerpt.actors), entries('steps', page.excerpt.steps)].filter(Boolean).join('\n\n');
}

const REACT_USAGE = (file: string) => `import { parseMechanism } from '@molecular-motion/core/yaml';
import { MolecularMechanism } from '@molecular-motion/react';
import source from './${file}?raw';   // Vite; any way of reading the file as text works

export function Figure() {
  return <MolecularMechanism definition={parseMechanism(source)} controls />;
}`;

function reference(item: ReferenceDefinition): string {
  const href = item.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`
    : item.doi ? `https://doi.org/${item.doi}`
    : item.reactome ? `https://reactome.org/content/detail/${item.reactome}`
    : item.url;
  const source = item.pmid ? `PMID ${item.pmid}` : item.doi ? `doi:${item.doi}` : item.reactome ? `Reactome ${item.reactome}` : '';
  const text = escapeHtml(item.citation ?? item.id);
  return `<li>${href ? `<a href="${escapeHtml(href)}" rel="noopener">${text}</a>` : text}${source ? ` <small>${escapeHtml(source)}</small>` : ''}</li>`;
}

function step(item: MechanismStep, index: number): string {
  const text = item.description ?? item.summary;
  return `<li><h3><span>${index + 1}</span> ${escapeHtml(item.title)}</h3>
${text ? `<p>${escapeHtml(text.trim())}</p>` : ''}
${item.keyEvents?.length ? `<ul>${item.keyEvents.map(event => `<li>${escapeHtml(event)}</li>`).join('')}</ul>` : ''}</li>`;
}

const cards = (items: { title: string; text: string; href?: string }[]) => `<ul class="cards">${items.map(item => `<li>
<h3>${item.href ? `<a href="${item.href}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</h3>
<p>${escapeHtml(item.text)}</p></li>`).join('')}</ul>`;

const exampleCards = () => cards([
  ...EXAMPLE_PAGES.map(page => ({ title: page.name, text: page.lede, href: `/examples/${page.slug}/` })),
  ...VIEWER_ONLY.map(item => ({ title: item.name, text: item.note, href: `/app/#/mechanisms/${item.mechanism}` })),
]);

const person = { ...AUTHOR };
/** The site and the software, as a page other than the home page names them: the same `@id`, with enough to stand alone. */
const WEBSITE_REFERENCE = { '@type': 'WebSite', '@id': WEBSITE_ID, name: 'Molecular Motion', url: url('/') };
const SOFTWARE_REFERENCE = { '@type': 'SoftwareSourceCode', '@id': SOFTWARE_ID, name: 'Molecular Motion', url: url('/'), codeRepository: REPOSITORY, programmingLanguage: 'TypeScript' };
const webPage = (page: { path: string; title: string; description: string }, about: object[]) => ({
  '@type': 'WebPage',
  '@id': url(page.path),
  url: url(page.path),
  name: page.title,
  description: page.description,
  inLanguage: 'en',
  isPartOf: WEBSITE_REFERENCE,
  about,
  author: { '@id': AUTHOR['@id'] },
});

// ---- Pages ----

function home(): Page {
  const title = 'Molecular Motion — Interactive Molecular Biology Visualization Library';
  const description = 'Open-source TypeScript library for creating interactive, animated SVG visualizations of proteins, DNA, RNA, molecular interactions and biological mechanisms.';
  const hero = MECHANISMS['parp1-ssb-repair']!;
  const body = `<section class="hero">
<h1>Molecular Motion</h1>
<p class="hero__tagline">${TAGLINE}</p>
<p class="lede">${DEFINITION} You describe a mechanism in YAML or JSON: the molecules that take part and what happens step by step. It draws the proteins, DNA, RNA, membranes and compartments, animates each step into the next, and gives you a player to navigate them.</p>
<p class="actions"><a class="button" href="#install">Install</a><a class="button button--quiet" href="/app/">Open the viewer</a><a class="button button--quiet" href="${REPOSITORY}">GitHub</a></p>
</section>

<section aria-labelledby="demo">
<h2 id="demo">A mechanism, drawn from its description</h2>
<p>This is ${escapeHtml(hero.definition.mechanism.name)}, one of the <a href="/examples/">examples</a>. Step through it with the controls or the arrow keys. Nothing in it was drawn by hand: see <a href="/examples/dna-repair/">how the DNA repair example is written</a>.</p>
${figure(hero, 'parylation')}
</section>

<section aria-labelledby="capabilities">
<h2 id="capabilities">What it draws</h2>
${cards(CAPABILITIES)}
</section>

<section aria-labelledby="install">
<h2 id="install">Install</h2>
<p>Three packages, versioned together. They are ES modules for Node.js 20 or newer and for any bundler.</p>
${code('npm install @molecular-motion/core @molecular-motion/svg     # figures, with or without a browser\nnpm install @molecular-motion/core @molecular-motion/react   # the React player', 'Terminal')}
<p>A mechanism is a list of actors and a list of steps. Each step is a list of actions on those actors:</p>
${code(QUICK_START, 'mechanism.yaml')}
<p>The React player turns that file into an animated figure with controls:</p>
${code(REACT_USAGE('mechanism.yaml'), 'Figure.tsx')}
<p>Without React, <code>@molecular-motion/svg</code> gives the SVG of any step as a string, in Node or in a browser. The <a href="${REPOSITORY}#readme">README</a> shows both, <a href="${DOCS}/language.md">the language</a> describes every part of a document, and <a href="${DOCS}/actions.md">Actions</a> lists every action a step can contain.</p>
</section>

<section aria-labelledby="use-cases">
<h2 id="use-cases">What it is for</h2>
${cards(USE_CASES)}
</section>

<section aria-labelledby="examples">
<h2 id="examples">Examples</h2>
<p>Seven mechanisms come with the repository. Each one is a single YAML file.</p>
${exampleCards()}
</section>

<section aria-labelledby="scope">
<h2 id="scope">What molecules do, not what they look like</h2>
<p>Molecular Motion explains a mechanism: who binds whom, what is modified, what moves where, and in what order. It works at the level of a figure in a review or a slide in a lecture.</p>
<ul class="plain">
<li><strong>It is not a molecular structure viewer.</strong> Tools such as Mol* and NGL show the three-dimensional structure of a molecule from atomic coordinates. Molecular Motion draws schematic molecules and does not read PDB files.</li>
<li><strong>It is not a pathway or network browser.</strong> Tools such as Cytoscape.js lay out graphs of many nodes and edges. Molecular Motion follows a few molecules through the steps of one mechanism.</li>
<li><strong>It is not a simulation.</strong> No kinetics, stoichiometry or physics are computed. The steps are the ones the author wrote, and the compiler checks that they are consistent.</li>
<li><strong>It is not a drawing tool.</strong> There is no canvas to draw on. The figure is generated from data, so it can be reviewed, versioned and changed like code.</li>
</ul>
</section>

<section aria-labelledby="faq">
<h2 id="faq">Questions</h2>
<dl class="faq">${FAQ.map(item => `<dt>${escapeHtml(item.question)}</dt><dd>${escapeHtml(item.answer)}</dd>`).join('')}</dl>
</section>

<section aria-labelledby="links">
<h2 id="links">Documentation and source</h2>
<ul class="plain">
<li><a href="${DOCS}/language.md">The language</a>: every part of a mechanism document.</li>
<li><a href="${DOCS}/actions.md">Actions</a>: every action, with its fields.</li>
<li><a href="/app/#/visual-language">Visual language</a>: the catalog of SVG primitives for proteins, nucleic acids, lesions, modifications and membranes.</li>
<li><a href="/app/#/playground">Playground</a>: edit a YAML document and see the figure change.</li>
<li><a href="${REPOSITORY}">Source code on GitHub</a>, and the packages on npm: <a href="${NPM}/core">core</a>, <a href="${NPM}/svg">svg</a> and <a href="${NPM}/react">react</a>.</li>
</ul>
</section>`;
  const graph = [
    { '@type': 'WebSite', '@id': WEBSITE_ID, url: url('/'), name: 'Molecular Motion', description: TAGLINE, inLanguage: 'en', publisher: { '@id': AUTHOR['@id'] } },
    {
      '@type': 'SoftwareSourceCode',
      '@id': SOFTWARE_ID,
      name: 'Molecular Motion',
      description,
      url: url('/'),
      codeRepository: REPOSITORY,
      programmingLanguage: 'TypeScript',
      runtimePlatform: 'Node.js, web browsers',
      license: 'https://opensource.org/licenses/MIT',
      keywords: 'molecular biology visualization, molecular mechanism visualization, molecular interaction visualization, protein-DNA interactions, DNA repair visualization, cell biology visualization, scientific visualization, SVG, TypeScript, JavaScript',
      author: { '@id': AUTHOR['@id'] },
      maintainer: { '@id': AUTHOR['@id'] },
    },
    person,
  ];
  return { path: '/', title, description, body, graph, player: true };
}

function examplesIndex(): Page {
  const title = 'Molecular Biology Visualization Examples | Molecular Motion';
  const description = 'Interactive SVG examples built with Molecular Motion: DNA repair, protein–DNA interactions, gene expression, membrane receptor signalling and cell signalling.';
  const body = `<section class="hero hero--page">
<h1>Molecular biology visualization examples</h1>
<p class="lede">Mechanisms drawn and animated by Molecular Motion. Each one is a single YAML file in the <a href="${REPOSITORY}/tree/main/examples">repository</a>, which you can open in the <a href="/app/#/playground">playground</a> and change.</p>
</section>
<section aria-labelledby="explained">
<h2 id="explained">Explained step by step</h2>
${cards(EXAMPLE_PAGES.map(page => ({ title: page.name, text: page.lede, href: `/examples/${page.slug}/` })))}
</section>
<section aria-labelledby="viewer">
<h2 id="viewer">More mechanisms in the viewer</h2>
${cards(VIEWER_ONLY.map(item => ({ title: item.name, text: item.note, href: `/app/#/mechanisms/${item.mechanism}` })))}
</section>`;
  const page = { path: '/examples/', title, description };
  return { ...page, body, crumbs: [{ name: 'Molecular Motion', path: '/' }, { name: 'Examples', path: '/examples/' }], graph: [webPage(page, [SOFTWARE_REFERENCE]), person] };
}

function example(page: ExamplePage): Page {
  const mechanism = MECHANISMS[page.mechanism];
  if (!mechanism) throw new Error(`Example page "${page.slug}" names an unknown mechanism "${page.mechanism}"`);
  const definition: MechanismDefinition = mechanism.definition;
  const file = `${definition.mechanism.id}.yaml`;
  const path = `/examples/${page.slug}/`;
  const paragraphs = (items: string[]) => items.map(item => `<p>${item}</p>`).join('\n');
  const body = `<section class="hero hero--page">
<h1>${escapeHtml(page.heading)}</h1>
<p class="lede">${escapeHtml(page.lede)}</p>
</section>

<section>
<h2 id="figure">${escapeHtml(definition.mechanism.name)}</h2>
<p>Step through the mechanism with the controls or the arrow keys, or <a href="/app/#/mechanisms/${definition.mechanism.id}">open it in the viewer</a> for the timeline, the thumbnails and SVG or PNG export.</p>
${figure(mechanism, page.poster)}
</section>

<section aria-labelledby="biology">
<h2 id="biology">The mechanism</h2>
${paragraphs(page.biology)}
<ol class="steps">${definition.steps.map(step).join('\n')}</ol>
<p class="note">A schematic, explanatory model: it shows the order of events, not stoichiometry or kinetics.</p>
</section>

<section aria-labelledby="representation">
<h2 id="representation">How Molecular Motion represents it</h2>
${paragraphs(page.representation)}
${code(excerpt(page, mechanism.source), `From examples/${file}`)}
<p>That is part of <a href="${REPOSITORY}/blob/main/examples/${file}">the complete file</a>. Showing it on a page takes a few lines:</p>
${code(REACT_USAGE(file), 'Figure.tsx')}
<p><a href="${DOCS}/language.md">The language</a> describes actors, sites and coordinates, and <a href="${DOCS}/actions.md">Actions</a> lists every action used here. To change this mechanism and see the result, paste the file into the <a href="/app/#/playground">playground</a>.</p>
</section>

${definition.references.length ? `<section aria-labelledby="references">
<h2 id="references">References</h2>
<ul class="references">${definition.references.map(reference).join('\n')}</ul>
</section>` : ''}

<section aria-labelledby="related">
<h2 id="related">Related examples</h2>
${cards(page.related.map(item => ({ title: item.label, text: item.note, href: item.href })))}
<p><a href="/examples/">All examples</a> · <a href="/">About Molecular Motion</a> · <a href="${REPOSITORY}">Source on GitHub</a></p>
</section>`;
  return {
    path,
    title: page.title,
    description: page.description,
    body,
    crumbs: [{ name: 'Molecular Motion', path: '/' }, { name: 'Examples', path: '/examples/' }, { name: page.name, path }],
    graph: [webPage({ path, title: page.title, description: page.description }, [SOFTWARE_REFERENCE, { '@type': 'Thing', name: page.name }]), person],
    player: true,
  };
}

export const sitePages = (): Page[] => [home(), examplesIndex(), ...EXAMPLE_PAGES.map(example)];

// No <lastmod>: the build has no date for a page that is more than the time of the build itself.
const sitemap = (pages: Page[]) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(page => `  <url><loc>${url(page.path)}</loc></url>`).join('\n')}
</urlset>
`;

const ROBOTS = `User-agent: *
Allow: /

Sitemap: ${url('/sitemap.xml')}
`;

/** A plain-text summary for assistants that read a site's /llms.txt. It says what the pages say, without markup. */
const llms = (pages: Page[]) => `# Molecular Motion

> ${DEFINITION}

A mechanism is described in YAML or JSON: the molecules that take part (proteins, DNA, RNA, small molecules, complexes), where they are (membranes and cell compartments) and what happens step by step (binding, recruitment, activation, inhibition, modification, cleavage, ligation, synthesis, degradation, translocation). The library draws it as SVG, animates each step into the next, and provides a React player. It shows what molecules do in a mechanism; it is not a 3D structure viewer and not a simulation.

- Language: TypeScript. Runs in Node.js 20 or newer and in browsers.
- Packages: @molecular-motion/core (language, validation, state), @molecular-motion/svg (layout and SVG), @molecular-motion/react (player).
- License: MIT.

## Pages

${pages.map(page => `- [${page.title}](${url(page.path)}): ${page.description}`).join('\n')}

## Documentation

- [README](${REPOSITORY}#readme): installation and usage
- [The language](${DOCS}/language.md): every part of a mechanism document
- [Actions](${DOCS}/actions.md): every action a step can contain
- [Example mechanisms](${REPOSITORY}/tree/main/examples): complete YAML files

## Questions

${FAQ.map(item => `### ${item.question}\n\n${item.answer}`).join('\n\n')}
`;

/** Every file of the static site, with the path it is served at. */
export function renderSite(assets: SiteAssets): SiteFile[] {
  const pages = sitePages();
  return [
    ...pages.map(page => ({ path: `${page.path.slice(1)}index.html`, content: document(page, assets) })),
    { path: 'sitemap.xml', content: sitemap(pages) },
    { path: 'robots.txt', content: ROBOTS },
    { path: 'llms.txt', content: llms(pages) },
  ];
}
