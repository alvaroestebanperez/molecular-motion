import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const source = (path: string) => fileURLToPath(new URL(`../../packages/${path}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
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
