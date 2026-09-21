import {
  committed,
  expect,
  localDay,
  SEED_USERS,
  signIn,
  test,
  toasts,
  uniqueName,
} from "./fixtures";

const TZ = SEED_USERS.owner.timezone;
const SHOTS = process.env.E2E_SHOTS;

async function shot(page: import("@playwright/test").Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** A course is created, given a week's material and an assignment, then deleted. */
test.describe("Courses", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the seeded course lists with its week, and opens on its term", async ({ page }) => {
    await page.goto("/courses");
    await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();
    const row = page.getByRole("list", { name: "Courses" }).getByRole("link", { name: /STAT 201/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText(/Week \d+ of \d+/);
    await shot(page, "courses-list");

    await row.click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Coursework");
    await expect(page.getByLabel("Week 1 topic")).toHaveValue("Descriptive statistics");
    await expect(page.getByRole("textbox", { name: "Syllabus" })).toHaveValue(/Grading/);
    await shot(page, "course-page");
  });

  test("creates a course, writes a week, adds an assignment to it, and deletes the course", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const name = uniqueName("course");
    const assignment = uniqueName("ps");
    const start = localDay(TZ, -7);
    const end = localDay(TZ, 21);

    await test.step("create it from the list", async () => {
      await page.goto("/courses");
      await page.getByRole("button", { name: "New course" }).click();
      const dialog = page.getByRole("dialog", { name: "New course" });
      await dialog.getByLabel("Name").fill(name);
      await dialog.getByLabel("Code").fill("E2E 101");
      await dialog.getByLabel("Instructor").fill("Prof. Fixture");

      // The picker takes a typed date; the end is suggested from the start and then overridden.
      await dialog.getByRole("button", { name: "Term starts" }).click();
      await page.getByRole("textbox", { name: "Type a date" }).fill(start.iso);
      await page.getByRole("textbox", { name: "Type a date" }).press("Enter");
      // The first popover animates out; the second must not open beside it.
      await expect(page.getByRole("textbox", { name: "Type a date" })).toHaveCount(0);
      await dialog.getByRole("button", { name: "Term ends" }).click();
      await page.getByRole("textbox", { name: "Type a date" }).fill(end.iso);
      await page.getByRole("textbox", { name: "Type a date" }).press("Enter");
      await expect(dialog.getByRole("button", { name: "Term ends" })).toHaveText(end.medium);
      await shot(page, "course-form");

      await dialog.getByRole("button", { name: "Create course" }).click();
      await expect(toasts(page).getByText(`Added “${name}”`)).toBeVisible();
      await expect(page).toHaveURL(/\/courses\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
      // Five weeks: one before today, this one, three after.
      await expect(page.getByRole("region", { name: /^Week 5/ })).toBeVisible();
      await expect(page.getByText("This week", { exact: true })).toBeVisible();
    });

    await test.step("write this week's topic and material", async () => {
      const topic = page.getByLabel("Week 2 topic");
      await topic.fill("Limits");
      await committed(page, () => topic.press("Enter"));
      const material = page.getByLabel("Week 2 material");
      await material.fill("Chapter 2, sections 1–4");
      await committed(page, () => material.blur());

      await page.reload();
      await expect(page.getByLabel("Week 2 topic")).toHaveValue("Limits");
      await expect(page.getByLabel("Week 2 material")).toHaveValue("Chapter 2, sections 1–4");
    });

    await test.step("an assignment added from the week lands in it, due on its last day", async () => {
      const week = page.getByRole("region", { name: /^Week 2/ });
      await week.getByRole("button", { name: "Add assignment" }).click();
      const quickAdd = page.getByRole("dialog", { name: "New task" });
      await expect(quickAdd.getByRole("button", { name: "Due date" })).toHaveText(
        localDay(TZ, 6).medium,
      );
      await quickAdd.getByLabel("Task title").fill(assignment);
      await quickAdd.getByLabel("Task title").press("Enter");
      await expect(toasts(page).getByText(`Added "${assignment}"`)).toBeVisible();

      await page.reload();
      await expect(
        page
          .getByRole("list", { name: "Week 2 assignments" })
          .getByRole("link", { name: new RegExp(assignment) }),
      ).toBeVisible();
      await shot(page, "course-with-assignment");
    });

    await test.step("the course also lists, then is deleted with its project left alone", async () => {
      await page.goto("/courses");
      await expect(
        page.getByRole("list", { name: "Courses" }).getByRole("link", { name: new RegExp(name) }),
      ).toBeVisible();
      await page
        .getByRole("list", { name: "Courses" })
        .getByRole("link", { name: new RegExp(name) })
        .click();

      await page.getByRole("button", { name: "Edit" }).click();
      await page
        .getByRole("dialog", { name: "Edit course" })
        .getByRole("button", { name: "Delete course" })
        .click();
      const confirm = page.getByRole("dialog", { name: `Delete “${name}”?` });
      await committed(page, () => confirm.getByRole("button", { name: "Delete course" }).click());
      await expect(page).toHaveURL(/\/courses$/);
      // Gone from the courses list; the sidebar still lists the project, by design.
      await expect(
        page.getByRole("list", { name: "Courses" }).getByRole("link", { name: new RegExp(name) }),
      ).toHaveCount(0);

      // The assignment is still a task in the project (so not in the inbox).
      await page.goto("/tasks?view=all");
      await expect(
        page.getByRole("list", { name: "Tasks" }).getByText(assignment, { exact: true }),
      ).toBeVisible();
    });
  });
});
