import { requireRole } from "@/lib/auth-helpers"

export default async function GuardPage() {
  const user = await requireRole("guard", "super_admin")

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-semibold">Gate</h1>
      <p className="text-muted-foreground">Phase 1 — coming soon</p>
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        <p>Signed in as <strong>{user.name}</strong></p>
        <p>Role: <strong>{user.role}</strong></p>
        <p>Tenant: <strong>{user.tenantName}</strong></p>
      </div>
    </div>
  )
}
