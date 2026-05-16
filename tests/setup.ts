import { env } from '@/lib/env'
import { beforeEach } from 'vitest'
import { resetDb, seedTestData } from './helpers/db'

// Validate test database URL is set
if (!env.TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL environment variable is not set. ' +
      'Please set it in .env.local to run tests. ' +
      'Example: postgresql://user:password@localhost:5432/visitortrack_test',
  )
}

// Reset and reseed database before each test
beforeEach(async () => {
  await resetDb()
  await seedTestData()
})
