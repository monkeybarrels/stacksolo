import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node18',
  outDir: 'dist',
  sourcemap: true,
  external: ['@stacksolo/core', 'cdktf', 'constructs', '@cdktf/provider-google'],
});
