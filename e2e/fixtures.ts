import { test as base, expect, type Locator, type Page } from "@playwright/test";

/** The two accounts `supabase/seed.sql` creates (test fixtures, not secrets). */
export const SEED_USERS = {
  owner: { email: "demo@momentum.test", password: "momentum123", timezone: "America/New_York" },
  neighbour: { email: "second@momentum.test", password: "momentum123", timezone: "Europe/London" },
} as const;

export type SeedUser = keyof typeof SEED_USERS;

export async function signIn(page: Page, user: SeedUser = "owner"): Promise<void> {
  const { email, password } = SEED_USERS[user];
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/today/);
}

/** A test that starts signed in as the populated seed account. */
export const test = base.extend<{ signedIn: void }>({
  signedIn: [
    async ({ page }, use) => {
      await signIn(page);
      await use();
    },
    { auto: false },
  ],
});

export { expect };

/* -------------------------------------------------------------------------- */
/* Helpers shared by the workflow specs                                       */
/* -------------------------------------------------------------------------- */

/**
 * Everything a spec creates is prefixed `E2E-` and suffixed with a timestamp,
 * so a run never collides with the seed data, with another run, or with the
 * other audit lanes working against the same database.
 */
export function uniqueName(prefix: string): string {
  return `E2E-${prefix}-${Date.now().toString(36)}`;
}

/** `RegExp` source for a literal string. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Captures a task through Quick Add (the top bar's `+`) and waits for the
 * confirmation toast, which is the app's own signal that the row committed.
 */
export async function quickAdd(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "Quick add" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Task title").fill(title);
  await dialog.getByLabel("Task title").press("Enter");
  await expect(toasts(page).getByText(`Added "${title}"`)).toBeVisible();
  await expect(dialog).toBeHidden();
}

/**
 * Completes a task from the list on `/tasks` and waits for the write to land.
 *
 * The row leaves the view optimistically, before the server has answered
 * (Domain Rule 11), so the action's response is awaited before returning.
 */
export async function completeFromList(page: Page, title: string): Promise<void> {
  const complete = page.getByRole("checkbox", { name: `Complete "${title}"` });
  await committed(page, () => complete.click());
  await expect(complete).toBeHidden();
}

/**
 * Performs an interaction and waits for the server action it fires to finish.
 *
 * Every write is optimistic (Domain Rule 11): the page shows the result before
 * the request has even left, so a reload or navigation on the visual cue alone
 * races the write — the server logs "The destination stream closed early" and
 * the reloaded page can predate the commit. The action's own response, read to
 * the end, is the honest "it landed".
 */
export async function committed<T>(page: Page, act: () => Promise<T>): Promise<T> {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" && "next-action" in candidate.request().headers(),
  );
  const result = await act();
  await (await response).finished();
  return result;
}

/**
 * The toast stack (sonner's region), so an assertion on a toast's text is not
 * also matched by the live-region announcement that carries the same words.
 */
export function toasts(page: Page): Locator {
  return page.getByRole("region", { name: /^Notifications/ });
}

/** A calendar date as the app labels it, resolved in the profile's timezone. */
export interface LocalDay {
  /** `2026-09-09` — what `<input type="date">` takes. */
  iso: string;
  /** `Wednesday, September 9, 2026` — the `long` style of `formatLocalDate`. */
  long: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

/**
 * Today in the user's timezone, or a day near it.
 *
 * The app resolves "today" in the profile timezone, never the machine's
 * (Domain Rule 4), so the specs have to as well: a test run at 23:30 in
 * London must still click the cell the New York profile calls today.
 */
export function localDay(timeZone: string, offsetDays = 0): LocalDay {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  const utcMidnight = Date.UTC(read("year"), read("month") - 1, read("day") + offsetDays);
  const date = new Date(utcMidnight);
  return {
    iso: date.toISOString().slice(0, 10),
    long: new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date),
    weekday: date.getUTCDay(),
  };
}

/**
 * Records every console error and uncaught exception from now on. Attach it
 * before navigating, so hydration and the first render are covered too.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** The top bar's XP indicator: `Level 4. 120 XP to level 5.` */
export async function readXpBadge(page: Page): Promise<{ level: number; remaining: number }> {
  const label = await page
    .getByRole("link", { name: /^Level \d+\. [\d,]+ XP to level \d+\.$/ })
    .getAttribute("aria-label");
  const match = /^Level (\d+)\. ([\d,]+) XP to level \d+\.$/.exec(label ?? "");
  if (match === null) throw new Error(`Unexpected XP badge label: ${label}`);
  return { level: Number(match[1]), remaining: Number(match[2]?.replace(/,/g, "")) };
}
