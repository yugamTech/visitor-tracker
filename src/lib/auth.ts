import { compare } from 'bcryptjs'
import { db } from '@/db/client'
import { users, userGroups } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { headers } from 'next/headers'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const NextAuth = require('next-auth').default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Credentials = require('next-auth/providers/credentials').default

type CredentialsUser = {
  id: string
  email: string
  name: string
  tenantId: number
  tenantSlug: string
  tenantName: string
  role: 'guard' | 'admin' | 'super_admin'
  groupIds: number[]
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials: unknown): Promise<CredentialsUser | null> {
        const creds = credentials as Record<string, unknown>
        if (!creds?.email || !creds?.password) {
          return null
        }

        // Get tenant from request headers set by middleware
        const headersList = await headers()
        const tenantId = headersList.get('x-tenant-id')
        const tenantSlug = headersList.get('x-tenant-slug')
        const tenantName = headersList.get('x-tenant-name')

        if (!tenantId || !tenantSlug || !tenantName) {
          return null
        }

        const tenantIdNum = Number(tenantId)

        // Look up user by tenant and email
        const userRecord = await db
          .select()
          .from(users)
          .where(and(eq(users.tenantId, tenantIdNum), eq(users.email, creds.email as string)))
          .limit(1)

        if (userRecord.length === 0) {
          // Generic error message - don't reveal whether email exists
          return null
        }

        const user = userRecord[0]!

        // Check if user is active
        if (!user.isActive) {
          return null
        }

        // Verify password
        if (!user.passwordHash) {
          return null
        }

        const passwordMatch = await compare(creds.password as string, user.passwordHash)
        if (!passwordMatch) {
          return null
        }

        // Get user's group memberships
        const groupRecords = await db
          .select({ groupId: userGroups.groupId })
          .from(userGroups)
          .where(eq(userGroups.userId, user.id))

        return {
          id: String(user.id),
          email: user.email ?? '',
          name: user.name,
          role: user.role,
          tenantId: tenantIdNum,
          tenantSlug,
          tenantName,
          groupIds: groupRecords.map((g) => g.groupId),
        }
      },
    }),
    // TODO: Email magic-link provider (Resend or nodemailer)
    // To be implemented in Phase 1
  ],
  pages: {
    signIn: '/signin',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    jwt: async (params: { token: unknown; user?: unknown }) => {
      const { token, user } = params
      const typedToken = token as Record<string, unknown>
      if (user) {
        const typedUser = user as CredentialsUser
        return {
          ...typedToken,
          sub: typedUser.id,
          tenantId: typedUser.tenantId,
          tenantSlug: typedUser.tenantSlug,
          tenantName: typedUser.tenantName,
          email: typedUser.email,
          name: typedUser.name,
          role: typedUser.role,
          groupIds: typedUser.groupIds ?? [],
        }
      }
      return typedToken
    },
    session: async (params: { session: unknown; token: unknown }) => {
      const { session, token } = params
      const typedToken = token as {
        sub?: string
        email?: string
        name?: string
        tenantId?: number
        tenantSlug?: string
        tenantName?: string
        role?: 'guard' | 'admin' | 'super_admin'
        groupIds?: number[]
      }
      const typedSession = session as Record<string, unknown>
      const user = typedSession.user as Record<string, unknown>
      return {
        ...typedSession,
        user: {
          ...user,
          id: Number(typedToken.sub),
          tenantId: typedToken.tenantId ?? 0,
          tenantSlug: typedToken.tenantSlug ?? '',
          tenantName: typedToken.tenantName ?? '',
          email: typedToken.email ?? '',
          name: typedToken.name ?? '',
          role: typedToken.role ?? 'guard',
          groupIds: typedToken.groupIds ?? [],
        },
      }
    },
  },
})
