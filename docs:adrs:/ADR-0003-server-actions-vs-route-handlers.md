# ADR-0003: Server actions vs route handlers

**Status:** Accepted
**Date:** 2026-05-13

## Context

Next.js App Router gives us two ways to run server code: **server actions** (`'use server'`) and **route handlers** (`app/api/.../route.ts`). They look similar; they're not.

## Decision

### Server actions — for all internal mutations

Use server actions for any mutation triggered from our own UI:

- Guard creating a walk-in visit request
- Admin approving / rejecting / asking-to-wait
- Admin issuing an access pass
- Admin revoking a pass
- User updating their profile
- Anything where the caller is the React tree

Why:

- Type-safe input/output without an API client
- Native form action integration (`<form action={...}>`)
- Eliminates a whole class of "I forgot to validate" bugs because validation is right there at the entry point
- No URL surface area, no CSRF token plumbing (Next.js handles it)

Pattern: see ADR-0002 example. Every action:

1. Validates input with Zod (returns `Result` on failure, does not throw)
2. Calls `requireUser()` / `requireRole(...)` for authz
3. Calls one or more query functions
4. Returns `Result<T, E>`

### Route handlers — only for external callers

Use route handlers exclusively for:

| Endpoint | Why |
|---|---|
| `POST /api/pre-register` | Called from the public pre-registration page (no session, anonymous visitor) |
| `POST /api/webhooks/msg91` | MSG91 calls us back with delivery status |
| `POST /api/cron/*` | Cloudflare Cron Triggers / external scheduler |
| `GET /api/health` | Uptime checks |

These are the **only** allowed route handlers. Everything else is a server action.

Each route handler:

- Verifies the caller is allowed (signature, rate limit, or both)
- Validates body with Zod
- Calls query functions (same as actions)
- Returns `NextResponse.json({...}, { status })` — uses real HTTP semantics

### Why not just use route handlers everywhere

- You'd build an API client. You don't need one.
- You'd hand-write types twice (request body / response body) or generate them. You don't need to.
- You'd handle CSRF manually. You don't need to.
- The "external API" framing leaks into your internal code and you end up calling `fetch('/api/...')` from a server component, which is just slow nonsense.

### Why not just use server actions everywhere

- MSG91 can't call a server action — it doesn't know what one is. Webhooks are HTTP.
- The public pre-registration page submits anonymously. A server action there would still work, but if we ever want to allow the form to be POSTed from outside the React app (e.g. a school's own portal embeds it), an HTTP endpoint is the answer. So we use a route handler from the start.

### Naming

- Action files: `src/actions/<entity>/<verb>.ts`. One verb per file. Default export is the action.
- Route handlers: `src/app/api/<segment>/route.ts`. Standard Next.js convention.

### Calling server actions from client components

```tsx
'use client'
import { approveVisitRequest } from '@/actions/visit-requests/approve'

export function ApproveButton({ requestId }: { requestId: number }) {
  return (
    <form
      action={async () => {
        const res = await approveVisitRequest({ requestId })
        if (!res.ok) toast.error(res.error.message)
        else toast.success('Approved')
      }}
    >
      <button type="submit">Approve</button>
    </form>
  )
}
```

Note: `<form action={...}>` is the preferred entry, not `onClick`. It gives us progressive enhancement for free.

## Consequences

**Good**

- Clear, mechanical rule: "is the caller in our React tree? → action. Otherwise → route handler."
- Smaller API surface to secure
- No accidental public exposure of internal logic

**Bad**

- One mental model to learn (server actions are still relatively new). Mitigated by sticking to the pattern in ADR-0002.

## Anti-patterns to flag

- A route handler that's only called by our own client components
- A `fetch('/api/...')` call from anywhere inside `src/`
- A server action exported from a route handler file
- Business logic inline in a route handler that should be in a query function
