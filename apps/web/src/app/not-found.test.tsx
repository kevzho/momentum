import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotFound, { metadata } from "@/app/not-found";

describe("not-found", () => {
  it("has the one h1 every route has, and a page title", () => {
    render(<NotFound />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("That page does not exist");
    expect(metadata.title).toBe("Page not found");
  });
});
