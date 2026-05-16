import Link from "next/link"
import { requireUser } from "@/lib/auth-helpers"
import { signOutAction } from "@/actions/auth/signout"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  const roleLabel: Record<typeof user.role, string> = {
    guard: "Guard",
    admin: "Admin",
    super_admin: "Super Admin",
  }

  return (
    <div className="flex h-full min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        {/* Brand */}
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <span className="font-heading text-lg font-semibold text-sidebar-primary">
            {user.tenantName}
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {user.role === "guard" && (
            <Link
              href="/guard"
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              Gate
            </Link>
          )}
          {(user.role === "admin" || user.role === "super_admin") && (
            <>
              <Link
                href="/admin"
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                Inbox
              </Link>
              <Link
                href="/admin/passes"
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                Passes
              </Link>
              <Link
                href="/admin/visitors"
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                Visitors
              </Link>
            </>
          )}
          {user.role === "super_admin" && (
            <Link
              href="/admin/settings"
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              Settings
            </Link>
          )}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
          <span className="font-heading text-base font-medium text-foreground">
            {user.tenantName}
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user.name}
              <span className="ml-1.5 text-xs opacity-60">
                ({roleLabel[user.role]})
              </span>
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
