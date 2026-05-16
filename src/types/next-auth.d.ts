declare module 'next-auth' {
  interface Session {
    user: {
      id: number
      email: string
      name: string
      tenantId: number
      tenantSlug: string
      tenantName: string
      role: 'guard' | 'admin' | 'super_admin'
      groupIds: number[]
    }
  }

  interface User {
    id: string
    email: string
    name: string
    tenantId: number
    tenantSlug: string
    tenantName: string
    role: 'guard' | 'admin' | 'super_admin'
    groupIds: number[]
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    tenantId: number
    tenantSlug: string
    tenantName: string
    email: string
    name: string
    role: 'guard' | 'admin' | 'super_admin'
    groupIds: number[]
  }
}
