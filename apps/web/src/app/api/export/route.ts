import { NextResponse } from "next/server";

import { nowInstant, todayIn } from "@momentum/core/time";

import { exportTablesFor } from "@/features/export/queries";
import { requireSession } from "@/lib/auth/session";

/**
 * The signed-in user's data as one JSON attachment; the settings page links
 * here with a plain `<a download>`. Named for the day in the profile timezone
 * and never cached.
 */
export async function GET() {
  const { supabase, profile } = await requireSession();

  const exportedAt = nowInstant();
  const tables = await exportTablesFor(supabase);
  const date = todayIn(profile.timezone, exportedAt);

  return NextResponse.json(
    { exportedAt, timezone: profile.timezone, tables },
    {
      headers: {
        "Content-Disposition": `attachment; filename="momentum-export-${date}.json"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
