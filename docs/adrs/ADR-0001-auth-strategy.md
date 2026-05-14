# ADR-0001: Auth strategy

**Status:** Accepted
**Date:** 2026-05-13

## Context

The app has three audiences with different access patterns:

1. **Guards** — log in once on a shared device at the gate, stay logged in for a shift. Need fast credentials login.
2. **Admins** (office, teachers, management, operations) — log in from their own phones / laptops. Need credentials, and a recovery path that doesn't require IT to reset passwords.
3. **Public visitors** — use the pre-registration form. **No login at all.** They get a short code via SMS.

Tenancy is resolved from the subdomain (`yugam.<domain>`). The session must carry the tenant so every downstream check can enforce it.

## Decision

Use **Auth.js v5** (`next-auth@beta`) with two providers:

- **Credentials** — email + password, password verified with `bcryptjs` against `users.password_hash`. Used by guards and admins.
- **Email magic link** — for password recovery and first-time setup. Uses Resend or nodemailer (decided in env step; default to Resend for simplicity).

### Session

JWT strategy (no DB session store). The JWT claims include:

```ts
{
  sub: string              // user id (string form per JWT convention)
  tenantId: number
  tenantSlug: string
  tenantName: string
  role: 'guard' | 'admin' | 'super_admin'
  groupIds: number[]       // admin group memberships at sign-in time
  iat, exp
}
```

The `groupIds` are snapshotted at sign-in. If an admin's group membership changes, they must sign out and back in to see the change. This is fine for MVP — it's predictable and avoids per-request group lookups.

### Tenant resolution

Done in `src/middleware.ts` before Auth.js runs:

1. Read the first hostname label (e.g. `yugam` from `yugam.visitortrack.app`).
2. Look up `tenants.slug = <label>`. If not found → return 404.
3. Set an internal request header `x-tenant-id` for downstream RSC/server actions.
4. Localhost / preview deploys resolve to a `DEV_TENANT_SLUG` env var.

The `x-tenant-id` header is set **inside middleware only**. Inbound requests with this header from outside are ignored (Next.js middleware can strip or overwrite headers — we overwrite).

### Authorization helpers

In `src/lib/auth-helpers.ts`:

- `getCurrentUser(): Promise<SessionUser | null>` — never throws
- `requireUser(): Promise<SessionUser>` — redirects to `/signin` if no session
- `requireRole(...roles: Role[]): Promise<SessionUser>` — 403 if role mismatch
- `requireGroup(groupSlug: string): Promise<SessionUser>` — 403 if not in group

`SessionUser` is the typed shape of the JWT claims plus `id: number` (parsed from `sub`).

### Public routes

The following do not require a session, but **do** require tenant resolution:

- `GET /signin`
- `GET /pre-register/[code]`
- `POST /api/pre-register` — rate-limited (10/min per IP)
- `POST /api/webhooks/msg91` — verified via signature header

Middleware exempts these from the auth redirect but still resolves the tenant.

## Consequences

**Good**

- No external auth vendor cost
- Stateless JWT scales freely
- Tenant resolution is one place; downstream code can't accidentally cross tenants because every query takes `tenantId` explicitly anyway
- Magic link gives a clean recovery story for non-technical admins

**Bad**

- Group changes require sign-out / sign-in. Acceptable for MVP. If we later add live group changes, switch to session refresh on a soft TTL.
- JWTs can't be revoked instantly. Mitigated by short expiry (1 day for admins, 12h for guards) and a `users.is_active` flag checked in `requireUser` against the DB on every request (small cost; cache later if needed).

**Why not Clerk / Supabase Auth / WorkOS**

- Vendor lock-in and recurring cost for a feature we can ship correctly in a day
- Auth.js v5 + Drizzle adapter is the boring, well-trodden path for Next.js 14

## Implementation notes

- Password complexity: min 10 chars, must contain at least 3 of [lower, upper, digit, symbol]. Enforced via Zod schema in `src/lib/schemas/auth.ts`.
- Lockout: after 5 failed attempts in 15 minutes for a given (tenantId, email), lock for 30 minutes. Store attempts in a simple table or Redis later. **Defer to Phase 1.**
- The middleware **never** logs the full path with query string at info level — tenant codes appear in URLs.
