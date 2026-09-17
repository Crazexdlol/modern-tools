import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    include: ['__tests__/**/*.test.ts'],
    setupFiles: ['__tests__/setup/env.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
