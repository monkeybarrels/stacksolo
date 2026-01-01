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
  // External: native modules and optional dependencies
  external: [
    'better-sqlite3',   // Native module - must be installed by user
    'kysely',           // Database ORM - peer dependency
    '@stacksolo/api',   // Optional - only needed for `stacksolo serve`
  ],
  // Bundle all workspace packages into the CLI
  noExternal: [
    '@stacksolo/blueprint',
    '@stacksolo/core',
    '@stacksolo/registry',
    '@stacksolo/shared',
    '@stacksolo/plugin-gcp-cdktf',
  ],
});
