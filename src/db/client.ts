import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/lib/env'
import * as schema from '@/db/schema'

const globalForDb = globalThis as unknown as { db: ReturnType<typeof drizzle> | undefined }

export const db =
  globalForDb.db ??
  drizzle(postgres(env.DATABASE_URL), {
    schema,
    logger: true,
  })

if (process.env.NODE_ENV !== 'production') globalForDb.db = db
