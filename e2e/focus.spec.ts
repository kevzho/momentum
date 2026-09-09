import { expect, signIn, test } from "./fixtures";

/** Start, pause / resume and finish a focus session. */
test.describe("Focus", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("runs a one-minute custom session through pause, resume and finish", async ({ page }) => {
    await page.goto("/focus");
    const timer = page.getByRole("region", { name: "Focus session timer" });
    const history = page.getByRole("region", { name: "Focus history" });

    // A session left running by an earlier run would hide the setup panel.
    const leftover = timer.getByRole("button", { name: "End session" });
    if (await leftover.isVisible()) {
      await leftover.click();
      await expect(leftover).toBeHidden();
    }

    await timer.getByRole("radio", { name: "Custom" }).click();
    const minutes = timer.getByRole("textbox", { name: "Minutes" });
    await minutes.fill("1");
    await minutes.press("Enter");
    await timer.getByRole("button", { name: "Start 1 minutes" }).click();

    const pause = timer.getByRole("button", { name: "Pause" });
    await expect(pause).toBeVisible();
    await expect(timer.getByText("Running", { exact: true })).toBeVisible();

    await pause.click();
    const resume = timer.getByRole("button", { name: "Resume" });
    await expect(resume).toBeVisible();
    await expect(timer.getByText("Paused", { exact: true })).toBeVisible();

    await resume.click();
    await expect(pause).toBeVisible();
    await expect(timer.getByText("Running", { exact: true })).toBeVisible();

    await timer.getByRole("button", { name: "Finish session" }).click();
    await expect(timer.getByRole("button", { name: /^Start \d+ minutes$/ })).toBeVisible();

    // The finished session heads the history.
    const recent = history.getByRole("list").last().getByRole("listitem").first();
    await expect(recent).toContainText("No task — just the timer");
    await expect(recent).toContainText("Finished");

    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "Focus history" })
        .getByRole("list")
        .last()
        .getByRole("listitem")
        .first(),
    ).toContainText("Finished");
  });
});
