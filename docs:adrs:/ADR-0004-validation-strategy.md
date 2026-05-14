# ADR-0004: Validation strategy

**Status:** Accepted
**Date:** 2026-05-13

## Context

Most "fresher" Next.js code I've seen duplicates types: a TypeScript interface for the form, a separate one for the API, a third for the DB row. They drift. Validation runs once, somewhere, sometimes.

## Decision

### Zod is the single source of truth

For every entity that crosses a boundary (form ↔ action ↔ DB), define a Zod schema in `src/lib/schemas/<entity>.ts`. Types are **inferred**, never declared in parallel.

```ts
// src/lib/schemas/visit-request.ts
import { z } from 'zod'

export const VisitRequestCreateSchema = z.object({
  visitorName: z.string().trim().min(2).max(120),
  visitorPhone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone'),
  visitorEmail: z.string().email().optional(),
  purpose: z.string().trim().min(3).max(500),
  visitTypeId: z.number().int().positive(),
  hostName: z.string().trim().max(120).optional(),
  hostUserId: z.number().int().positive().optional(),
  hasParcel: z.boolean().default(false),
  parcelNote: z.string().max(500).optional(),
  // routing chosen by the guard
  routing: z.discriminatedUnion('type', [
    z.object({ type: z.literal('group'), groupId: z.number().int().positive() }),
    z.object({ type: z.literal('user'), userId: z.number().int().positive() }),
  ]),
})

export type VisitRequestCreate = z.infer<typeof VisitRequestCreateSchema>
```

### Where the schema is used

The same exported schema is the validator at every layer:

1. **Form** — passed to React Hook Form's `zodResolver`. Inline field errors, no extra plumbing.
2. **Server action** — `Schema.safeParse(raw)` at the top. If `!success`, return `err(AppError.validation(...))`.
3. **Route handler** — same `safeParse` against the request body.
4. **Query function** — does **not** validate (per ADR-0002). It assumes its caller validated.

### Why not class-validator / yup / valibot / joi

- Zod has the best TypeScript inference. That's the whole point.
- Valibot is faster but the ecosystem (RHF resolver, tRPC, etc.) is less mature. Not worth the swap for this app.
- We're not using any of the others. Don't introduce them.

### Discriminated unions for variants

When a field has variant shapes (e.g. routing is *either* group *or* user, never both), **use a discriminated union**. Do not use `z.object({ groupId?, userId? })` with a runtime check — that loses type narrowing and lets invalid combinations through.

### Coercion

For form data from `<form action>`, Next.js gives us `FormData`. Coerce explicitly:

```ts
const raw = {
  visitorName: formData.get('visitorName'),
  visitTypeId: Number(formData.get('visitTypeId')),
  // ...
}
```

Don't reach for `zod-form-data`; the small amount of manual `Number()` / `formData.get()` is clearer than another dep.

### Output schemas

For server actions returning `Result<T, E>`, the `T` is a domain shape. Define it alongside the input schema if it's non-trivial:

```ts
export const VisitRequestSummarySchema = z.object({
  id: z.number(),
  code: z.string(),
  status: z.enum(['pending', 'approved', /* ... */]),
})
export type VisitRequestSummary = z.infer<typeof VisitRequestSummarySchema>
```

We don't *validate* outputs at runtime — we trust our own code. But having a schema makes the contract explicit and the inferred type stable.

### Database-level constraints

Zod is the application-layer truth. The DB also has its constraints (NOT NULL, length, foreign keys, CHECK on enums). They should be consistent, but the DB is the last line of defence, not the first. If they diverge, the schema in code should be **at least as strict** as the DB.

## Consequences

**Good**

- One schema per shape; types come for free
- Form errors and server errors share a vocabulary
- Refactors are safe — change the schema, TypeScript shows every caller

**Bad**

- Zod has runtime cost. Negligible for our request volumes; revisit if a hot path ever shows up in profiling.

## Anti-patterns to flag

- A TypeScript `interface` for an entity that also has a Zod schema
- A server action that does ad-hoc `if (!input.x) throw` checks instead of using a schema
- A form with manual `errors` state instead of `zodResolver`
- A `z.any()` or `z.unknown()` anywhere that isn't *truly* opaque (e.g. third-party webhook payloads we don't model)
