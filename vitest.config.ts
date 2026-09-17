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
    // Serialize file execution — the isolation tests all seed users with the
    // same test-hamsportal- prefix and cleanupAll deletes anything with that
    // prefix, so parallel files nuke each other's seed data mid-run.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
