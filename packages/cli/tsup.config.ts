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
  // External: native modules, optional dependencies, and core (to ensure single registry instance)
  external: [
    'better-sqlite3',   // Native module - must be installed by user
    'kysely',           // Database ORM - peer dependency
    '@stacksolo/api',   // Optional - only needed for `stacksolo serve`
    '@stacksolo/core',  // MUST be external to share registry with dynamically loaded plugins
  ],
  // Bundle all workspace packages into the CLI (except core which must be shared)
  noExternal: [
    '@stacksolo/blueprint',
    '@stacksolo/registry',
    '@stacksolo/shared',
  ],
});
