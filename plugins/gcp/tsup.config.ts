import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node18',
  outDir: 'dist',
  sourcemap: true,
  // Keep workspace dependencies external to share the same registry instance
  external: ['@stacksolo/core'],
});
