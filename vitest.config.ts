import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    // Redirect all DB writes to the test database so query functions (which use
    // the global `db` singleton keyed to DATABASE_URL) hit the same DB as testDb.
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
    },
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
