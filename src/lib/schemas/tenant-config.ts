import { z } from 'zod'

export const TenantConfigSchema = z.object({
  branding: z
    .object({
      primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i),
      logoUrl: z.string().url().optional(),
    })
    .optional(),
  badge: z
    .object({
      templateId: z.enum(['simple', 'with-photo']).default('with-photo'),
      showHostName: z.boolean().default(true),
    })
    .optional(),
  requestExpiryMinutes: z.number().int().min(5).max(240).default(30),
  smsNotifyAdminIds: z.array(z.number().int().positive()).default([]),
  retentionDays: z.number().int().min(30).max(3650).default(90),
})

export type TenantConfig = z.infer<typeof TenantConfigSchema>
