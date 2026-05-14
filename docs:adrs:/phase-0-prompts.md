# Phase 0 — Claude Code prompts

**How to use this file.**

Each prompt below is a complete instruction for Claude Code, run one at a time **from the repo root**. After each prompt:

1. Verify Claude Code's stated output is real (open the files, don't just trust the response).
2. Run the verification commands listed at the end of the prompt yourself.
3. **Commit before the next prompt.** Each prompt is a checkpoint. If Phase 0.5 goes sideways, you `git reset` to the previous commit, not to scratch.
4. If Claude Code asks a clarifying question, answer it inline rather than guessing. Saying "do your best" defeats the point.

Prerequisites:

- `pnpm` installed globally (`npm i -g pnpm`)
- Node 20+
- A Neon Postgres URL ready (free tier; create two databases: `visitortrack_dev` and `visitortrack_test`)
- `CLAUDE.md`, all six ADRs, and `db/schema.ts` already placed in the repo (you do this by hand before running prompt 0.1)

Layout in your repo before prompt 0.1:

```
<repo-root>/
  CLAUDE.md
  docs/adrs/
    0001-auth-strategy.md
    0002-data-access-pattern.md
    0003-server-actions-vs-route-handlers.md
    0004-validation-strategy.md
    0005-error-handling.md
    0006-multi-tenancy.md
  schema.ts                # will move to src/db/schema.ts in prompt 0.2
```

---

## Prompt 0.1 — Project scaffolding

```
You are bootstrapping a Next.js 14 App Router project at the repo root.

Read CLAUDE.md before doing anything. It is binding. ADRs in docs/adrs/ are also binding.

Tasks:

1. Run `pnpm create next-app@latest . --typescript --eslint --tailwind --app --src-dir --no-import-alias` (the alias is configured manually below).
2. In package.json, set "packageManager" to the current pnpm version. Set "engines.node" to ">=20".
3. Update tsconfig.json:
   - "strict": true
   - "noUncheckedIndexedAccess": true
   - "exactOptionalPropertyTypes": true
   - "paths": { "@/*": ["./src/*"] }
4. Install runtime deps: `drizzle-orm postgres @t3-oss/env-nextjs zod next-auth@beta @auth/drizzle-adapter bcryptjs @aws-sdk/client-s3 react-hook-form @hookform/resolvers date-fns`
5. Install dev deps: `drizzle-kit vitest @vitest/coverage-v8 @types/bcryptjs tsx husky lint-staged`
6. Add scripts to package.json:
   - "dev": "next dev"
   - "build": "next build"
   - "start": "next start"
   - "lint": "next lint"
   - "typecheck": "tsc --noEmit"
   - "test": "vitest run"
   - "test:watch": "vitest"
   - "db:generate": "drizzle-kit generate"
   - "db:migrate": "tsx src/db/migrate.ts"
   - "db:studio": "drizzle-kit studio"
   - "db:seed": "tsx src/db/seed.ts"
7. Set up Husky pre-commit running lint-staged. lint-staged config: typecheck + lint on staged TS/TSX files.
8. Create the empty folder structure exactly as in CLAUDE.md "Folder structure" section. Use a placeholder `.gitkeep` in folders that would otherwise be empty.
9. Create .env.example with these placeholder vars (do NOT create .env.local):
   DATABASE_URL=postgres://...
   TEST_DATABASE_URL=postgres://...
   AUTH_SECRET=replace-with-openssl-rand-base64-32
   AUTH_URL=http://localhost:3000
   DEV_TENANT_SLUG=yugam
   MSG91_AUTH_KEY=
   MSG91_TEMPLATE_VISITOR_ARRIVAL=
   MSG91_TEMPLATE_PASS_ISSUED=
   R2_ACCOUNT_ID=
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   R2_BUCKET=
   R2_PUBLIC_BASE_URL=
   NEXT_PUBLIC_APP_NAME=VisitorTrack

Do NOT in this prompt:
- Configure Drizzle (next prompt)
- Configure Auth.js (prompt 0.4)
- Install or initialize shadcn/ui (prompt 0.7)
- Write any business logic
- Move schema.ts (next prompt)

When done, output:
- The full list of files created/modified
- The result of `pnpm typecheck && pnpm lint`
- Any deviations from the instructions and why

Both commands must pass. If they don't, fix and report.
```

