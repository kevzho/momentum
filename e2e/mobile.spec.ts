import { expect, signIn, test } from "./fixtures";

/**
 * Mobile usability at phone size (the `mobile` project: iPhone 13, touch).
 *
 * Two facts per route: the page never scrolls sideways, and the navigation
 * drawer — the only navigation chrome a phone carries — opens and lists the
 * sections.
 */
test.describe("Mobile @mobile", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const route of ["/today", "/tasks", "/calendar"]) {
    test(`${route} has no horizontal overflow and opens the navigation drawer`, async ({
      page,
    }) => {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      await page.getByRole("button", { name: "Open navigation" }).click();
      const drawer = page.getByRole("dialog", { name: "Momentum" });
      await expect(drawer).toBeVisible();
      for (const section of ["Today", "Calendar", "Tasks", "Habits", "Focus", "Settings"]) {
        await expect(drawer.getByRole("link", { name: section, exact: true })).toBeVisible();
      }

      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
    });
  }
});
