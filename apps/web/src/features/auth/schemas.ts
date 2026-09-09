import { z } from "zod";

/** Must match `minimum_password_length` in `supabase/config.toml`. */
export const PASSWORD_MIN_LENGTH = 8;

const email = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .pipe(z.email("That does not look like an email address."))
  .transform((value) => value.toLowerCase());

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(72, "Passwords are at most 72 characters.");

// A suggestion only: `handle_new_user()` keeps it if Postgres recognises it.
const timezone = z.string().trim().min(1).max(64).optional();

export const signUpInput = z.object({
  email,
  password,
  displayName: z.string().trim().max(80, "Names are at most 80 characters.").optional(),
  timezone,
});

export const signInInput = z.object({
  email,
  // Not `password`: an existing account may predate the current length rule.
  password: z.string().min(1, "Enter your password."),
});

export const requestPasswordResetInput = z.object({ email });

export const updatePasswordInput = z
  .object({
    password,
    confirmPassword: z.string().min(1, "Repeat the new password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "The two passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignUpInput = z.infer<typeof signUpInput>;
export type SignInInput = z.infer<typeof signInInput>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetInput>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordInput>;
