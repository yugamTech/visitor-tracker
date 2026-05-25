// postgres-js (used by the Drizzle db client) requires Node.js TCP sockets,
// which are unavailable in Edge runtime. Opt into Node.js runtime here.
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db/client'
import { tenants } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { env } from '@/lib/env'

const PUBLIC_ROUTES = ['/signin', '/api/health']

export async function middleware(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl

  // Extract subdomain
  let tenantSlug: string
  const parts = hostname.split('.')

  if (hostname === 'localhost' || hostname.startsWith('localhost:')) {
    tenantSlug = env.DEV_TENANT_SLUG
  } else {
    tenantSlug = parts[0] || ''
  }

  // Look up tenant
  const tenant = await db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1)

  if (tenant.length === 0) {
    return NextResponse.json(null, { status: 404 })
  }

  const tenantData = tenant[0]!

  // Forward tenant context to downstream RSC / route handlers via REQUEST headers.
  // Headers set on NextResponse only reach the browser; `headers()` in handlers
  // reads request headers, so we mutate those and pass them via the `request` option.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-tenant-id', String(tenantData.id))
  requestHeaders.set('x-tenant-slug', tenantData.slug)
  requestHeaders.set('x-tenant-name', tenantData.name)

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  // Check if public route
  const isPublic =
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith('/pre-register/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/pre-register') ||
    pathname.startsWith('/api/webhooks/')

  if (isPublic) {
    return response
  }

  // For protected routes, check session
  const session = await auth()

  if (!session) {
    return NextResponse.redirect(new URL('/signin', request.url))
  }

  // Defense-in-depth (ADR-0006): a session minted on one tenant's subdomain
  // must not be honored on another tenant's subdomain.
  if (session.user.tenantId !== tenantData.id) {
    return NextResponse.redirect(new URL('/signin', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
