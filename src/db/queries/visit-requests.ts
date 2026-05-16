import { and, eq, or, inArray, desc } from 'drizzle-orm'
import { db } from '@/db/client'
import { visitRequests } from '@/db/schema'

export type CreateVisitRequestInput = {
  tenantId: number
  code: string
  visitorName: string
  visitorPhone: string
  visitorEmail?: string
  purpose: string
  visitTypeId?: number | null
  hostName?: string
  hostUserId?: number | null
  routingType: 'group' | 'user' | 'auto_pass'
  routedGroupId?: number | null
  routedUserId?: number | null
  routingSnapshot: { userIds: number[]; capturedAt: string }
  source: 'public_form' | 'guard' | 'pass'
  createdByUserId?: number | null
  accessPassId?: number | null
  hasParcel?: boolean
  parcelNote?: string
  expiresAt: Date
}

export async function createVisitRequest(input: CreateVisitRequestInput) {
  const [row] = await db
    .insert(visitRequests)
    .values({
      tenantId: input.tenantId,
      code: input.code,
      visitorName: input.visitorName,
      visitorPhone: input.visitorPhone,
      visitorEmail: input.visitorEmail,
      purpose: input.purpose,
      visitTypeId: input.visitTypeId,
      hostName: input.hostName,
      hostUserId: input.hostUserId,
      routingType: input.routingType,
      routedGroupId: input.routedGroupId,
      routedUserId: input.routedUserId,
      routingSnapshot: input.routingSnapshot as never,
      source: input.source,
      createdByUserId: input.createdByUserId,
      accessPassId: input.accessPassId,
      hasParcel: input.hasParcel,
      parcelNote: input.parcelNote,
      expiresAt: input.expiresAt,
    })
    .returning()
  return row!
}

export async function listPendingForUser(args: {
  tenantId: number
  userId: number
  groupIds: number[]
}) {
  return db
    .select()
    .from(visitRequests)
    .where(
      and(
        eq(visitRequests.tenantId, args.tenantId),
        eq(visitRequests.status, 'pending'),
        or(
          eq(visitRequests.routedUserId, args.userId),
          args.groupIds.length > 0
            ? inArray(visitRequests.routedGroupId, args.groupIds)
            : undefined,
        ),
      ),
    )
    .orderBy(desc(visitRequests.createdAt))
}