---

## Prompt 0.2 — Database layer (schema, client, migration)

```
Read CLAUDE.md and ADR-0002 (data access pattern) and ADR-0006 (multi-tenancy) before starting.

Tasks:

1. Move `schema.ts` from the repo root to `src/db/schema.ts`. Do not edit its contents.
2. Create `drizzle.config.ts` at the repo root:
   - schema: './src/db/schema.ts'
   - out: './src/db/migrations'
   - dialect: 'postgresql'
   - dbCredentials.url from process.env.DATABASE_URL (use require('dotenv').config({ path: '.env.local' }) at the top, install dotenv as devDep if needed — actually no, drizzle-kit reads .env automatically; just verify and use `import 'dotenv/config'` if not — pick whichever drizzle-kit current version expects)
   - verbose: true, strict: true
3. Create `src/db/client.ts`:
   - Imports `postgres` (the postgres-js driver) and `drizzle` from 'drizzle-orm/postgres-js'
   - Exports a singleton `db` using `env.DATABASE_URL`
   - Passes the schema as the second arg so `db.query.*` works
   - In dev, attaches the client to globalThis to survive HMR
4. Create `src/db/migrate.ts`:
   - A small standalone tsx script that runs `migrate(db, { migrationsFolder: './src/db/migrations' })` and exits
5. Generate the initial migration: `pnpm db:generate`. Inspect the generated SQL file under `src/db/migrations/`. Verify:
   - All 9 tables present (tenants, users, admin_groups, user_groups, visit_types, access_passes, visit_requests, visits, audit_log, notifications)
   - All foreign keys present
   - All enums created
   - All indexes from the schema present
6. DO NOT run the migration yet (env.ts and DATABASE_URL setup are in the next prompt).

Output:
- Files created/modified
- The generated migration SQL (paste it verbatim)
- Result of `pnpm typecheck && pnpm lint`

If the migration SQL is missing anything from the schema, stop and report — do not edit the schema to "fix" drizzle.
```

---

## Prompt 0.3 — Env validation

```
Read CLAUDE.md. Hard rule 7: env access only via src/lib/env.ts.

Tasks:

1. Create `src/lib/env.ts` using `@t3-oss/env-nextjs` with this exact schema (use Zod):

   Server:
   - DATABASE_URL: z.string().url()
   - TEST_DATABASE_URL: z.string().url().optional()
   - AUTH_SECRET: z.string().min(32)
   - AUTH_URL: z.string().url()
   - DEV_TENANT_SLUG: z.string().default('yugam')
   - MSG91_AUTH_KEY: z.string().min(1)
   - MSG91_TEMPLATE_VISITOR_ARRIVAL: z.string().min(1)
   - MSG91_TEMPLATE_PASS_ISSUED: z.string().min(1)
   - R2_ACCOUNT_ID: z.string().min(1)
   - R2_ACCESS_KEY_ID: z.string().min(1)
   - R2_SECRET_ACCESS_KEY: z.string().min(1)
   - R2_BUCKET: z.string().min(1)
   - R2_PUBLIC_BASE_URL: z.string().url()

   Client:
   - NEXT_PUBLIC_APP_NAME: z.string().default('VisitorTrack')

   In development/test, allow MSG91_* and R2_* to be empty strings (use .or(z.literal('')).default('') if needed) so local dev doesn't require real credentials. We'll guard runtime usage of these clients separately.

2. Update `src/db/client.ts` to import `env` from `@/lib/env` and use `env.DATABASE_URL` (replace any direct process.env reference).

3. Update `drizzle.config.ts` to also use env if possible (drizzle-kit runs outside Next runtime; if @t3-oss/env-nextjs is awkward there, it's fine to use process.env in drizzle.config.ts only, with a comment explaining why — that's the one allowed exception).

Output:
- Files created/modified
- Result of `pnpm typecheck && pnpm lint`

Do NOT in this prompt:
- Write the MSG91 client (later phase)
- Write the R2 client (later phase)
- Add any new env vars not listed
```

---

## Prompt 0.4 — Auth.js v5 with tenant resolution

