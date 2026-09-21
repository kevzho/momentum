import { expect, SEED_USERS, signIn, test } from "./fixtures";

const TZ = SEED_USERS.owner.timezone;

/** "HH:MM" as the profile's clock reads right now, minus `minutesAgo`. */
function localClock(timeZone: string, minutesAgo: number): string {
  const at = new Date(Date.now() - minutesAgo * 60_000);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

/**
 * Reminders fire from the open app through the Notification API. The API is
 * replaced before any page script runs so every notification is recorded,
 * and the preference is written as the settings page would write it.
 */
test.describe("Reminders", () => {
  test("the morning summary fires when its time comes, once, and the settings offer the controls", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["notifications"]);
    await page.addInitScript(() => {
      const shown: { title: string; body: string; tag: string }[] = [];
      class Recorder {
        static permission = "granted";
        static requestPermission = () => Promise.resolve("granted");
        onclick: (() => void) | null = null;
        close() {}
        constructor(title: string, options: { body?: string; tag?: string } = {}) {
          shown.push({ title, body: options.body ?? "", tag: options.tag ?? "" });
        }
      }
      Object.assign(window, { Notification: Recorder, __shown: shown });
    });

    await signIn(page);

    // The digest time is two minutes ago: inside the grace window, so it fires at once.
    await page.evaluate(
      ([key, digestTime]) => {
        window.localStorage.setItem(
          key,
          JSON.stringify({
            enabled: true,
            preferences: { eventLeadMinutes: 10, digestTime, eveningTime: "23:59" },
          }),
        );
        window.localStorage.removeItem("momentum.notifications.remindersShown");
      },
      ["momentum.notifications.reminders", localClock(TZ, 2)] as const,
    );
    await page.goto("/today");

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __shown: unknown[] }).__shown), {
        timeout: 15_000,
      })
      .toEqual([
        expect.objectContaining({ title: "Today", tag: expect.stringMatching(/^digest:/) }),
      ]);

    // The seeded account has overdue tasks, so the summary counts them.
    const [first] = await page.evaluate(
      () => (window as unknown as { __shown: { body: string }[] }).__shown,
    );
    expect(first?.body).toMatch(/overdue/);

    // A reload shows nothing again: the key was recorded.
    await page.reload();
    await page.waitForTimeout(3_000);
    expect(
      await page.evaluate(() => (window as unknown as { __shown: unknown[] }).__shown),
    ).toHaveLength(0);

    await page.goto("/settings");
    const toggle = page.getByRole("switch", {
      name: "Remind me about events, tasks and course work",
    });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Before an event")).toBeVisible();
    await expect(page.getByLabel("Morning summary")).toHaveValue(localClock(TZ, 2));
    await expect(page.getByLabel("Evening check")).toHaveValue("23:59");
  });
});
