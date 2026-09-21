import {
  committed,
  escapeRegExp,
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

/** Exams go on the calendar and homework gets a due date, each from one typed line. */
test.describe("Capturing dates", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("an exam with a time becomes an event from the palette, and can be made all day", async ({
    page,
  }) => {
    const title = uniqueName("exam");
    const timed = () =>
      page.getByRole("group", { name: new RegExp(`^${escapeRegExp(title)}, Event, 09:00`) });
    const allDay = () =>
      page.getByRole("button", { name: new RegExp(`^${escapeRegExp(title)}, Event, all day`) });

    await test.step("Add event opens Quick Add on an event", async () => {
      await page.goto("/today");
      await page.keyboard.press("Meta+k");
      await page.getByRole("combobox").fill("add event");
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "New event" });
      await expect(dialog.getByLabel("Event title")).toBeFocused();

      await dialog.getByLabel("Event title").fill(`${title} today 9-10am`);
      await expect(dialog.getByText(/· 09:00 – 10:00 · 1h$/)).toBeVisible();
      await shot(page, "quick-add-event");
      await dialog.getByLabel("Event title").press("Enter");
      await expect(toasts(page).getByText(`Added "${title}"`)).toBeVisible();
      await expect(dialog).toBeHidden();
    });

    await test.step("it is on today's column", async () => {
      await page.goto("/calendar");
      await expect(timed()).toHaveCount(1);
    });

    await test.step("the editor turns it into an all-day event", async () => {
      await timed().focus();
      await page.keyboard.press("Enter");
      const editor = page.getByRole("dialog", { name: "Event" });
      const toggle = editor.getByRole("switch", { name: "All day" });
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await toggle.click();
      await expect(editor.getByLabel("Start")).toHaveCount(0);
      await expect(editor.getByText(/· All day$/)).toBeVisible();
      await shot(page, "editor-all-day");
      await committed(page, () => editor.getByRole("button", { name: "Save" }).click());
      await expect(allDay()).toHaveCount(1);
      await expect(timed()).toHaveCount(0);
      await shot(page, "calendar-all-day");
    });

    await test.step("and it survives a reload, then is deleted", async () => {
      await page.reload();
      await expect(allDay()).toHaveCount(1);
      await allDay().click();
      const editor = page.getByRole("dialog", { name: "Event" });
      await expect(editor.getByRole("switch", { name: "All day" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await committed(page, () => editor.getByRole("button", { name: "Delete" }).click());
      await expect(allDay()).toHaveCount(0);
    });
  });

  test("homework due Friday, then moved to a typed date in the sheet", async ({ page }) => {
    const title = uniqueName("hw");
    const today = localDay(TZ);
    // The next Friday strictly after today, as the parser resolves it.
    const ahead = (5 - today.weekday + 7) % 7 || 7;
    const friday = localDay(TZ, ahead);

    await test.step("'due fri' is a deadline, not part of the title", async () => {
      await page.goto("/today");
      await page.getByRole("button", { name: "Quick add" }).click();
      const dialog = page.getByRole("dialog", { name: "New task" });
      await dialog.getByLabel("Task title").fill(`${title} due fri`);
      // The chip names the resolved day ("Tomorrow" on a Thursday), never the word typed.
      const chip = ahead === 1 ? "Tomorrow" : (friday.long.split(",")[0] ?? "Friday");
      await expect(dialog.getByRole("group", { name: "Understood from the title" })).toHaveText(
        new RegExp(`^${chip}Remove ${chip} and keep “due fri” in the title$`),
      );
      await expect(dialog.getByRole("button", { name: "Due date" })).toHaveText(friday.medium);
      await shot(page, "quick-add-due-fri");
      await dialog.getByLabel("Task title").press("Enter");
      await expect(toasts(page).getByText(`Added "${title}"`)).toBeVisible();
    });

    await test.step("the sheet's picker takes a typed date", async () => {
      await page.goto("/tasks");
      await page.getByRole("list", { name: "Tasks" }).getByText(title, { exact: true }).click();
      const sheet = page.getByRole("dialog", { name: title });
      const due = sheet.getByRole("button", { name: "Due date" });
      await expect(due).toHaveText(friday.medium);

      await due.click();
      const field = page.getByRole("textbox", { name: "Type a date" });
      await expect(field).toBeFocused();
      await field.fill("in 2 weeks");
      await shot(page, "date-picker-typed");
      await committed(page, () => field.press("Enter"));
      await expect(due).toHaveText(localDay(TZ, 14).medium);
    });
  });
});