```
Read CLAUDE.md and ADR-0001 (auth strategy) THOROUGHLY before starting. This is the most important prompt in Phase 0 — get it right.

Tasks:

1. Create `src/middleware.ts`:
   - For every request, extract the first hostname label (the subdomain). 
   - On localhost (no subdomain), use env.DEV_TENANT_SLUG.
   - Look up tenants.slug — if missing, return new NextResponse(null, { status: 404 }).
   - Set request header 'x-tenant-id' (and 'x-tenant-slug', 'x-tenant-name') for downstream.
   - **Strip any inbound 'x-tenant-id' / 'x-tenant-slug' / 'x-tenant-name' headers from the original request before setting your own** — never trust the client.
   - Public routes (no auth required, but tenant still resolved): /signin, /pre-register/* , /api/pre-register, /api/webhooks/* , /api/health
   - All other routes: if no session, redirect to /signin.
   - Use the matcher to skip _next/static, _next/image, favicon.

2. Create `src/lib/auth.ts`:
   - Auth.js v5 NextAuth config
   - Providers: Credentials (email + password) and an email magic-link provider (use Resend; if Resend isn't set up, leave the provider config commented with a TODO — we'll wire it later)
   - Session strategy: 'jwt'
   - JWT callback: on initial sign-in, look up user by (tenantId from request context, email), verify bcrypt password, attach tenantId/tenantSlug/tenantName/role/groupIds to the token
   - Session callback: copy claims onto session.user
   - Authorize callback for credentials: read tenantSlug from req headers or from the credentials payload (you'll need to figure out the cleanest path — Auth.js v5 has request access in the authorize callback); resolve tenant; look up user; verify password
   - Export `auth`, `handlers`, `signIn`, `signOut`

3. Create `src/lib/auth-helpers.ts`:
   - `getCurrentUser(): Promise<SessionUser | null>` — calls `auth()`, returns null if no session, otherwise returns typed SessionUser
   - SessionUser shape: { id: number, tenantId: number, tenantSlug: string, tenantName: string, email: string, name: string, role: 'guard' | 'admin' | 'super_admin', groupIds: number[] }
   - `requireUser()` — throws redirect() to /signin if null
   - `requireRole(...roles)` — calls requireUser, throws notFound() if role mismatch (404 not 403, to avoid leaking that the route exists)
   - **Additionally:** check `users.is_active` on every requireUser call by re-fetching from DB. Cache via React's cache() so it only happens once per RSC render. This is the JWT-revocation backstop.

4. Create `src/app/api/auth/[...nextauth]/route.ts`:
   - Export GET and POST from handlers in lib/auth

5. Create `src/types/next-auth.d.ts` augmenting Auth.js types so session.user has the SessionUser shape.

Constraints:
- **Never log passwords or full tokens.**
- The credentials authorize callback must NOT return a User object for a deactivated account.
- All error messages on signin are generic ("Invalid email or password") — never reveal whether the email exists.
- No rate limiting yet — that's Phase 1.

Output:
- Files created/modified
- Result of `pnpm typecheck && pnpm lint`
- A short explanation of how you accessed the request inside the credentials authorize callback (this is an Auth.js v5 specific detail; show your work)

Do NOT in this prompt:
- Build the signin UI (Prompt 0.7)
- Add password reset
- Add rate limiting / lockout
```

---

## Prompt 0.5 — Seed script

