import { describe, expect, it } from "vitest";

import {
  requestedMinutes,
  requestedTaskId,
  type FocusSearchParams,
} from "@/features/focus/search-params";

/**
 * The URL a task, a block and Next Up build is `/focus?task=&minutes=`. What
 * is pinned here is that the reader takes exactly those keys — a reader that
 * wanted `taskId` would type-check against an all-optional object and silently
 * open every launched session on "No task".
 */
const TASK = "11111111-1111-4111-8111-111111111111";

describe("the focus page's search params", () => {
  it("pre-selects the task the link named, by the URL's own key", () => {
    const params: FocusSearchParams = { task: TASK, minutes: "45" };
    expect(requestedTaskId(params, (id) => id === TASK)).toBe(TASK);
    expect(requestedMinutes(params)).toBe(45);
  });

  it("drops a task the picker no longer offers", () => {
    expect(requestedTaskId({ task: TASK }, () => false)).toBeNull();
    expect(requestedTaskId({}, () => true)).toBeNull();
  });

  it("ignores a length the schema would refuse", () => {
    expect(requestedMinutes({ minutes: "0" })).toBeNull();
    expect(requestedMinutes({ minutes: "241" })).toBeNull();
    expect(requestedMinutes({ minutes: "twenty" })).toBeNull();
    expect(requestedMinutes({ minutes: "12.5" })).toBeNull();
    expect(requestedMinutes({})).toBeNull();
  });

  it("reads the keys the launchers write, and only those", () => {
    // Mirrors `focusHref` in features/today/components/next-up-panel.tsx and
    // the two `<Link href="/focus?task=…">`s. A key renamed on one side without
    // the other is the defect this file exists to keep out.
    const url = new URL(`http://localhost/focus?task=${TASK}&minutes=45`);
    const params: FocusSearchParams = Object.fromEntries(url.searchParams);
    expect(requestedTaskId(params, () => true)).toBe(TASK);
    expect(requestedMinutes(params)).toBe(45);
  });
});
