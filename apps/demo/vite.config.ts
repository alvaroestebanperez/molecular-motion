import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { createServer, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { SiteAssets, SiteFile } from './src/site/render';

const source = (path: string) => fileURLToPath(new URL(`../../packages/${path}`, import.meta.url));

/**
 * The JSON Schemas are served at `/schema/v<n>.json`, the URL each one carries as its `$id`. They are
 * read from the core package at build time, so the site can never publish a copy that has drifted.
 */
function schemas(): Plugin {
  const directory = source('core');
  const files = () => readdirSync(directory).filter(file => /^schema(\.v\d+)?\.json$/.test(file)).map(file => {
    const text = readFileSync(`${directory}/${file}`, 'utf8');
    return { name: `schema/${new URL(JSON.parse(text).$id).pathname.split('/').pop()}`, text };
  });
  return {
    name: 'molecular-motion-schemas',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const found = files().find(file => request.url === `/${file.name}`);
        if (!found) return next();
        response.setHeader('Content-Type', 'application/schema+json; charset=utf-8');
        response.end(found.text);
      });
    },
    generateBundle() {
      for (const file of files()) this.emitFile({ type: 'asset', fileName: file.name, source: file.text });
    },
  };
}

// Use package sources directly so the demo never runs against stale builds.
const alias = {
  // The more specific entry first: an alias matches by prefix.
  '@molecular-motion/core/yaml': source('core/src/yaml.ts'),
  '@molecular-motion/core': source('core/src/index.ts'),
  '@molecular-motion/svg': source('svg/src/index.ts'),
  '@molecular-motion/react': source('react/src/index.tsx'),
};

const SITE_MODULE = '/src/site/render.ts';
const SITE_CSS = 'src/site/site.css';
const CONTENT_TYPES: Record<string, string> = { html: 'text/html', xml: 'application/xml', txt: 'text/plain' };
const SITE_FILES = ['sitemap.xml', 'robots.txt', 'llms.txt'];
type SiteModule = { renderSite(assets: SiteAssets): SiteFile[] };

/**
 * The static pages: the landing at `/`, the examples, `sitemap.xml`, `robots.txt` and `llms.txt`.
 * `src/site/render.ts` writes them, from the same package sources and example files the viewer uses.
 * The viewer itself is the page at `/app/`.
 */
function site(): Plugin {
  let root = '';
  return {
    name: 'molecular-motion-site',
    configResolved(config) { root = config.root; },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        try {
          const path = (request.url ?? '/').split('?')[0]!.slice(1);
          if (path.startsWith('app/') || !(path === '' || path.endsWith('/') || SITE_FILES.includes(path))) return next();
          const { renderSite } = await server.ssrLoadModule(SITE_MODULE) as SiteModule;
          const file = renderSite({ css: `/${SITE_CSS}`, player: '/src/embed.tsx' }).find(item => item.path === (path === '' || path.endsWith('/') ? `${path}index.html` : path));
          if (!file) return next();
          const extension = file.path.split('.').pop()!;
          response.setHeader('Content-Type', `${CONTENT_TYPES[extension]}; charset=utf-8`);
          response.end(extension === 'html' ? await server.transformIndexHtml(request.url ?? '/', file.content) : file.content);
        } catch (error) { next(error); }
      });
    },
    async generateBundle(_options, bundle) {
      const player = Object.values(bundle).find(file => file.type === 'chunk' && file.isEntry && file.name === 'embed');
      if (!player) throw new Error('The player of the static pages (src/embed.tsx) is not in the bundle');
      const css = this.emitFile({ type: 'asset', name: 'site.css', source: readFileSync(`${root}/${SITE_CSS}`, 'utf8') });
      // A server only to load the module: it resolves the aliases and the `?raw` imports as the build does.
      const loader = await createServer({ configFile: false, root, resolve: { alias }, appType: 'custom', server: { middlewareMode: true, ws: false, hmr: false }, optimizeDeps: { noDiscovery: true } });
      try {
        const { renderSite } = await loader.ssrLoadModule(SITE_MODULE) as SiteModule;
        for (const file of renderSite({ css: `/${this.getFileName(css)}`, player: `/${player.fileName}` })) this.emitFile({ type: 'asset', fileName: file.path, source: file.content });
      } finally { await loader.close(); }
    },
  };
}

export default defineConfig({
  plugins: [react(), schemas(), site()],
  resolve: { alias },
  build: {
    rollupOptions: {
      // Two entries: the viewer, and the player the static pages load.
      input: { app: 'app/index.html', embed: 'src/embed.tsx' },
    },
  },
});
