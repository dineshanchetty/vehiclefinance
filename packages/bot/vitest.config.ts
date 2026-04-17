import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
  // Resolve .js extensions to .ts in tests (TypeScript ESM with NodeNext)
  resolve: {
    alias: {
      // Allow vitest to resolve NodeNext .js imports to their .ts sources
    },
    extensions: ['.ts', '.js'],
  },
});
