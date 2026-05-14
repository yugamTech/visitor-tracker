# ADR-0006: Multi-tenancy approach

**Status:** Accepted
**Date:** 2026-05-13

## Context

Long-term goal: sell this to other schools / institutes. Short-term reality: there's one customer (Yugam) and they're not even live. The temptation is to build a SaaS-grade multi-tenant platform from day one. That's how you end up with three months of "platform" and zero shipped features.

## Decision

**Tenant-ready, single-tenant.** The schema and code paths treat tenancy as a first-class concern, but we operationally support only one tenant for the foreseeable future.

### Schema

- A `tenants` table exists. It holds slug, name, and a JSONB `config` blob (branding, badge template ref, default visit types, feature flags).
- **Every business table has `tenant_id BIGINT NOT NULL REFERENCES tenants(id)`** plus an index on `tenant_id` (or a composite index that starts with it).
- The seed inserts a single tenant: `{ slug: 'yugam', name: 'Yugam International School' }`.

### Resolution

- Tenant is resolved from the **subdomain** in `src/middleware.ts`. `yugam.visitortrack.app` → `tenants.slug = 'yugam'`.
- For local development, set `DEV_TENANT_SLUG=yugam` and `localhost` resolves to that tenant.
- If the subdomain doesn't match a tenant, **404** — not a redirect to a marketing page. There's no marketing page in MVP.

### Enforcement

- **Application-layer (Phase 0–3):** Every query function takes `tenantId` explicitly and includes it in the `WHERE` clause. Reviewed in PR.
- **Postgres RLS (Phase 4):** When we onboard tenant #2, we add RLS policies as defence-in-depth. Until then, RLS is **off** to keep migrations simple.

### Config in the DB, not in code

Per-tenant variable behavior lives in `tenants.config` (JSONB) and related per-tenant tables (`admin_groups`, `visit_types`, `tenant_features`). It does **not** live in:

- Environment variables
- Hardcoded constants in `src/`
- A `config/yugam.ts` file

The typed shape is in `src/lib/schemas/tenant-config.ts`:

```ts
export const TenantConfigSchema = z.object({
  branding: z.object({
    primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i),
    logoUrl: z.string().url().optional(),
  }),
  badge: z.object({
    templateId: z.enum(['simple', 'with-photo']).default('with-photo'),
    showHostName: z.boolean().default(true),
  }),
  requestExpiryMinutes: z.number().int().min(5).max(240).default(30),
  smsNotifyAdminIds: z.array(z.number().int().positive()).default([]),
  retentionDays: z.number().int().min(30).max(3650).default(90),
})
export type TenantConfig = z.infer<typeof TenantConfigSchema>
```

When we add tenant #2, this is the surface we expose to per-tenant customization. Anything not in this schema is universal behavior.

### What is NOT tenant-scoped

- The `users` table is tenant-scoped (a user belongs to exactly one tenant in MVP). If we ever need cross-tenant admins (Anthropic-style internal staff), we add a separate table — we don't make `users` global and add a join.
- Auth.js session data carries `tenantId` and is tied to the subdomain. A session on `yugam.visitortrack.app` is invalid on `otherschool.visitortrack.app`.

### Subdomain & wildcard DNS

- DNS: `*.visitortrack.app` → Cloudflare Pages. Pages handles the wildcard.
- TLS: Cloudflare Universal SSL covers it.
- For Phase 0, we may not have the production domain yet. Local dev uses `localhost` + `DEV_TENANT_SLUG`. Preview deploys use the Cloudflare preview URL with a fallback that resolves to Yugam.

### When we go to tenant #2 (Phase 4 checklist)

1. Add Postgres RLS policies, one per business table: `USING (tenant_id = current_setting('app.tenant_id')::bigint)`.
2. Set `app.tenant_id` at the start of every DB session via Drizzle's `prepare`/`raw` — wire this through `src/db/client.ts` from the middleware-resolved tenant.
3. Audit all query functions for any missing `tenantId` filter (linter catches most via a custom rule — write the rule).
4. Add a tenant onboarding admin UI (super_admin role only).
5. Update the seed script to support multiple tenants.

We don't do any of this in Phase 0–3.

## Consequences

**Good**

- Migrations stay simple in Phase 0–3 (no RLS bookkeeping)
- The Phase 4 refactor is mechanical, not architectural — every table already has `tenant_id`
- The "config in DB" rule prevents the worst pattern: tenant-specific `if (tenantId === ...)` branches in code

**Bad**

- A single misplaced query without `tenantId` filter would leak data between tenants. Today, with one tenant, it's invisible — but the bug would ship to tenant #2. **Mitigation:** custom ESLint rule (Phase 1) that flags any Drizzle query missing a `tenantId` constraint. Backstop: code review.

**Why not schema-per-tenant or DB-per-tenant**

- Schema-per-tenant: complicates migrations (run on every schema), worse connection pooling, marginal isolation gain over RLS+row scoping.
- DB-per-tenant: max isolation, but multiplies operational cost and migration complexity. Justified only for enterprise customers with regulatory requirements we don't have.

For a school visitor management system, row-scoped with RLS is the correct choice.

## Anti-patterns to flag

- A migration that adds a table without `tenant_id`
- A query function whose signature doesn't take `tenantId`
- A hardcoded check `if (tenant.slug === 'yugam')` in business logic
- A new env var that is really per-tenant config in disguise (e.g. `YUGAM_SMS_TEMPLATE`)
- Code that reads `tenants.config` without going through `TenantConfigSchema.parse(...)`
