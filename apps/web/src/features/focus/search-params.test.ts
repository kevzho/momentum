import { describe, expect, it } from "vitest";

import {
  requestedMinutes,
  requestedTaskId,
  type FocusSearchParams,
} from "@/features/focus/search-params";

// A reader wanting a different key would type-check against the all-optional
// object and silently open every launched session on "No task".
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
    // the `<Link href="/focus?task=…">`s.
    const url = new URL(`http://localhost/focus?task=${TASK}&minutes=45`);
    const params: FocusSearchParams = Object.fromEntries(url.searchParams);
    expect(requestedTaskId(params, () => true)).toBe(TASK);
    expect(requestedMinutes(params)).toBe(45);
  });
});
