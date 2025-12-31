import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  // Don't bundle workspace dependencies - they need to be resolved at runtime
  external: [
    '@stacksolo/api',
    '@stacksolo/core',
    '@stacksolo/shared',
    '@stacksolo/plugin-gcp-cdktf',
  ],
  // Bundle everything else including local imports
  noExternal: [],
});
