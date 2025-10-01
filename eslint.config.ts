import { defineConfig } from 'eslint-config-hyoban'

export default defineConfig(
  {
    formatting: false,
  },
  {
    languageOptions: {
      parserOptions: {
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },
    rules: {
      'unicorn/no-useless-undefined': 0,
      '@typescript-eslint/no-unsafe-function-type': 0,
    },
  },
)
