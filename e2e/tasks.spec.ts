import {
  committed,
  completeFromList,
  expect,
  quickAdd,
  signIn,
  test,
  uniqueName,
} from "./fixtures";

/** Create, edit and complete a task. */
test.describe("Tasks", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("creates a task through Quick Add and finds it on /tasks after a reload", async ({
    page,
  }) => {
    const title = uniqueName("task");
    await quickAdd(page, title);

    await page.goto("/tasks");
    await expect(
      page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
    ).toBeVisible();
  });

  test("edits a task's title and estimate in the sheet, and the edits persist", async ({
    page,
  }) => {
    const title = uniqueName("edit");
    const renamed = `${title}-renamed`;
    await quickAdd(page, title);

    await page.goto("/tasks");
    await page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }).click();
    const sheet = page.getByRole("dialog", { name: title });
    await expect(sheet).toBeVisible();

    // Each field commits on Enter; the sheet has no Save button by design.
    await sheet.getByLabel("Title").fill(renamed);
    await committed(page, () => sheet.getByLabel("Title").press("Enter"));
    // The sheet is named after the task, so its name follows the rename.
    const renamedSheet = page.getByRole("dialog", { name: renamed });
    await expect(renamedSheet).toBeVisible();

    const estimate = renamedSheet.getByRole("textbox", { name: "Estimate" });
    await estimate.fill("45m");
    await committed(page, () => estimate.press("Enter"));
    await expect(estimate).toHaveValue("45m");
    await expect(renamedSheet.getByText("45m still to schedule.")).toBeVisible();

    await page.goto("/tasks");
    const list = page.getByRole("list", { name: "Tasks" });
    await expect(list.getByText(renamed, { exact: true })).toBeVisible();
    await expect(list.getByText(title, { exact: true })).toHaveCount(0);

    await list.getByText(renamed, { exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: renamed }).getByRole("textbox", { name: "Estimate" }),
    ).toHaveValue("45m");
  });

  test("completes a task from the list and finds it under Completed", async ({ page }) => {
    const title = uniqueName("done");
    await quickAdd(page, title);

    await page.goto("/tasks");
    // A completed task leaves Inbox on its own: the views are derived, not moved.
    await completeFromList(page, title);
    await expect(
      page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }),
    ).toHaveCount(0);

    await page.goto("/tasks?view=completed");
    await expect(page.getByRole("checkbox", { name: `Reopen "${title}"` })).toBeVisible();
  });
});
