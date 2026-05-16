// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config()

import { hash } from 'bcryptjs'
import { db } from '@/db/client'
import { tenants, adminGroups, users, userGroups, visitTypes } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { TenantConfigSchema, type TenantConfig } from '@/lib/schemas/tenant-config'

const YUGAM_SLUG = 'yugam'
const SEED_PASSWORD = 'Pass@1234'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seed(seedDb?: any) {
  const dbInstance = seedDb || db
  try {
    // Hash password once
    const passwordHash = await hash(SEED_PASSWORD, 12)

    // 1. Upsert tenant
    const tenantConfig: TenantConfig = {
      branding: {
        primaryColor: '#0F2A47',
      },
      badge: {
        templateId: 'with-photo',
        showHostName: true,
      },
      requestExpiryMinutes: 30,
      smsNotifyAdminIds: [],
      retentionDays: 90,
    }

    const parsedConfig = TenantConfigSchema.parse(tenantConfig)

    const existingTenant = await dbInstance
      .select()
      .from(tenants)
      .where(eq(tenants.slug, YUGAM_SLUG))
      .limit(1)

    let tenantId: number

    if (existingTenant.length > 0) {
      // Update existing tenant
      await dbInstance
        .update(tenants)
        .set({
          name: 'Yugam International School',
          config: parsedConfig as never,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, existingTenant[0]!.id))
      tenantId = existingTenant[0]!.id
    } else {
      // Insert new tenant
      const inserted = await dbInstance
        .insert(tenants)
        .values({
          slug: YUGAM_SLUG,
          name: 'Yugam International School',
          config: parsedConfig as never,
        })
        .returning()

      tenantId = inserted[0]!.id
    }

    // 2. Upsert admin groups
    const groupsData = [
      { name: 'Office', slug: 'office' },
      { name: 'Teachers', slug: 'teachers' },
      { name: 'Management', slug: 'management' },
      { name: 'Operations', slug: 'operations' },
    ]

    const groupMap = new Map<string, number>()

    for (const groupData of groupsData) {
      const existing = await dbInstance
        .select()
        .from(adminGroups)
        .where(and(eq(adminGroups.tenantId, tenantId), eq(adminGroups.slug, groupData.slug)))
        .limit(1)

      if (existing.length > 0) {
        groupMap.set(groupData.slug, existing[0]!.id)
      } else {
        const inserted = await dbInstance
          .insert(adminGroups)
          .values({
            tenantId,
            name: groupData.name,
            slug: groupData.slug,
          })
          .returning()

        groupMap.set(groupData.slug, inserted[0]!.id)
      }
    }

    // 3. Upsert users
    const usersData: Array<{
      name: string
      email: string
      role: 'super_admin' | 'admin' | 'guard'
      groupSlugs: string[]
    }> = [
      {
        name: 'Super Admin',
        email: 'super@yugam.test',
        role: 'super_admin',
        groupSlugs: [],
      },
      {
        name: 'Principal',
        email: 'principal@yugam.test',
        role: 'admin',
        groupSlugs: ['office', 'management'],
      },
      {
        name: 'Class Teacher',
        email: 'teacher1@yugam.test',
        role: 'admin',
        groupSlugs: ['teachers'],
      },
      {
        name: 'Ops Manager',
        email: 'ops@yugam.test',
        role: 'admin',
        groupSlugs: ['operations'],
      },
      {
        name: 'Main Gate',
        email: 'guard@yugam.test',
        role: 'guard',
        groupSlugs: [],
      },
    ]

    for (const userData of usersData) {
      const existing = await dbInstance
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.email, userData.email)))
        .limit(1)

      let userId: number

      if (existing.length > 0) {
        // Update existing user
        await dbInstance
          .update(users)
          .set({
            name: userData.name,
            role: userData.role,
            passwordHash,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing[0]!.id))
        userId = existing[0]!.id
      } else {
        // Insert new user
        const inserted = await dbInstance
          .insert(users)
          .values({
            tenantId,
            name: userData.name,
            email: userData.email,
            role: userData.role,
            passwordHash,
            isActive: true,
          })
          .returning()

        userId = inserted[0]!.id
      }

      // Upsert group memberships
      for (const groupSlug of userData.groupSlugs) {
        const groupId = groupMap.get(groupSlug)
        if (!groupId) {
          throw new Error(`Group not found: ${groupSlug}`)
        }

        const existing = await dbInstance
          .select()
          .from(userGroups)
          .where(and(eq(userGroups.userId, userId), eq(userGroups.groupId, groupId)))
          .limit(1)

        if (existing.length === 0) {
          await dbInstance.insert(userGroups).values({
            tenantId,
            userId,
            groupId,
          })
        }
      }
    }

    // 4. Upsert visit types
    const visitTypesData = [
      {
        name: 'Parent — General',
        slug: 'parent-general',
        defaultGroupSlug: 'teachers',
      },
      {
        name: 'Vendor',
        slug: 'vendor',
        defaultGroupSlug: 'operations',
      },
      {
        name: 'Contractor',
        slug: 'contractor',
        defaultGroupSlug: 'operations',
      },
      {
        name: 'Guest of Staff',
        slug: 'guest-of-staff',
        defaultGroupSlug: 'management',
      },
    ]

    for (const vTypeData of visitTypesData) {
      const existing = await dbInstance
        .select()
        .from(visitTypes)
        .where(and(eq(visitTypes.tenantId, tenantId), eq(visitTypes.slug, vTypeData.slug)))
        .limit(1)

      const defaultGroupId = groupMap.get(vTypeData.defaultGroupSlug) ?? null

      if (existing.length > 0) {
        // Update existing
        await dbInstance
          .update(visitTypes)
          .set({
            name: vTypeData.name,
            defaultRoutingType: 'group',
            defaultGroupId,
            isActive: true,
          })
          .where(eq(visitTypes.id, existing[0]!.id))
      } else {
        // Insert new
        await dbInstance.insert(visitTypes).values({
          tenantId,
          name: vTypeData.name,
          slug: vTypeData.slug,
          defaultRoutingType: 'group',
          defaultGroupId,
          isActive: true,
        })
      }
    }

    console.log(
      'Seed complete: 1 tenant, 4 groups, 5 users, 4 visit types.',
    )
  } catch (error) {
    console.error('Seed failed:', error)
    throw error
  }
}

// Only exit when called as CLI entry point
if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}
