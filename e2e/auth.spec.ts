import { expect, signIn, test, SEED_USERS } from "./fixtures";

/** Workflow 1 — Signup / login. */
test.describe("Sign in and sign out", () => {
  test("signs in, lands on Today, and signs out from the account menu", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    // A signed-out request for an app route is turned away, not served.
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/login/);
  });

  test("rejects a wrong password and stays on the sign-in page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(SEED_USERS.owner.email);
    await page.getByLabel(/password/i).fill("not-the-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
