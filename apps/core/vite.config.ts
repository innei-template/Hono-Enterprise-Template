import { builtinModules } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

const NODE_BUILT_IN_MODULES = builtinModules.filter((m) => !m.startsWith('_'))
NODE_BUILT_IN_MODULES.push(...NODE_BUILT_IN_MODULES.map((m) => `node:${m}`))

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    rollupOptions: {
      external: NODE_BUILT_IN_MODULES,

      input: {
        main: resolve(__dirname, 'src/index.ts'),
      },
    },
  },
})
