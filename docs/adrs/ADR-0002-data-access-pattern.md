# ADR-0002: Data access pattern

**Status:** Accepted
**Date:** 2026-05-13

## Context

The single biggest source of "fresher-quality" code in past projects: business logic mixed with DB calls mixed with HTTP handling mixed with UI. We're going to keep them physically separate.

## Decision

### Layers

```
UI (RSC / Client components)
   ↓ (server actions or RSC fetch)
Server actions (src/actions/)
   ↓ (call)
Query functions (src/db/queries/)
   ↓ (Drizzle)
DB
```

**One direction only.** A query function never imports from `src/actions/` or `src/components/`.

### Query functions

Live in `src/db/queries/<entity>.ts`. One file per top-level entity:

- `visit-requests.ts`
- `visits.ts`
- `access-passes.ts`
- `users.ts`
- `tenants.ts`
- `audit.ts`
- `notifications.ts`

Each function:

- Takes a typed input object (not positional args). One arg is always `{ tenantId: number, ... }` or includes `tenantId` at the top level.
- Returns Drizzle-inferred types (`InferSelectModel<typeof X>`), or a domain-shaped DTO if the query joins/transforms.
- **Filters by `tenantId` in the `WHERE` clause of every read and write.** No exceptions. The query function is the boundary that enforces tenant isolation today; RLS will be defence-in-depth in Phase 4.
- Does not handle auth. Auth is the server action's job.
- Does not validate input shape. Validation is the server action's job (via Zod).
- Never reads `request`, `cookies()`, or any Next.js runtime context. Pure function of its inputs.

### Example

```ts
// src/db/queries/visit-requests.ts
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
  visitTypeId: number | null
  hostName?: string
  hostUserId?: number
  routingType: 'group' | 'user' | 'auto_pass'
  routedGroupId?: number
  routedUserId?: number
  routingSnapshot: { userIds: number[]; capturedAt: string }
  createdBy: 'public_form' | 'guard' | 'pass'
  createdByUserId?: number
  accessPassId?: number
  hasParcel?: boolean
  parcelNote?: string
  expiresAt: Date
}

export async function createVisitRequest(input: CreateVisitRequestInput) {
  const [row] = await db.insert(visitRequests).values({
    tenantId: input.tenantId,
    code: input.code,
    visitorName: input.visitorName,
    // ... etc
  }).returning()
  return row
}

export async function listPendingForUser(args: {
  tenantId: number
  userId: number
  groupIds: number[]
}) {
  return db.select().from(visitRequests).where(
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
  ).orderBy(desc(visitRequests.createdAt))
}
```

### Transactions

When an action needs more than one write, wrap in a transaction at the **query layer** and accept the transaction as an optional argument so callers can compose:

```ts
export async function approveRequest(
  input: { requestId: number; note?: string },
  ctx: { tenantId: number; actorUserId: number },
  tx?: typeof db,
) {
  const exec = tx ?? db
  return exec.transaction(async (trx) => {
    // 1. update visit_requests row (status, decidedBy, decidedAt)
    // 2. insert audit_log row
    // 3. insert notifications for other routed admins (auto-dismiss after 24h)
  })
}
```

If `tx` is passed in, use it directly; if not, open a new transaction. This lets a higher-level action sequence multiple query calls atomically.

### Reads from RSC vs actions

- **RSC** calls query functions directly (read-only).
- **Server actions** call query functions for both reads and writes, after auth and validation.
- A page that does both reading and triggering an action calls both — the page itself doesn't have a layer.

### What does NOT go in a query function

- Code generation (use `src/lib/code.ts`)
- SMS sending (use `src/lib/sms/`)
- Photo upload (use `src/lib/storage/`)
- Routing logic — deciding *who* to route a request to (use `src/lib/routing.ts`)
- Date math beyond trivial timestamp comparison (use `date-fns`)

## Consequences

**Good**

- Every query is testable in isolation
- Tenant isolation is enforced at exactly one layer, visibly
- No "where did this DB call come from" moments
- Easy to swap Drizzle for something else later (unlikely, but the boundary is clean)

**Bad**

- More files than a "just throw it in the action" approach
- Slight ceremony for tiny CRUDs — accepted, it pays off after the third query

## Anti-patterns to flag in review

- A `.tsx` file importing from `drizzle-orm`
- A query function with no `tenantId` in its `WHERE` clause
- A server action with raw Drizzle calls
- A "utility" file that calls query functions and is also imported by query functions (circular)
