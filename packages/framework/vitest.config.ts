import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    maxConcurrency: 1,
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
      reporter: ['text', 'html'],
    },
  },
  esbuild: false,
  plugins: [swc.vite()],
})
