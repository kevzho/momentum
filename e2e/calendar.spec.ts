import {
  SEED_USERS,
  committed,
  completeFromList,
  escapeRegExp,
  expect,
  localDay,
  quickAdd,
  signIn,
  test,
  uniqueName,
} from "./fixtures";

const TZ = SEED_USERS.owner.timezone;

/** Schedule, move, resize, settle, plan next week. */
test.describe("Calendar", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("schedules a task, moves and resizes its block by keyboard, then settles it", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const title = uniqueName("cal");
    const today = localDay(TZ);
    // Arrow keys stop at the edge of the displayed week, so on a Sunday the block moves left.
    const direction = today.weekday === 0 ? "ArrowLeft" : "ArrowRight";
    const target = localDay(TZ, today.weekday === 0 ? -1 : 1);

    const block = page.getByRole("group", {
      name: new RegExp(`^${escapeRegExp(title)}, Work block, `),
    });
    const column = (day: { long: string }) =>
      page.getByRole("group", { name: new RegExp(`^${escapeRegExp(day.long)}`) });

    await test.step("schedule from the Plan panel with S", async () => {
      await quickAdd(page, title);
      await page.goto("/calendar");

      const row = page.getByRole("button", { name: new RegExp(`^${escapeRegExp(title)},`) });
      await row.focus();
      await page.keyboard.press("s");

      const dialog = page.getByRole("dialog", { name: "Schedule task" });
      await dialog.getByLabel("Date").fill(today.iso);
      await dialog.getByLabel("Start").fill("10:00");
      await dialog.getByLabel("Duration (minutes)").fill("60");
      await committed(page, () =>
        dialog.getByRole("button", { name: "Schedule", exact: true }).click(),
      );
      await expect(dialog).toBeHidden();

      await expect(column(today).getByRole("group", { name: /10:00 – 11:00/ })).toHaveCount(1);
      await expect(block).toHaveAccessibleName(/10:00 – 11:00/);

      await page.reload();
      await expect(column(today).getByRole("group", { name: /10:00 – 11:00/ })).toHaveCount(1);
    });

    await test.step("move to the next day with M, arrow, Enter", async () => {
      await block.focus();
      await page.keyboard.press("m");
      await expect(block).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press(direction);
      await committed(page, () => page.keyboard.press("Enter"));

      await expect(column(target).getByRole("group", { name: /10:00 – 11:00/ })).toHaveCount(1);
      await expect(column(today).getByRole("group", { name: /10:00 – 11:00/ })).toHaveCount(0);

      await page.reload();
      await expect(column(target).getByRole("group", { name: /10:00 – 11:00/ })).toHaveCount(1);
    });

    await test.step("resize with R, arrow down, Enter", async () => {
      await block.focus();
      await page.keyboard.press("r");
      await expect(block).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("ArrowDown");
      await committed(page, () => page.keyboard.press("Enter"));

      // One snap step longer; the start is anchored.
      const longer = /10:00 – 11:(0[1-9]|[1-5]\d)/;
      await expect(block).toHaveAccessibleName(longer);
      await page.reload();
      await expect(block).toHaveAccessibleName(longer);
    });

    await test.step("completing the task settles its block", async () => {
      await page.goto("/tasks");
      await completeFromList(page, title);

      await page.goto("/calendar");
      // An unexecuted block of a completed task stays on the board and reads as settled.
      await expect(block).toHaveAccessibleName(/task completed$/);
    });
  });

  test("plans next week: navigates forward and opens the Plan panel", async ({ page }) => {
    await page.goto("/calendar");
    const heading = page.getByRole("heading", { name: "Calendar" });
    await expect(heading).toBeVisible();

    await page.getByRole("link", { name: "Next week" }).click();
    await expect(page).toHaveURL(/week=\d{4}-\d{2}-\d{2}/);
    const nextMonday = localDay(TZ, 7 - ((localDay(TZ).weekday + 6) % 7));
    await expect(page).toHaveURL(new RegExp(`week=${nextMonday.iso}`));
    await expect(
      page.getByRole("group", { name: new RegExp(`^${nextMonday.long}`) }),
    ).toBeVisible();

    // The header toggle is the pressed one; the panel's own close button shares its name.
    const panelTitle = page.getByText("Plan my week", { exact: true });
    await expect(panelTitle).toBeVisible();
    await page.getByRole("button", { name: "Hide plan panel", pressed: true }).click();
    await expect(panelTitle).toBeHidden();
    await page.getByRole("button", { name: "Show plan panel", pressed: false }).click();
    await expect(panelTitle).toBeVisible();
    await expect(page.getByText("Unscheduled", { exact: true })).toBeVisible();
    await expect(page.getByText("Capacity", { exact: true })).toBeVisible();
  });

  test("repeats an event weekly, finds it next week, and deletes the series", async ({ page }) => {
    test.setTimeout(120_000);

    const title = uniqueName("class");
    const today = localDay(TZ);
    const block = () =>
      page.getByRole("group", { name: new RegExp(`^${escapeRegExp(title)},.*repeats`) });

    await test.step("create it with a weekly rule", async () => {
      await page.goto("/calendar?new=event");
      const editor = page.getByRole("dialog", { name: "New block" });
      await editor.getByLabel("Title").fill(title);
      await editor.getByLabel("Date").fill(today.iso);
      await editor.getByLabel("Start").fill("13:00");
      await editor.getByLabel("End").fill("14:00");
      await editor.getByRole("combobox", { name: "Repeats" }).click();
      await page.getByRole("option", { name: "Every week" }).click();
      await expect(editor.getByText(/^Repeats every week on/)).toBeVisible();
      await committed(page, () => editor.getByRole("button", { name: "Save" }).click());
      // The optimistic row is a plain event; the expanded occurrence arrives with the refresh.
      await expect(block()).toHaveCount(1);
    });

    await test.step("it is on the same weekday next week", async () => {
      await page.getByRole("link", { name: "Next week" }).click();
      await expect(block()).toHaveCount(1);
    });

    await test.step("an occurrence shows its rule; the series deletes every occurrence", async () => {
      await block().focus();
      await page.keyboard.press("Enter");
      const occurrence = page.getByRole("dialog", { name: "Event" });
      await expect(occurrence.getByText(/^Repeats every week on/)).toBeVisible();
      await occurrence.getByRole("button", { name: "Edit series" }).click();
      const series = page.getByRole("dialog", { name: "Repeating event" });
      await expect(series.getByRole("combobox", { name: "Repeats" })).toHaveText("Every week");
      await committed(page, () => series.getByRole("button", { name: "Delete series" }).click());
      await expect(block()).toHaveCount(0);
      await page.getByRole("link", { name: "Previous week" }).click();
      await expect(block()).toHaveCount(0);
    });
  });
});
