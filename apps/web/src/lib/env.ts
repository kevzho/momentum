import "server-only";

import { z } from "zod";

/**
 * Validated environment; a missing variable fails once, loudly, by name. The
 * `NEXT_PUBLIC_` values are read through literal property accesses so the
 * compiler can inline them. `SUPABASE_SECRET_KEY` is deliberately absent: the
 * application never uses it.
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
