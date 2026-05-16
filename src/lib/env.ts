import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    TEST_DATABASE_URL: z.string().url().optional(),
    AUTH_SECRET: z.string().min(32),
    AUTH_URL: z.string().url(),
    DEV_TENANT_SLUG: z.string().default('yugam'),
    MSG91_AUTH_KEY: z.string().min(1).or(z.literal('')).default(''),
    MSG91_TEMPLATE_VISITOR_ARRIVAL: z.string().min(1).or(z.literal('')).default(''),
    MSG91_TEMPLATE_PASS_ISSUED: z.string().min(1).or(z.literal('')).default(''),
    R2_ACCOUNT_ID: z.string().min(1).or(z.literal('')).default(''),
    R2_ACCESS_KEY_ID: z.string().min(1).or(z.literal('')).default(''),
    R2_SECRET_ACCESS_KEY: z.string().min(1).or(z.literal('')).default(''),
    R2_BUCKET: z.string().min(1).or(z.literal('')).default(''),
    R2_PUBLIC_BASE_URL: z.string().url().or(z.literal('')).default(''),
  },
  client: {
    NEXT_PUBLIC_APP_NAME: z.string().default('VisitorTrack'),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    DEV_TENANT_SLUG: process.env.DEV_TENANT_SLUG,
    MSG91_AUTH_KEY: process.env.MSG91_AUTH_KEY,
    MSG91_TEMPLATE_VISITOR_ARRIVAL: process.env.MSG91_TEMPLATE_VISITOR_ARRIVAL,
    MSG91_TEMPLATE_PASS_ISSUED: process.env.MSG91_TEMPLATE_PASS_ISSUED,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
    R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  },
})
