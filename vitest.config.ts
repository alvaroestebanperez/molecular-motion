import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The more specific entry first: an alias matches by prefix.
      '@molecular-motion/core/yaml': fileURLToPath(new URL('./packages/core/src/yaml.ts', import.meta.url)),
      '@molecular-motion/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@molecular-motion/svg': fileURLToPath(new URL('./packages/svg/src/index.ts', import.meta.url)),
    },
  },
});