```
Read CLAUDE.md.

Create `src/db/seed.ts` that idempotently seeds the Yugam tenant. It should be safe to run multiple times.

Tasks:

1. Upsert tenant: { slug: 'yugam', name: 'Yugam International School', config: a TenantConfig with primaryColor '#0F2A47' (navy), badge.templateId 'with-photo', requestExpiryMinutes 30, retentionDays 90 }
2. Upsert admin groups (by tenantId + slug): 
   - { name: 'Office',     slug: 'office' }
   - { name: 'Teachers',   slug: 'teachers' }
   - { name: 'Management', slug: 'management' }
   - { name: 'Operations', slug: 'operations' }
3. Upsert users (by tenantId + email). Password for all: 'Pass@1234' bcrypt-hashed with cost 12.
   - super_admin: { name: 'Super Admin',  email: 'super@yugam.test',   role: 'super_admin', groups: [] }
   - admin:       { name: 'Principal',     email: 'principal@yugam.test', role: 'admin',  groups: ['office', 'management'] }
   - admin:       { name: 'Class Teacher', email: 'teacher1@yugam.test',  role: 'admin',  groups: ['teachers'] }
   - admin:       { name: 'Ops Manager',   email: 'ops@yugam.test',       role: 'admin',  groups: ['operations'] }
   - guard:       { name: 'Main Gate',     email: 'guard@yugam.test',     role: 'guard',  groups: [] }
4. Upsert visit_types (by tenantId + slug):
   - { name: 'Parent — General', slug: 'parent-general', defaultRoutingType: 'group', defaultGroupSlug: 'teachers' }
   - { name: 'Vendor',           slug: 'vendor',         defaultRoutingType: 'group', defaultGroupSlug: 'operations' }
   - { name: 'Contractor',       slug: 'contractor',     defaultRoutingType: 'group', defaultGroupSlug: 'operations' }
   - { name: 'Guest of Staff',   slug: 'guest-of-staff', defaultRoutingType: 'group', defaultGroupSlug: 'management' }

Implementation notes:
- Use Drizzle's onConflictDoUpdate where appropriate (or check-then-insert with the unique index as the conflict target).
- Log a one-line summary at the end: "Seed complete: 1 tenant, 4 groups, 5 users, 4 visit types."
- Exit with code 0 on success, 1 on any error.

After completion, run locally:
- `pnpm db:migrate`
- `pnpm db:seed`
- Open `pnpm db:studio` and verify the rows visually.

Output:
- Files created/modified
- Result of `pnpm typecheck && pnpm lint && pnpm db:seed` (paste the seed log)

Do NOT in this prompt:
- Create sample visit_requests, visits, or access_passes (we'll do that in Phase 1 tests)
- Use any password other than 'Pass@1234' (this is dev seed data only; production passwords are set by users)
```

---

## Prompt 0.6 — Testing harness

```
Read CLAUDE.md.

Set up Vitest with a real Postgres test database (no in-memory mocks for DB tests — we want to catch real SQL/constraint issues).

Tasks:

1. Create `vitest.config.ts`:
   - environment: 'node'
   - globals: false
   - setupFiles: ['./tests/setup.ts']
   - poolOptions.threads.singleThread: true (avoids parallel DB writes stepping on each other in MVP)
   - testTimeout: 10000
2. Create `tests/setup.ts`:
   - Imports from env.ts; if TEST_DATABASE_URL is unset, throw a clear error telling the dev to set it
   - Before each test: truncate all business tables in dependency order, then re-seed (call the seed module programmatically — refactor seed.ts to export a `seed(db)` function that the CLI entry wraps)
3. Create `tests/helpers/db.ts`:
   - Exports a `testDb` (drizzle instance pointing at TEST_DATABASE_URL)
   - Exports `resetDb()` that truncates all tables
   - Exports `seedTestData()` that calls into seed module
4. Create `src/db/queries/visit-requests.ts` with two minimal exported functions (stubs that compile and pass — full implementation is Phase 1):
   - `createVisitRequest(input)`: actually inserts and returns the row
   - `listPendingForUser(args)`: returns pending requests routed to user or any of their groups
5. Create `tests/queries/visit-requests.test.ts`:
   - Test 1: createVisitRequest inserts with the right tenantId
   - Test 2: listPendingForUser returns requests routed to the user
   - Test 3: listPendingForUser returns requests routed to a group the user is in
   - Test 4: listPendingForUser does NOT return requests from a different tenant (seed a second fake tenant inline in this test to verify isolation)
6. Add a GitHub Actions workflow at `.github/workflows/ci.yml`:
   - Trigger: push, pull_request to main
   - Postgres 16 service container (env: POSTGRES_PASSWORD)
   - Steps: checkout, setup pnpm, setup node 20, pnpm install --frozen-lockfile, pnpm typecheck, pnpm lint, pnpm db:migrate, pnpm db:seed, pnpm test
   - Use TEST_DATABASE_URL pointing at the service container

Output:
- Files created/modified
- Result of `pnpm typecheck && pnpm lint && pnpm test`

Do NOT in this prompt:
- Write UI tests
- Mock the database
- Build other query functions (Phase 1)
```

