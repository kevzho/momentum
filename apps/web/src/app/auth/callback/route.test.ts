import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Every hostile case defeats a `startsWith("/") && !startsWith("//")` test:
// the WHATWG parser folds `\` and C0 whitespace into `/` before resolving.
// The allow-list is what closes it, so the destination is what is asserted.

const { verifyOtp, exchangeCodeForSession } = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ auth: { verifyOtp, exchangeCodeForSession } }),
}));

const { GET } = await import("@/app/auth/callback/route");

const ORIGIN = "https://momentum.test";

/** The recovery shape: a verified link whose only variable is `next`. */
async function landingFor(next: string): Promise<string | null> {
  const url = new URL(`${ORIGIN}/auth/callback`);
  url.searchParams.set("token_hash", "a-valid-hash");
  url.searchParams.set("type", "recovery");
  url.searchParams.set("next", next);

  const response = await GET(new NextRequest(url));
  return response.headers.get("location");
}

describe("auth callback", () => {
  beforeEach(() => {
    verifyOtp.mockReset().mockResolvedValue({ error: null });
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  });

  it("returns the user to a route the app actually has", async () => {
    expect(await landingFor("/calendar")).toBe(`${ORIGIN}/calendar`);
  });

  it("still lands password recovery on the screen that asks for the new password", async () => {
    // `requestPasswordReset` sends exactly this link; it is the one destination
    // named outside the registry.
    expect(await landingFor("/update-password")).toBe(`${ORIGIN}/update-password`);
  });

  it.each([
    ["a protocol-relative path", "//evil.example"],
    ["a backslash the parser reads as a second slash", "/\\evil.example"],
    ["two backslashes", "/\\\\evil.example"],
    ["a tab before the second slash", "/\t/evil.example"],
    ["a newline before the second slash", "/\n/evil.example"],
    ["a carriage return before the second slash", "/\r/evil.example"],
    ["an absolute URL", "https://evil.example"],
    ["a route the app does not have", "/nowhere"],
  ])("discards %s and lands on Today", async (_case, next) => {
    expect(await landingFor(next)).toBe(`${ORIGIN}/today`);
  });

  it("sends an expired or already-used link back to sign-in", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token has expired" } });

    expect(await landingFor("/calendar")).toBe(`${ORIGIN}/login?error=link`);
  });

  // A PKCE code is only exchangeable by the browser holding the verifier
  // cookie; elsewhere the link is neither expired nor used.
  it("names the wrong browser, not an expired link, when the PKCE verifier is missing", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: {
        code: "bad_code_verifier",
        message: "code challenge does not match previously saved code verifier",
      },
    });

    const url = new URL(`${ORIGIN}/auth/callback`);
    url.searchParams.set("code", "pkce-code");
    url.searchParams.set("next", "/update-password");
    const response = await GET(new NextRequest(url));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/login?error=browser`);
  });

  it("verifies a recovery token hash with no browser state at all", async () => {
    // The shape `supabase/templates/recovery.html` sends: nothing in it depends on a cookie.
    expect(await landingFor("/update-password")).toBe(`${ORIGIN}/update-password`);
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "a-valid-hash" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
