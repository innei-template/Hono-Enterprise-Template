import { defineConfig } from 'eslint-config-hyoban'

export default defineConfig(
  {
    formatting: false,
  },
  {
    rules: {
      'unicorn/no-useless-undefined': 0,
      '@typescript-eslint/no-unsafe-function-type': 0,
    },
  },
)
