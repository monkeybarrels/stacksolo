import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/runtime.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node18',
  sourcemap: true,
});
