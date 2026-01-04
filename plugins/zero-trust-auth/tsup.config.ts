import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/runtime.ts', 'src/client.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2020', // Browser-compatible for client.ts
  sourcemap: true,
});
