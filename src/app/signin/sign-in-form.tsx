"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { signIn } from "next-auth/react"

import { SignInSchema, type SignInInput } from "@/lib/schemas/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export function SignInForm({ tenantName }: { tenantName: string }) {
  const router = useRouter()
  const [authError, setAuthError] = useState<string | null>(null)

  const form = useForm<SignInInput>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(values: SignInInput) {
    setAuthError(null)
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    })

    if (result?.error) {
      setAuthError("Invalid email or password.")
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            {tenantName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {authError && (
              <p className="text-sm font-medium text-destructive">{authError}</p>
            )}

            <Button
              type="submit"
              className="mt-2 w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  )
}
