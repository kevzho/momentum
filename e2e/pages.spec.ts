import { collectConsoleErrors, expect, signIn, test } from "./fixtures";

/**
 * Workflows 16 and 17 — Today and Analytics render their sections cleanly.
 *
 * Console errors are collected from before sign-in, so hydration is covered.
 * Nothing is filtered: a React key warning or a failed request on these pages
 * is a defect, not noise.
 */
test.describe("Today and Analytics", () => {
  test("Today renders its sections without console errors", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await signIn(page);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const section of ["Today", "Due today", "Habits", "Quests"]) {
      await expect(
        page.getByRole("heading", { level: 2, name: section, exact: true }),
      ).toBeVisible();
    }
    // The day's XP line sits under the greeting; it is text, never a client assertion.
    await expect(page.getByText(/XP/).first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("Analytics renders its totals and charts without console errors", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await signIn(page);
    await page.goto("/analytics");

    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Last 30 days" })).toBeVisible();
    for (const chart of [
      "Focus time by day",
      "Focus time by project",
      "Planned vs. actual",
      "Consistency by day",
      "Completion trend",
      "Time of day",
    ]) {
      await expect(page.getByText(chart, { exact: true }).first()).toBeVisible();
    }

    await page.getByRole("radio", { name: "Last 7 days" }).click();
    await expect(page.getByRole("radio", { name: "Last 7 days" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    expect(errors).toEqual([]);
  });
});
