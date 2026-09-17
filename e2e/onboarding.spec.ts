import { committed, expect, test, toasts } from "./fixtures";

/**
 * The first-run path, end to end on a fresh account: sign up, confirm hours,
 * capture three tasks through the Quick Add that opens for it, give one a
 * slot, and see the checklist finish and never return. Today's empty states
 * are checked at the two points where they say something different.
 */
test.describe("First-run onboarding", () => {
  test("takes a new account from sign-up to a planned week", async ({ page }) => {
    test.setTimeout(150_000);

    const email = `e2e-${Date.now().toString(36)}@momentum.test`;
    await page.goto("/signup");
    await page.getByLabel("Name (optional)").fill("E2E Onboarding");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("E2E-onboarding-secret");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/calendar/, { waitUntil: "commit" });

    const checklist = page.getByRole("region", { name: "Set up your week" });
    const step = (name: RegExp) => checklist.getByRole("listitem").filter({ hasText: name });

    await test.step("lands on the week with three open steps", async () => {
      await expect(checklist).toBeVisible();
      await expect(checklist.getByText("0 of 3 done")).toBeVisible();
      await expect(step(/Confirm your working hours/)).toHaveAttribute("aria-current", "step");
      await expect(checklist.getByText("Mon–Fri 09:00–17:00")).toBeVisible();
    });

    await test.step("Today points a brand-new account at capture", async () => {
      await page.goto("/today");
      await expect(page.getByText("Capture what is on your mind")).toBeVisible();
      await page.goto("/calendar");
    });

    await test.step("confirming hours ticks the step and opens Quick Add with an example", async () => {
      await committed(page, () =>
        checklist.getByRole("button", { name: "Use these hours" }).click(),
      );

      // Quick Add is modal, so the checklist behind it is checked once it closes.
      const dialog = page.getByRole("dialog", { name: "New task" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("Task title")).toHaveAttribute(
        "placeholder",
        "e.g. Read chapter 4 by friday 90m",
      );

      // Three captures, Shift+Enter keeps the dialog open between them.
      for (const title of ["Read chapter 4", "Draft the outline", "Email the tutor"]) {
        await dialog.getByLabel("Task title").fill(title);
        await dialog.getByLabel("Task title").press("Shift+Enter");
        await expect(toasts(page).getByText(`Added "${title}"`)).toBeVisible();
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      await expect(step(/Confirm your working hours/)).toHaveAttribute("data-state", "done");
      await expect(step(/Add your first three tasks/)).toHaveAttribute("data-state", "done");
      await expect(checklist.getByText("2 of 3 done")).toBeVisible();
    });

    await test.step("Today now points at giving one a slot", async () => {
      await page.goto("/today");
      await expect(page.getByText("Give one a slot")).toBeVisible();
      await expect(page.getByText("3 open tasks have no time reserved")).toBeVisible();
      await page.goto("/calendar");
      await expect(checklist.getByText("2 of 3 done")).toBeVisible();
    });

    await test.step("Find time from the last step schedules a task and finishes the list", async () => {
      await checklist.getByRole("button", { name: "Find time" }).click();
      const dialog = page.getByRole("dialog", { name: "Find time" });
      await expect(dialog).toBeVisible();
      await committed(page, () =>
        dialog.getByRole("button", { name: "Schedule", exact: true }).first().click(),
      );
      await expect(dialog).toBeHidden();

      await expect(step(/Give one a slot/)).toHaveAttribute("data-state", "done");
      await expect(checklist.getByText("3 of 3 done")).toBeVisible();
      await expect(checklist.getByText(/Your week has a plan/)).toBeVisible();
    });

    await test.step("the checklist never returns", async () => {
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendar");
      await expect(page.getByRole("region", { name: "Set up your week" })).toHaveCount(0);
      await expect(page.getByText("Plan my week")).toBeVisible();
    });
  });

  test("can be skipped, and stays skipped", async ({ page }) => {
    const email = `e2e-${Date.now().toString(36)}-skip@momentum.test`;
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("E2E-onboarding-secret");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/calendar/, { waitUntil: "commit" });

    const checklist = page.getByRole("region", { name: "Set up your week" });
    await expect(checklist).toBeVisible();
    await committed(page, () => checklist.getByRole("button", { name: "Skip setup" }).click());
    await expect(checklist).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("Plan my week")).toBeVisible();
    await expect(page.getByRole("region", { name: "Set up your week" })).toHaveCount(0);
  });
});
