import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileMechanism } from '@molecular-motion/core';
import { parseMechanism } from '@molecular-motion/core/yaml';
import { EXAMPLE_PAGES, MECHANISMS, QUICK_START, SITE, USE_CASES, VIEWER_ONLY } from '../src/site/pages';
import { renderSite, yamlEntry } from '../src/site/render';

const files = renderSite({ css: '/assets/site.css', player: '/assets/embed.js' });
const pages = files.filter(file => file.path.endsWith('.html'));
const pathOf = (file: { path: string }) => `/${file.path.replace(/index\.html$/, '')}`;
const all = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map(match => match[1]!);
const repository = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

describe('static site', () => {
  it('has a landing, an index of examples and a page for each example', () => {
    expect(pages.map(pathOf)).toEqual(['/', '/examples/', ...EXAMPLE_PAGES.map(page => `/examples/${page.slug}/`)]);
  });

  it.each(pages)('$path has the metadata a crawler reads', page => {
    const { content } = page;
    const title = all(content, /<title>([^<]*)<\/title>/g);
    expect(title).toHaveLength(1);
    expect(title[0]!.length).toBeLessThanOrEqual(70);
    const description = all(content, /<meta name="description" content="([^"]*)">/g);
    expect(description).toHaveLength(1);
    expect(description[0]!.length).toBeGreaterThan(70);
    expect(description[0]!.length).toBeLessThanOrEqual(160);
    expect(all(content, /<link rel="canonical" href="([^"]*)">/g)).toEqual([`${SITE}${pathOf(page)}`]);
    expect(all(content, /<meta property="og:url" content="([^"]*)">/g)).toEqual([`${SITE}${pathOf(page)}`]);
    expect(content).not.toMatch(/noindex/);
  });

  it.each(pages)('$path has one h1 and no skipped heading level', ({ content }) => {
    const levels = all(content, /<h([1-6])[\s>]/g).map(Number);
    expect(levels.filter(level => level === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    levels.forEach((level, index) => { if (index) expect(level - levels[index - 1]!).toBeLessThanOrEqual(1); });
  });

  it.each(pages)('$path carries structured data that names the author by the id of alvaroesteban.dev', page => {
    const blocks = all(page.content, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
    expect(blocks).toHaveLength(1);
    const graph = JSON.parse(blocks[0]!)['@graph'] as { '@type': string; '@id'?: string; itemListElement?: { item: string }[] }[];
    expect(graph.filter(node => node['@type'] === 'Person').map(node => node['@id'])).toEqual(['https://alvaroesteban.dev/#person']);
    const breadcrumb = graph.find(node => node['@type'] === 'BreadcrumbList');
    if (pathOf(page) === '/') {
      expect(graph.map(node => node['@type'])).toContain('SoftwareSourceCode');
      expect(breadcrumb).toBeUndefined();
    } else {
      expect(breadcrumb!.itemListElement!.at(-1)!.item).toBe(`${SITE}${pathOf(page)}`);
      // The page is about the software of the home page, by the same id, and says where its code is.
      const about = (graph.find(node => node['@type'] === 'WebPage') as unknown as { '@id': string; about: { '@id'?: string; codeRepository?: string }[] });
      expect(about['@id']).toBe(`${SITE}${pathOf(page)}`);
      expect(about.about[0]).toMatchObject({ '@id': `${SITE}/#software`, codeRepository: 'https://github.com/alvaroestebanperez/molecular-motion' });
    }
  });

  it('links only to pages that exist, with their trailing slash', () => {
    const known = new Set([...pages.map(pathOf), '/app/', '/assets/site.css']);
    const mechanisms = new Set(Object.keys(MECHANISMS));
    for (const { content } of pages) {
      for (const href of all(content, /href="(\/[^"]*)"/g)) {
        const [path, hash = ''] = href.split('#');
        expect(known, href).toContain(path);
        const mechanism = hash.match(/^\/mechanisms\/(.+)$/)?.[1];
        if (mechanism) expect(mechanisms, href).toContain(mechanism);
      }
      // In-page anchors point at an id of the same page.
      for (const anchor of all(content, /href="#([^"]+)"/g)) expect(content, `#${anchor}`).toContain(`id="${anchor}"`);
    }
  });

  it('leaves no page without a link to it from another page', () => {
    for (const page of pages) {
      const others = pages.filter(other => other !== page).map(other => other.content).join('');
      expect(others, pathOf(page)).toContain(`href="${pathOf(page)}"`);
    }
  });

  it('lists every page in the sitemap, once, without a date', () => {
    const sitemap = files.find(file => file.path === 'sitemap.xml')!.content;
    expect(all(sitemap, /<loc>([^<]*)<\/loc>/g)).toEqual(pages.map(page => `${SITE}${pathOf(page)}`));
    expect(sitemap).not.toContain('lastmod');
    expect(files.find(file => file.path === 'robots.txt')!.content).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  it('draws the figure of each example and hands its mechanism to the player', () => {
    for (const page of pages.filter(item => item.content.includes('data-player'))) {
      expect(page.content).toMatch(/<figure><svg[^>]*class="mm-svg mm-export/);
      const data = page.content.match(/<script type="application\/json">([\s\S]*?)<\/script>/)![1]!;
      expect(() => compileMechanism(JSON.parse(data))).not.toThrow();
    }
  });

  it('quotes the examples as they are written, and a quick start that compiles', () => {
    expect(() => compileMechanism(parseMechanism(QUICK_START))).not.toThrow();
    for (const page of EXAMPLE_PAGES) {
      const { source, definition } = MECHANISMS[page.mechanism]!;
      expect(definition.steps.map(step => step.id)).toContain(page.poster);
      for (const id of page.excerpt.actors) expect(source).toContain(yamlEntry(source, 'actors', id));
      for (const id of page.excerpt.steps) expect(yamlEntry(source, 'steps', id)).toMatch(/\n {4}actions:/);
      expect(existsSync(repository(`examples/${definition.mechanism.id}.yaml`))).toBe(true);
    }
  });

  it('gives every mechanism of the viewer a way in from the site', () => {
    const linked = new Set([...EXAMPLE_PAGES.map(page => page.mechanism), ...VIEWER_ONLY.map(item => item.mechanism)]);
    expect([...linked].sort()).toEqual(Object.keys(MECHANISMS).sort());
    for (const item of USE_CASES) if (item.href) expect(item.href).toMatch(/^\/(examples\/[a-z-]+\/|app\/#\/mechanisms\/[a-z0-9-]+)$/);
  });

  it('has the social card its pages name', () => {
    const card = readFileSync(repository('apps/demo/public/og.png'));
    // PNG header: width and height are the two big-endian integers after the IHDR tag.
    expect([card.readUInt32BE(16), card.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});
