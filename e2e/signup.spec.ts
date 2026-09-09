import { expect, linkTo, mail, test } from "./fixtures";

// With email confirmations off (the local default) the action signs the new
// account straight in; with them on, the confirmation link finishes the job.
test.describe("Sign up", () => {
  test("creates an account and lands on Today", async ({ page }) => {
    const email = `e2e-${Date.now().toString(36)}@momentum.test`;
    await mail.clear();

    await page.goto("/signup");
    await page.getByLabel("Name (optional)").fill("E2E Signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("E2E-signup-secret");
    await page.getByRole("button", { name: "Create account" }).click();

    const confirmation = page.getByRole("status");
    await Promise.race([
      page.waitForURL(/\/today/, { waitUntil: "commit" }),
      confirmation.waitFor({ state: "visible" }),
    ]);

    if (/\/today/.test(page.url())) {
      test.info().annotations.push({
        type: "note",
        description: "Email confirmations are off: the sign-up signed straight in.",
      });
    } else {
      await expect(confirmation).toHaveText(`Check ${email} for a link to confirm your account.`);
      const message = await mail.waitForMessage(email);
      // GoTrue's default confirmation link is PKCE, so it is followed in the
      // browser that signed up.
      await page.goto(linkTo(message, ["/auth/callback", "/auth/v1/verify"]));
      await page.waitForURL(/\/today/, { waitUntil: "commit" });
    }

    await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E Signup");
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  });
});
