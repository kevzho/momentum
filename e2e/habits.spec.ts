import {
  SEED_USERS,
  committed,
  escapeRegExp,
  expect,
  localDay,
  signIn,
  test,
  uniqueName,
} from "./fixtures";

/** Workflows 8 and 9 — create a habit and record today. */
test.describe("Habits", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("creates a daily habit and records today, which survives a reload", async ({ page }) => {
    const name = uniqueName("habit");
    const today = localDay(SEED_USERS.owner.timezone);

    await page.goto("/habits");
    await page.getByRole("button", { name: "New habit" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New habit" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Create habit" }).click();
    await expect(dialog).toBeHidden();

    // The row's week strip is a list named after the habit; today's cell is a
    // real button named with the date and its state (Domain Rule 10).
    const week = page.getByRole("list", { name: `${name}, this week` });
    await expect(week).toBeVisible();
    const todayCell = week.getByRole("button", {
      name: new RegExp(`^${escapeRegExp(today.long)}`),
    });
    await expect(todayCell).toHaveAttribute("aria-pressed", "false");

    await committed(page, () => todayCell.click());
    await expect(todayCell).toHaveAttribute("aria-pressed", "true");
    await expect(todayCell).toHaveAccessibleName(/done/);

    await page.reload();
    const reloadedCell = page
      .getByRole("list", { name: `${name}, this week` })
      .getByRole("button", { name: new RegExp(`^${escapeRegExp(today.long)}`) });
    await expect(reloadedCell).toHaveAttribute("aria-pressed", "true");
    await expect(reloadedCell).toHaveAccessibleName(/done/);
  });
});
