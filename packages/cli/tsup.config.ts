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
  // Mark these as external - they have native dependencies or special requirements
  external: [
    '@stacksolo/plugin-gcp',
    '@stacksolo/api',
    '@stacksolo/registry',
    'better-sqlite3',
  ],
  // Bundle workspace dependencies for clean imports (no .js extensions needed)
  noExternal: [
    '@stacksolo/blueprint',
    '@stacksolo/core',
    '@stacksolo/shared',
    '@stacksolo/plugin-gcp-cdktf',
  ],
});
