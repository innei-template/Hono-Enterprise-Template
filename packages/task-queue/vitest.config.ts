import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      reporter: ['text'],
      exclude: ['src/index.ts', 'src/drivers/redis.driver.ts', 'vitest.config.ts'],
    },
    maxConcurrency: 1,
  },
})
