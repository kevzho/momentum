import { beforeEach, describe, expect, it, vi } from "vitest";

import { ianaTimeZone } from "@momentum/core/time";

const { requireSession, exportTablesFor } = vi.hoisted(() => ({
  requireSession: vi.fn(),
  exportTablesFor: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("@/features/export/queries", () => ({ exportTablesFor }));

const { GET } = await import("@/app/api/export/route");
const { redirect } = await import("next/navigation");

const SUPABASE = { from: vi.fn() };

describe("GET /api/export", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 03:30 UTC on the 10th is still the evening of the 9th in New York.
    vi.setSystemTime(new Date("2026-09-10T03:30:00.000Z"));
    requireSession.mockReset().mockResolvedValue({
      supabase: SUPABASE,
      userId: "u",
      email: null,
      profile: { timezone: ianaTimeZone("America/New_York") },
    });
    exportTablesFor.mockReset().mockResolvedValue({ tasks: [{ id: "t1" }], projects: [] });
  });

  it("answers with one JSON attachment named for the day in the profile timezone", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="momentum-export-2026-09-09.json"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");

    expect(await response.json()).toEqual({
      exportedAt: "2026-09-10T03:30:00.000Z",
      timezone: "America/New_York",
      tables: { tasks: [{ id: "t1" }], projects: [] },
    });
  });

  it("reads through the session's own client, so RLS scopes every table", async () => {
    await GET();

    expect(exportTablesFor).toHaveBeenCalledWith(SUPABASE);
  });

  it("sends a signed-out request to /login instead of answering", async () => {
    requireSession.mockImplementation(() => redirect("/login"));

    await expect(GET()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;[a-z]+;\/login;/),
    });
    expect(exportTablesFor).not.toHaveBeenCalled();
  });
});
