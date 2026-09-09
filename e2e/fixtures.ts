import { test as base, expect, type Locator, type Page } from "@playwright/test";

/** The two accounts `supabase/seed.sql` creates (test fixtures, not secrets). */
export const SEED_USERS = {
  owner: { email: "demo@momentum.test", password: "momentum123", timezone: "America/New_York" },
  neighbour: { email: "second@momentum.test", password: "momentum123", timezone: "Europe/London" },
} as const;

export type SeedUser = keyof typeof SEED_USERS;

export async function signIn(page: Page, user: SeedUser = "owner"): Promise<void> {
  const { email, password } = SEED_USERS[user];
  await signInAs(page, email, password);
}

/** Signs in with any credentials — for accounts a spec creates or re-keys. */
export async function signInAs(page: Page, email: string, password: string): Promise<void> {
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

/** `E2E-` prefix plus timestamp, so a run never collides with seed data or another run. */
export function uniqueName(prefix: string): string {
  return `E2E-${prefix}-${Date.now().toString(36)}`;
}

/** `RegExp` source for a literal string. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Captures a task through Quick Add and waits for the confirmation toast. */
export async function quickAdd(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "Quick add" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Task title").fill(title);
  await dialog.getByLabel("Task title").press("Enter");
  await expect(toasts(page).getByText(`Added "${title}"`)).toBeVisible();
  await expect(dialog).toBeHidden();
}

/** Completes a task from the list on `/tasks` and waits for the write to land. */
export async function completeFromList(page: Page, title: string): Promise<void> {
  const complete = page.getByRole("checkbox", { name: `Complete "${title}"` });
  await committed(page, () => complete.click());
  await expect(complete).toBeHidden();
}

/**
 * Performs an interaction and waits for the server action it fires to finish.
 * Every write is optimistic, so reloading on the visual cue alone races the
 * write; the action's response read to the end is the honest "it landed".
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

/** The toast stack, so a text assertion is not also matched by the live-region announcement. */
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

/** Today in the profile's timezone (never the machine's), or a day near it. */
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

/** Records console errors and uncaught exceptions from now on; attach before navigating. */
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

/** The Mailpit API (`supabase start` exposes it on 54324); every auth email lands here. */
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

export interface MailpitSummary {
  ID: string;
  To: { Address: string; Name: string }[];
  Subject: string;
}

export interface MailpitMessage extends MailpitSummary {
  Text: string;
  HTML: string;
}

async function mailpit<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}/api/v1${path}`, init);
  if (!response.ok) throw new Error(`Mailpit ${path}: ${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

export const mail = {
  async list(): Promise<MailpitSummary[]> {
    const { messages } = await mailpit<{ messages: MailpitSummary[] }>("/messages");
    return messages;
  },
  read(id: string): Promise<MailpitMessage> {
    return mailpit<MailpitMessage>(`/message/${id}`);
  },
  /** Empties the inbox. Mailpit answers this one with plain "ok", not JSON. */
  async clear(): Promise<void> {
    const response = await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
    if (!response.ok) throw new Error(`Mailpit clear: ${response.status} ${response.statusText}`);
  },
  /** Polls until a message addressed to `to` arrives. */
  async waitForMessage(to: string, { timeout = 15_000 } = {}): Promise<MailpitMessage> {
    const deadline = Date.now() + timeout;
    const address = to.toLowerCase();
    while (Date.now() < deadline) {
      const match = (await mail.list()).find((message) =>
        message.To.some((recipient) => recipient.Address.toLowerCase() === address),
      );
      if (match) return mail.read(match.ID);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`No email for ${to} within ${timeout}ms`);
  },
};

/** The first link whose path is one of `pathnames`; the auth server writes `&amp;` between query parameters. */
export function linkTo(message: MailpitMessage, pathnames: readonly string[]): string {
  const hrefs = [...message.HTML.matchAll(/href="([^"]+)"/g)].map(
    ([, href]) => href?.replace(/&amp;/g, "&") ?? "",
  );
  const link = hrefs.find((href) => {
    try {
      return pathnames.includes(new URL(href).pathname);
    } catch {
      return false;
    }
  });
  if (!link) {
    throw new Error(
      `No link to ${pathnames.join(" or ")} in "${message.Subject}": ${hrefs.join(", ")}`,
    );
  }
  return link;
}
