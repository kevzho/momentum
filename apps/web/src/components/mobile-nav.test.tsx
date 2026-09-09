import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as React from "react";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/today",
}));

// Quick Add's context imports the task actions, a `'use server'` module that reaches `server-only`.
vi.mock("@/features/tasks/actions", () => ({ createTask: vi.fn() }));
// The project list's own mutations, for the same reason.
vi.mock("@/features/projects/actions", () => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
}));

import { MobileNav } from "@/components/mobile-nav";
import { SidebarProvider, useSidebar } from "@/components/sidebar-context";

function OpenOnMount() {
  const { setMobileOpen } = useSidebar();
  React.useEffect(() => setMobileOpen(true), [setMobileOpen]);
  return null;
}

describe("MobileNav", () => {
  it("opens with focus on the first navigation link, not on the New task button", async () => {
    render(
      <SidebarProvider defaultState="expanded">
        <OpenOnMount />
        <MobileNav projects={[]} />
      </SidebarProvider>,
    );

    const today = await screen.findByRole("link", { name: "Today" });
    await waitFor(() => expect(document.activeElement).toBe(today));
    expect(document.activeElement).not.toBe(document.body);
  });
});
