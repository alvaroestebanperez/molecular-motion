import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@molecular-motion/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@molecular-motion/svg': fileURLToPath(new URL('./packages/svg/src/index.ts', import.meta.url)),
    },
  },
});
