import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest does not unmount between tests on its own; without this each render
// stacks in the same document and role queries match the previous test's tree.
afterEach(cleanup);
