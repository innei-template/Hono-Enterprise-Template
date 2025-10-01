import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      reporter: ['text'],
    },
    setupFiles: ['./vitest.setup.ts'],
    maxConcurrency: 1,
  },
})
