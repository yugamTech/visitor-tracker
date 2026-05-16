export default async function PreRegisterPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <p className="text-muted-foreground">Pre-registration page — coming Phase 1</p>
        <p className="mt-2 text-sm text-muted-foreground opacity-60">Code: {code}</p>
      </div>
    </div>
  )
}
