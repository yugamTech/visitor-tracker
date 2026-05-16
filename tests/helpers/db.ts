import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/lib/env'
import * as schema from '@/db/schema'
import { sql } from 'drizzle-orm'
import { seed } from '@/db/seed'

// Create test database connection
const testConnection = postgres(env.TEST_DATABASE_URL!)

export const testDb = drizzle(testConnection, {
  schema,
  logger: false,
})

// Reset database by truncating all tables via cascade from root tenant table
export async function resetDb() {
  // Truncate tenants with CASCADE to automatically truncate all dependent tables,
  // RESTART IDENTITY to reset all sequences
  await testDb.execute(
    sql`TRUNCATE TABLE "tenants" RESTART IDENTITY CASCADE`,
  )
}

// Seed test data using the same seed function as CLI
export async function seedTestData() {
  await seed(testDb)
}
