import { describe, expect, it } from "vitest";

import {
  createWeeklyGoalInput,
  equipCosmeticInput,
  idInput,
} from "@/features/gamification/schemas";

/**
 * The ids the database mints are not RFC 9562 UUIDs.
 *
 * `quest_assignment_id()` is `md5(...)::uuid` (Domain Rules §20), so the
 * version nibble is whatever the hash produced. These are real ids from a
 * seeded database — the ones a Claim button actually sends — and none of them
 * has a `4` where a v4 UUID would; the first has version nibble `d`, variant
 * `3`. A schema that refused them refused every claim from the interface.
 */
const HASH_DERIVED_IDS = [
  "ad72fcea-d19a-d1b0-3a5e-0f7f5a1b2c3d",
  "0b8c2f61-7e0e-0f8a-1c34-9a0b1c2d3e4f",
  "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "00000000-0000-0000-0000-000000000000",
];

/** The ids a client mints with `crypto.randomUUID()` (Domain Rule 17). */
const V4_ID = "9b2c5e4a-1f3d-4b8e-9c7a-2d6f8e1a3b5c";

describe("idInput", () => {
  it.each(HASH_DERIVED_IDS)("accepts the hash-derived id %s", (id) => {
    expect(idInput.safeParse({ id }).success).toBe(true);
    expect(equipCosmeticInput.safeParse({ id, equipped: true }).success).toBe(true);
  });

  it("accepts a v4 id too", () => {
    expect(idInput.safeParse({ id: V4_ID }).success).toBe(true);
  });

  it.each([
    "",
    "not-an-id",
    "ad72fcead19ad1b03a5e0f7f5a1b2c3d",
    "ad72fcea-d19a-d1b0-3a5e-0f7f5a1b2c3",
    42,
  ])("still refuses %j", (id) => {
    expect(idInput.safeParse({ id }).success).toBe(false);
  });
});

describe("createWeeklyGoalInput", () => {
  it("carries a target and never a reward", () => {
    const parsed = createWeeklyGoalInput.safeParse({
      id: V4_ID,
      metric: "tasks_completed",
      target: 5,
      title: null,
      xpReward: 9_999,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).not.toHaveProperty("xpReward");
  });

  it("refuses a target above the quest cap for the metric", () => {
    const parsed = createWeeklyGoalInput.safeParse({
      id: V4_ID,
      metric: "tasks_completed",
      target: 10_000,
      title: null,
    });
    expect(parsed.success).toBe(false);
  });
});
