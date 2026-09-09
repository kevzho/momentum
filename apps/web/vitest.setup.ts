import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(cleanup);

/*
 * jsdom has no ResizeObserver, and Radix measures a tooltip's content with one
 * the moment that content opens. Moving focus onto a tooltip trigger is
 * therefore enough to kill a test with `ReferenceError: ResizeObserver is not
 * defined` before it can assert anything — and moving focus onto a control is
 * exactly what Domain Rule 10's regression tests do, so this belongs to the
 * whole app suite rather than to the one file that hit it first. A no-op
 * suffices: nothing here asserts on where a tooltip is placed.
 */
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", NoopResizeObserver);

/*
 * jsdom implements no scrolling at all, so `scrollIntoView` is simply absent —
 * and `cmdk` calls it every time the selection moves, which is every arrow key
 * the command palette handles. Like the observer above this is an environment
 * gap rather than anything a component should be defending against, so it is
 * filled once for the whole suite. A no-op is enough: nothing here asserts on
 * scroll position.
 */
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}
