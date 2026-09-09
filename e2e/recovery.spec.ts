import type { Browser, Page } from "@playwright/test";

import { expect, linkTo, mail, SEED_USERS, signInAs, test } from "./fixtures";

/**
 * Password recovery, with the email in the loop. The repo's recovery email
 * links to `/auth/callback?token_hash=…&type=recovery`, which verifies in any
 * browser; a stack that cannot serve that template falls back to GoTrue's PKCE
 * link, which only works in the browser that asked. The flow follows whichever
 * link arrived.
 */
const { email, password: ORIGINAL } = SEED_USERS.neighbour;

/** The paths a reset link may point at: ours, or GoTrue's default verify URL. */
const RESET_LINK_PATHS = ["/auth/callback", "/auth/v1/verify"] as const;

async function requestReset(page: Page): Promise<URL> {
  await mail.clear();
  await page.goto("/reset-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toHaveText(
    `If ${email} has an account, a reset link is on its way.`,
  );
  return new URL(linkTo(await mail.waitForMessage(email), RESET_LINK_PATHS));
}

function isTokenHashLink(link: URL): boolean {
  return link.pathname === "/auth/callback" && link.searchParams.has("token_hash");
}

/** Changes the signed-in account's password from /update-password. */
async function setPassword(page: Page, next: string): Promise<void> {
  await page.goto("/update-password");
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Repeat new password").fill(next);
  await page.getByRole("button", { name: "Save password" }).click();
  await page.waitForURL(/\/today/, { waitUntil: "commit" });
}

/** Puts the seed password back: whichever candidate signs in is the current password. */
async function restore(browser: Browser, candidates: string[]): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    for (const candidate of candidates) {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(candidate);
      await page.getByRole("button", { name: /sign in/i }).click();
      // Scoped to the sign-in error: Today has alerts of its own.
      const rejected = page
        .getByRole("alert")
        .filter({ hasText: "do not match an account" })
        .waitFor({ state: "visible" });
      await Promise.race([page.waitForURL(/\/today/, { waitUntil: "commit" }), rejected]);
      if (!/\/today/.test(page.url())) continue;
      if (candidate !== ORIGINAL) await setPassword(page, ORIGINAL);
      return;
    }
    throw new Error(`Could not sign in as ${email} with any known password; restore it by hand.`);
  } finally {
    await context.close();
  }
}

test.describe("Password recovery", () => {
  const replacement = `E2E-${Date.now().toString(36)}-secret`;

  test.afterEach(async ({ browser }) => {
    // Leave second@ as the seed made it, even when an assertion above failed.
    await restore(browser, [ORIGINAL, replacement]);
  });

  test("resets the password from the emailed link and signs in with it", async ({
    page,
    browser,
  }) => {
    const link = await requestReset(page);
    expect(link.searchParams.get("type")).toBe("recovery");

    const portable = isTokenHashLink(link);
    if (!portable) {
      test.info().annotations.push({
        type: "note",
        description: `The stack sent GoTrue's default PKCE recovery link (${link.pathname}), so it was opened in the requesting browser.`,
      });
    }
    // A `token_hash` link is opened in a context with none of this browser's cookies.
    const context = portable ? await browser.newContext() : page.context();
    const opener = portable ? await context.newPage() : page;
    try {
      await opener.goto(link.href);
      await expect(opener).toHaveURL(/\/update-password/);
      await expect(opener.getByRole("heading", { name: "Set a new password" })).toBeVisible();

      await opener.getByLabel("New password", { exact: true }).fill(replacement);
      await opener.getByLabel("Repeat new password").fill(replacement);
      await opener.getByRole("button", { name: "Save password" }).click();
      await opener.waitForURL(/\/today/, { waitUntil: "commit" });
    } finally {
      if (portable) await context.close();
    }

    // The link is single-use.
    await page.context().clearCookies();
    await page.goto(link.href);
    await expect(page).toHaveURL(/\/login\?error=link/);

    await signInAs(page, email, replacement);
    await expect(page).toHaveURL(/\/today/);

    // A signed-in session may change its own password there too.
    await setPassword(page, ORIGINAL);
    await page.context().clearCookies();
    await signInAs(page, email, ORIGINAL);
    await expect(page).toHaveURL(/\/today/);
  });

  test("the reset link verifies in a browser that never asked for it", async ({
    page,
    browser,
  }) => {
    const link = await requestReset(page);
    test.fixme(
      !isTokenHashLink(link),
      `The auth server sent its default PKCE recovery link (${link.pathname}) instead of supabase/templates/recovery.html — it could not fetch the template (see the auth container's templatemailer log). Restart the stack with a Kong that serves the template and re-run.`,
    );

    const fresh = await browser.newContext();
    try {
      const other = await fresh.newPage();
      await other.goto(link.href);
      await expect(other).toHaveURL(/\/update-password/);
      await expect(other.getByRole("heading", { name: "Set a new password" })).toBeVisible();
    } finally {
      await fresh.close();
    }
  });
});
