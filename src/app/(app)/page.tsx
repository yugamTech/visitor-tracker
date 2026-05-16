import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth-helpers"

export default async function AppHome() {
  const user = await requireUser()

  if (user.role === "guard") {
    redirect("/guard")
  }

  redirect("/admin")
}
