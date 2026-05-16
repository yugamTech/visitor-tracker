import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

// Note: drizzle-kit runs outside the Next.js runtime, so we use process.env directly here.
// This is the one allowed exception to rule 7 (env access only via src/lib/env.ts).
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
})
