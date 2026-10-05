import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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

export default defineConfig({
  plugins: [react(), schemas()],
  // Use package sources directly so the demo never runs against stale builds.
  resolve: {
    alias: {
      // The more specific entry first: an alias matches by prefix.
      '@molecular-motion/core/yaml': source('core/src/yaml.ts'),
      '@molecular-motion/core': source('core/src/index.ts'),
      '@molecular-motion/svg': source('svg/src/index.ts'),
      '@molecular-motion/react': source('react/src/index.tsx'),
    },
  },
});
