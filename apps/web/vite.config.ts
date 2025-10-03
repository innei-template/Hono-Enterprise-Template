import { env } from 'node:process'

import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

const API_PORT = Number(env.CORE_PORT ?? 3000)
const API_HOST = env.CORE_HOST ?? '0.0.0.0'

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: `http://${API_HOST}:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  plugins: [tsconfigPaths()],
})
