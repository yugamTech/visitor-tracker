# ADR-0005: Error handling

**Status:** Accepted
**Date:** 2026-05-13

## Context

`throw` is a poor return type. It bypasses type checking, loses error shape across the network boundary (server action returns), and forces callers into defensive try/catch around everything. We need predictable, typed failure handling — especially for server actions, where the failure is part of the API contract the UI consumes.

## Decision

### Server actions return `Result<T, E>`

```ts
// src/lib/result.ts
export type Result<T, E> =
  | { ok: true; data: T }
  | { ok: false; error: E }

export const ok = <T>(data: T): Result<T, never> => ({ ok: true, data })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })
```

Every server action's return type is `Promise<Result<TData, AppError>>`. The action **never throws**. Inside the action, any `throw` from a query function is caught and converted.

### `AppError` is a discriminated union

```ts
// src/lib/errors.ts
export type AppError =
  | { kind: 'validation'; fieldErrors: Record<string, string[]>; formErrors: string[] }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden'; required?: string }
  | { kind: 'not_found'; entity: string }
  | { kind: 'conflict'; reason: 'duplicate_code' | 'already_decided' | 'pass_revoked' | 'pass_expired' | 'pass_exhausted' }
  | { kind: 'rate_limited'; retryAfterSec: number }
  | { kind: 'system'; code: string }   // generic catch-all; never expose details

export const AppError = {
  validation: (zodErr: import('zod').ZodError['flatten'] extends () => infer F ? F : never) =>
    ({ kind: 'validation', fieldErrors: zodErr.fieldErrors as any, formErrors: zodErr.formErrors as any } as const),
  unauthorized: () => ({ kind: 'unauthorized' } as const),
  forbidden: (required?: string) => ({ kind: 'forbidden', required } as const),
  notFound: (entity: string) => ({ kind: 'not_found', entity } as const),
  conflict: (reason: AppError extends { kind: 'conflict' } ? AppError['reason'] : never) =>
    ({ kind: 'conflict', reason } as const),
  system: (e: unknown) => {
    // log with full detail server-side
    console.error('[system_error]', e)
    return { kind: 'system', code: 'internal' } as const
  },
}
```

The `kind` discriminator means the UI can `switch (error.kind)` and get an exhaustive check from TypeScript.

### What may throw, and where it's caught

| Layer | Allowed to throw? | Caught by |
|---|---|---|
| Query functions | Yes — system errors (DB down, constraint violation) | Server action's outer try/catch |
| Server actions | **No** — must return `Result` | n/a |
| Route handlers | **No** — must return `NextResponse` with appropriate status | n/a |
| RSC pages | Yes for `notFound()` / `redirect()`; otherwise no | Next.js error boundaries |
| Library code (`lib/`) | Yes for genuinely exceptional paths | Caller decides |

### Mapping errors at the UI

```tsx
function toToast(err: AppError): string {
  switch (err.kind) {
    case 'validation': return 'Please check the form'  // field errors render inline
    case 'unauthorized': return 'Please sign in'
    case 'forbidden': return 'You do not have permission'
    case 'not_found': return `${err.entity} not found`
    case 'conflict':
      return {
        duplicate_code: 'That code already exists',
        already_decided: 'This request was already decided',
        pass_revoked: 'This pass has been revoked',
        pass_expired: 'This pass has expired',
        pass_exhausted: 'This pass has no remaining uses',
      }[err.reason]
    case 'rate_limited': return `Too many requests, try again in ${err.retryAfterSec}s`
    case 'system': return 'Something went wrong. Please try again'
  }
}
```

Note: validation errors are rendered **inline next to fields**, not as a toast. The toast is the fallback.

### What error messages we never expose to clients

- DB driver errors (full SQL, table names, constraint names)
- Stack traces
- Internal IDs that weren't already known to the caller
- Vendor SDK errors verbatim (MSG91, R2)

These are logged server-side at error level. The user-facing message is the `AppError` kind mapped through the table above.

### Route handlers

Route handlers don't return `Result` (they're HTTP). They map the same internal failures to status codes:

| AppError kind | HTTP status |
|---|---|
| validation | 400 |
| unauthorized | 401 |
| forbidden | 403 |
| not_found | 404 |
| conflict | 409 |
| rate_limited | 429 (with `Retry-After` header) |
| system | 500 |

The response body is `{ error: { kind, ...publicFields } }` — same shape, minus anything we don't expose.

### Logging

- Every `AppError.system(...)` call logs with `console.error('[system_error]', e)`. In production we'll pipe to a log aggregator (Cloudflare Logpush or Axiom — decide later). For Phase 0, console is fine.
- Authentication failures log at `warn` with the (email, ip) for rate-limit and lockout tracking.
- **Never log:** passwords, OTPs, SMS message bodies (templated), full visitor PII outside the audit log table.

## Consequences

**Good**

- UI can statically know all possible failure modes for any action
- No more "I forgot to check `if (error)`" — TypeScript forces the `ok` discriminant check
- Errors that should be silent (validation) are visibly different from errors that need a toast

**Bad**

- More boilerplate than just throwing. Mitigated by helper constructors on `AppError`.

## Anti-patterns to flag

- A server action with `throw` reaching the caller
- An action with return type `Promise<T>` (instead of `Promise<Result<T, AppError>>`)
- A UI component doing `try/catch` around a server action call
- A query function returning a `Result` (queries throw on system error; conversion happens in the action)
- Catching `Error` and re-throwing with a different message (lossy)
