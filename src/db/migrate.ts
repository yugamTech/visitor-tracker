// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config()

import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db } from '@/db/client'

async function main() {
  await migrate(db, { migrationsFolder: './src/db/migrations' })
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
