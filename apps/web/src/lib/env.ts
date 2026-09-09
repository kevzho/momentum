import "server-only";

import { z } from "zod";

/**
 * Validated environment. Reading `process.env` anywhere else means a typo
 * surfaces as `undefined` deep inside a request; here it fails once, loudly,
 * with the name of the variable.
 *
 * The `NEXT_PUBLIC_` values are read through literal property accesses so the
 * Next.js compiler can inline them; they are still only *used* on the server,
 * because v1 has no browser Supabase client (docs/ARCHITECTURE.md §4).
 *
 * `SUPABASE_SECRET_KEY` is deliberately absent: the secret key is used by the
 * seed script and the integration-test harness, never by the application
 * (docs/ARCHITECTURE.md §12). Importing it here would put it one refactor away
 * from a request path.
 */
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "must be the Supabase project URL" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "must be the publishable (sb_publishable_… or anon) key"),
  NEXT_PUBLIC_APP_URL: z.url({ message: "must be the canonical public origin" }),
});

function readEnv(): z.infer<typeof envSchema> {
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment. Copy .env.example to apps/web/.env.local and fill in:\n${details}`,
    );
  }

  return parsed.data;
}

let cached: z.infer<typeof envSchema> | undefined;

/** Lazily validated so importing a module never throws at build time. */
export function env(): z.infer<typeof envSchema> {
  cached ??= readEnv();
  return cached;
}