---

## Prompt 0.7 — UI scaffolding (shadcn + layouts + signin)

```
Read CLAUDE.md and ADR-0001 before starting.

Tasks:

1. Initialize shadcn/ui:
   - Run `pnpm dlx shadcn@latest init` with these answers: style 'default', base color 'slate', CSS variables yes.
   - Update `tailwind.config.ts` and `src/app/globals.css` with the Yugam palette (the same one used in yugam-studio):
     - --color-primary: 218 64% 17% (navy #0F2A47)
     - --color-accent:  43 65% 49% (gold)
     - Body font: 'DM Sans' (load via next/font from Google Fonts)
     - Heading font: 'Cormorant Garamond' (load via next/font)
2. Install only these shadcn components: button input label form textarea select dropdown-menu dialog sheet badge card table sonner skeleton avatar
3. Create the authenticated app shell at `src/app/(app)/layout.tsx`:
   - RSC; calls requireUser()
   - Renders a topbar: tenant name | user name + role | a logout button (form action to /api/auth/signout)
   - Renders a sidebar appropriate to role:
     - guard: just "Gate" (single page for now)
     - admin: "Inbox", "Passes", "Visitors" (Passes and Visitors are placeholder routes that 404 in MVP — that's fine, just sidebar links)
     - super_admin: same as admin + "Settings"
4. Create `src/app/(app)/guard/page.tsx` and `src/app/(app)/admin/page.tsx` as placeholder RSC pages that say "Phase 1 — coming soon" and show the current user info from requireUser().
5. Create `src/app/(app)/page.tsx`:
   - RSC that calls requireUser() and redirects to /guard or /admin based on role (super_admin → /admin)
6. Create `src/app/signin/page.tsx`:
   - Client component (signin form needs state)
   - Uses react-hook-form + zodResolver against `SignInSchema` (z.object({ email: z.string().email(), password: z.string().min(1) })) — schema goes in src/lib/schemas/auth.ts
   - On submit: calls `signIn('credentials', { ..., redirect: false })`. Shows generic "Invalid email or password" on failure. On success, router.push('/')
   - Layout: centered card, tenant name fetched from x-tenant-name header (read in a thin RSC parent that wraps this client component)
7. Create `src/app/pre-register/[code]/page.tsx`:
   - RSC placeholder: "Pre-registration page — coming Phase 1"

Constraints:
- "use client" only in: signin form, sidebar interactive bits (if any), the logout button if you need it (preferably a form action and stays RSC)
- No business logic; the signin form is the only thing that calls a real action
- Don't add any other routes

After completion, manually test:
- Visit http://localhost:3000 → should redirect to /signin
- Sign in as guard@yugam.test / Pass@1234 → should land on /guard
- Sign in as principal@yugam.test / Pass@1234 → should land on /admin
- Logout → back to /signin

Output:
- Files created/modified
- Result of `pnpm typecheck && pnpm lint && pnpm test`
- A 2-3 line summary of any UI decision you made that wasn't in the prompt

Do NOT in this prompt:
- Build the visit request inbox UI
- Build the guard check-in flow
- Add any forms beyond signin
```

---

## Phase 0 done — checkpoint

After all 7 prompts:

1. Tag the commit: `git tag v0.0.1-scaffold && git push --tags`
2. Deploy to Cloudflare Pages preview to verify the build pipeline works.
3. Manually verify the signin flow against the seeded Yugam tenant in a deployed environment.
4. **Review every file Claude Code touched.** Don't just trust green checks — read the code. Phase 0 sets every pattern; if a query function doesn't have `tenantId` in its WHERE clause now, the same mistake will be copy-pasted 50 times in Phase 1.

When you're happy with Phase 0, we move to Phase 1 prompts:

- 1.1 — Pre-registration page (public) + code generation + visit request creation from public form
- 1.2 — Guard inbox: list pending arrivals, claim by code, take photo, capture full details
- 1.3 — Admin inbox: pending queue with group filter, approve / reject / ask-to-wait actions, "resolved by X" feed
- 1.4 — Access pass issue + revoke flow
- 1.5 — Check-in / check-out + badge PDF generation
- 1.6 — Audit log view
- 1.7 — Daily log + CSV export
