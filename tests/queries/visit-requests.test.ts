import { describe, it, expect } from 'vitest'
import { testDb } from '../helpers/db'
import { createVisitRequest, listPendingForUser } from '@/db/queries/visit-requests'
import { tenants, users, userGroups } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { hash } from 'bcryptjs'

describe('visit-requests queries', () => {
  it('createVisitRequest inserts with the right tenantId', async () => {
    const yugamTenant = await testDb
      .select()
      .from(tenants)
      .where(eq(tenants.slug, 'yugam'))
      .limit(1)

    const tenantId = yugamTenant[0]!.id

    const request = await createVisitRequest({
      tenantId,
      code: 'TEST001',
      visitorName: 'John Doe',
      visitorPhone: '+919876543210',
      purpose: 'Pick up document',
      routingType: 'user',
      routingSnapshot: { userIds: [], capturedAt: new Date().toISOString() },
      source: 'public_form',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    })

    expect(request.tenantId).toBe(tenantId)
    expect(request.code).toBe('TEST001')
    expect(request.visitorName).toBe('John Doe')
    expect(request.status).toBe('pending')
  })

  it('listPendingForUser returns requests routed to the user', async () => {
    const yugamTenant = await testDb
      .select()
      .from(tenants)
      .where(eq(tenants.slug, 'yugam'))
      .limit(1)

    const tenantId = yugamTenant[0]!.id

    const principalUser = await testDb
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, 'principal@yugam.test')))
      .limit(1)

    const principalId = principalUser[0]!.id

    // Create request routed directly to principal
    await createVisitRequest({
      tenantId,
      code: 'DIRECT001',
      visitorName: 'Direct Request',
      visitorPhone: '+919876543210',
      purpose: 'Parent meeting',
      routedUserId: principalId,
      routingType: 'user',
      routingSnapshot: { userIds: [principalId], capturedAt: new Date().toISOString() },
      source: 'public_form',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    })

    const results = await listPendingForUser({
      tenantId,
      userId: principalId,
      groupIds: [],
    })

    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.code === 'DIRECT001')).toBe(true)
  })

  it('listPendingForUser returns requests routed to a group the user is in', async () => {
    const yugamTenant = await testDb
      .select()
      .from(tenants)
      .where(eq(tenants.slug, 'yugam'))
      .limit(1)

    const tenantId = yugamTenant[0]!.id

    const principalUser = await testDb
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, 'principal@yugam.test')))
      .limit(1)

    const principalId = principalUser[0]!.id

    // Get principal's group IDs
    const userGroupsRecords = await testDb
      .select({ groupId: userGroups.groupId })
      .from(userGroups)
      .where(eq(userGroups.userId, principalId))

    const groupIds = userGroupsRecords.map((ug) => ug.groupId)

    // Create request routed to one of principal's groups
    const officeGroup = groupIds[0]
    if (officeGroup) {
      await createVisitRequest({
        tenantId,
        code: 'GROUP001',
        visitorName: 'Group Request',
        visitorPhone: '+919876543210',
        purpose: 'Office visit',
        routedGroupId: officeGroup,
        routingType: 'group',
        routingSnapshot: { userIds: [], capturedAt: new Date().toISOString() },
        source: 'public_form',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      })

      const results = await listPendingForUser({
        tenantId,
        userId: principalId,
        groupIds,
      })

      expect(results.some((r) => r.code === 'GROUP001')).toBe(true)
    }
  })

  it('listPendingForUser does NOT return requests from a different tenant', async () => {
    // Seed a second fake tenant
    const passwordHash = await hash('Pass@1234', 12)
    const [otherTenant] = await testDb
      .insert(tenants)
      .values({
        slug: 'other-school',
        name: 'Other School',
        config: {},
      })
      .returning()

    const otherTenantId = otherTenant!.id

    // Create a user in the other tenant
    const [otherUser] = await testDb
      .insert(users)
      .values({
        tenantId: otherTenantId,
        email: 'admin@other.test',
        name: 'Other Admin',
        passwordHash,
        role: 'admin',
        isActive: true,
      })
      .returning()

    // Create a request in the other tenant routed to this user
    await createVisitRequest({
      tenantId: otherTenantId,
      code: 'OTHER001',
      visitorName: 'Other Tenant Request',
      visitorPhone: '+919876543210',
      purpose: 'Other tenant business',
      routedUserId: otherUser!.id,
      routingType: 'user',
      routingSnapshot: { userIds: [otherUser!.id], capturedAt: new Date().toISOString() },
      source: 'public_form',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    })

    // Query as a user from Yugam tenant
    const yugamTenant = await testDb
      .select()
      .from(tenants)
      .where(eq(tenants.slug, 'yugam'))
      .limit(1)

    const yugamTenantId = yugamTenant[0]!.id

    const yugamUser = await testDb
      .select()
      .from(users)
      .where(and(eq(users.tenantId, yugamTenantId), eq(users.email, 'principal@yugam.test')))
      .limit(1)

    const results = await listPendingForUser({
      tenantId: yugamTenantId,
      userId: yugamUser[0]!.id,
      groupIds: [],
    })

    // Should NOT include the request from other tenant
    expect(results.some((r) => r.code === 'OTHER001')).toBe(false)
  })
})
