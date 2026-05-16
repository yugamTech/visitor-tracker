import { cache } from 'react'
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export type SessionUser = {
  id: number
  tenantId: number
  tenantSlug: string
  tenantName: string
  email: string
  name: string
  role: 'guard' | 'admin' | 'super_admin'
  groupIds: number[]
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth()

  if (!session?.user) {
    return null
  }

  return {
    id: session.user.id,
    tenantId: session.user.tenantId,
    tenantSlug: session.user.tenantSlug,
    tenantName: session.user.tenantName,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    groupIds: session.user.groupIds,
  }
})

export const requireUser = cache(async (): Promise<SessionUser> => {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/signin')
  }

  // Check if user is still active in DB (JWT revocation backstop)
  const dbUser = await db
    .select({ isActive: users.isActive })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  if (dbUser.length === 0 || !dbUser[0]?.isActive) {
    redirect('/signin')
  }

  return user
})

export const requireRole = cache(
  async (...roles: Array<'guard' | 'admin' | 'super_admin'>): Promise<SessionUser> => {
    const user = await requireUser()

    if (!roles.includes(user.role)) {
      notFound()
    }

    return user
  },
)
