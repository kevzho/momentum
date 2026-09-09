import {
  completeFromList,
  expect,
  quickAdd,
  readXpBadge,
  signIn,
  test,
  uniqueName,
} from "./fixtures";

/**
 * Workflows 13 and 14 — earn XP, level up.
 *
 * The neighbour account is used because task XP is capped over a rolling
 * 24-hour window and the populated account is shared with every other check
 * run against this database; the neighbour has headroom.
 */
test.describe("Progress", () => {
  test("completing a task grows the ledger the top bar reads", async ({ page }) => {
    await signIn(page, "neighbour");
    const before = await readXpBadge(page);

    const title = uniqueName("xp");
    await quickAdd(page, title);
    await page.goto("/tasks");
    await completeFromList(page, title);

    // XP is computed by the database, never asserted by the client, so the
    // badge is read back from a fresh request rather than from the page that
    // sent the mutation.
    await page.goto("/progress");
    const after = await readXpBadge(page);
    expect(after.level > before.level || after.remaining < before.remaining).toBe(true);

    // The ledger names the event in the database's own words (Domain Rule 6).
    await expect(page.getByText(`Completed "${title}"`, { exact: true })).toBeVisible();
  });

  test("the progress page renders the level the top bar shows", async ({ page }) => {
    await signIn(page);
    const badge = await readXpBadge(page);

    await page.goto("/progress");
    await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
    await expect(page.getByText(`Level ${badge.level}`, { exact: true })).toBeVisible();
    await expect(
      page.getByText(`${badge.remaining} XP to level ${badge.level + 1}`, { exact: true }),
    ).toBeVisible();
  });
});
