import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(cleanup);

// jsdom has no ResizeObserver, and Radix measures a tooltip's content with
// one the moment it opens, so focusing a tooltip trigger would throw. A no-op
// suffices: nothing asserts on where a tooltip is placed.
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", NoopResizeObserver);

// jsdom has no `scrollIntoView`, and `cmdk` calls it every time the selection moves.
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}
