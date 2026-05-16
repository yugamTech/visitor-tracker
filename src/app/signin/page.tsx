import { headers } from "next/headers"
import { SignInForm } from "./sign-in-form"

export default async function SignInPage() {
  const headerStore = await headers()
  const tenantName = headerStore.get("x-tenant-name") ?? "VisitorTrack"

  return <SignInForm tenantName={tenantName} />
}
