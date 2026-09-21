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
      const material = page.getByLabel("Week 2 notes");
      await material.fill("Chapter 2, sections 1–4");
      await committed(page, () => material.blur());

      await page.reload();
      await expect(page.getByLabel("Week 2 topic")).toHaveValue("Limits");
      await expect(page.getByLabel("Week 2 notes")).toHaveValue("Chapter 2, sections 1–4");
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

  test("a week's checklist: an item planned for today shows on Today; a PDF syllabus uploads and opens", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const name = uniqueName("check");
    const item = uniqueName("read");
    const start = localDay(TZ, -3);
    const end = localDay(TZ, 24);

    await test.step("create a course whose week 1 holds today", async () => {
      await page.goto("/courses");
      await page.getByRole("button", { name: "New course" }).click();
      const dialog = page.getByRole("dialog", { name: "New course" });
      await dialog.getByLabel("Name").fill(name);
      await dialog.getByRole("button", { name: "Term starts" }).click();
      await page.getByRole("textbox", { name: "Type a date" }).fill(start.iso);
      await page.getByRole("textbox", { name: "Type a date" }).press("Enter");
      await expect(page.getByRole("textbox", { name: "Type a date" })).toHaveCount(0);
      await dialog.getByRole("button", { name: "Term ends" }).click();
      await page.getByRole("textbox", { name: "Type a date" }).fill(end.iso);
      await page.getByRole("textbox", { name: "Type a date" }).press("Enter");
      await dialog.getByRole("button", { name: "Create course" }).click();
      await expect(page).toHaveURL(/\/courses\/[0-9a-f-]{36}$/);
    });

    await test.step("add a reading planned for today, and a link", async () => {
      const composer = page.getByLabel("Add to week 1");
      await page.getByRole("combobox", { name: "Day" }).first().click();
      await page.getByRole("option", { name: "Today" }).click();
      await composer.fill(item);
      await committed(page, () => composer.press("Enter"));

      await composer.fill("Course site https://example.com/course");
      await committed(page, () => composer.press("Enter"));

      const list = page.getByRole("list", { name: "Week 1 checklist" });
      await expect(list.getByRole("checkbox", { name: item })).toBeVisible();
      await expect(list.getByRole("link", { name: /Course site/ })).toHaveAttribute(
        "href",
        "https://example.com/course",
      );
      await expect(list.getByRole("combobox", { name: `${item}: day` })).toHaveText("Today");
      await shot(page, "course-checklist");
    });

    await test.step("Today lists it and ticks it", async () => {
      await page.goto("/today");
      const section = page
        .getByRole("heading", { name: "From your courses" })
        .locator("..")
        .locator("..");
      const box = section.getByRole("checkbox", { name: item });
      await expect(box).toBeVisible();
      await shot(page, "today-course-items");
      await committed(page, () => box.click());
      await expect(section.getByRole("checkbox", { name: `${item}, done` })).toBeVisible();

      await page.goBack();
      await expect(
        page
          .getByRole("list", { name: "Week 1 checklist" })
          .getByRole("checkbox", { name: `${item}, done` }),
      ).toBeVisible();
    });

    await test.step("upload a PDF syllabus, open it, remove it", async () => {
      const pdf = Buffer.from(
        "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
      );
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Upload PDF" }).click();
      await (
        await chooser
      ).setFiles({ name: "syllabus.pdf", mimeType: "application/pdf", buffer: pdf });
      await expect(toasts(page).getByText("Uploaded syllabus.pdf")).toBeVisible();
      const link = page.getByRole("link", { name: "syllabus.pdf" });
      await expect(link).toBeVisible();
      await shot(page, "course-syllabus-pdf");

      // The route redirects the owner to a signed link that serves the PDF.
      const href = await link.getAttribute("href");
      const response = await page.request.get(href ?? "");
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("application/pdf");

      await page.getByRole("button", { name: "Remove syllabus PDF" }).click();
      await expect(toasts(page).getByText("Syllabus PDF removed")).toBeVisible();
      await expect(page.getByRole("button", { name: "Upload PDF" })).toBeVisible();
    });

    await test.step("delete the course", async () => {
      await page.getByRole("button", { name: "Edit" }).click();
      await page
        .getByRole("dialog", { name: "Edit course" })
        .getByRole("button", { name: "Delete course" })
        .click();
      const confirm = page.getByRole("dialog", { name: `Delete “${name}”?` });
      await committed(page, () => confirm.getByRole("button", { name: "Delete course" }).click());
      await expect(page).toHaveURL(/\/courses$/);
    });
  });
});
