import { requireRole } from "@/lib/auth-helpers"

export default async function AdminPage() {
  const user = await requireRole("admin", "super_admin")

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-semibold">Inbox</h1>
      <p className="text-muted-foreground">Phase 1 — coming soon</p>
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        <p>Signed in as <strong>{user.name}</strong></p>
        <p>Role: <strong>{user.role}</strong></p>
        <p>Tenant: <strong>{user.tenantName}</strong></p>
        {user.groupIds.length > 0 && (
          <p>Group IDs: <strong>{user.groupIds.join(", ")}</strong></p>
        )}
      </div>
    </div>
  )
}
