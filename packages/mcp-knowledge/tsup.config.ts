import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  dts: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  // Bundle workspace dependencies so they're included in the package
  noExternal: ['@stacksolo/core', '@stacksolo/blueprint', '@stacksolo/plugin-gcp-cdktf'],
});
