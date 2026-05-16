import { z } from "zod"

export const SignInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})

export type SignInInput = z.infer<typeof SignInSchema>
