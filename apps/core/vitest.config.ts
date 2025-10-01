import swc from 'unplugin-swc'
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
  esbuild: false,
  plugins: [swc.vite()],
})
