import { expect, signIn, test } from "./fixtures";

test.describe("Command palette", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("opens with Ctrl+K and runs a navigation command", async ({ page }) => {
    await page.goto("/tasks");
    await page.keyboard.press("Control+k");

    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    const search = palette.getByRole("combobox");
    await expect(search).toBeFocused();

    await search.fill("habits");
    // The match list is fuzzy, so the navigation command is chosen by name.
    await palette.getByRole("option", { name: "Habits", exact: true }).click();

    await expect(page).toHaveURL(/\/habits/);
    await expect(palette).toBeHidden();
  });

  test("runs an action command: Add task opens Quick Add", async ({ page }) => {
    await page.goto("/calendar");
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await palette.getByRole("combobox").fill("add task");
    await palette.getByRole("option", { name: /^Add task/ }).click();

    await expect(page.getByRole("dialog", { name: "New task" })).toBeVisible();
    await expect(page.getByLabel("Task title")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "New task" })).toBeHidden();
  });
});
