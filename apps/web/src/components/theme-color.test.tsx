import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeColor } from "@/components/theme-color";
import { THEME_COLOR } from "@/lib/pwa/app-identity";

/**
 * `<meta name="theme-color">` colours the OS chrome around an installed window
 * and the browser UI on a phone. The static tags Next emits are media-scoped,
 * which follows the *operating system* — so a user on a light desktop who has
 * chosen Momentum's dark theme gets a light strip above a dark app until this
 * component corrects it.
 */

const { useTheme } = vi.hoisted(() => ({ useTheme: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme }));

/** The two tags `app/layout.tsx`'s `viewport` export puts in the document. */
function seedMetaTags(): HTMLMetaElement[] {
  document.head.innerHTML = "";
  return (
    [
      ["(prefers-color-scheme: light)", THEME_COLOR.light],
      ["(prefers-color-scheme: dark)", THEME_COLOR.dark],
    ] as const
  ).map(([media, color]) => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("media", media);
    meta.setAttribute("content", color);
    document.head.append(meta);
    return meta;
  });
}

const contents = () =>
  Array.from(document.head.querySelectorAll('meta[name="theme-color"]')).map((meta) =>
    meta.getAttribute("content"),
  );

beforeEach(() => {
  seedMetaTags();
});

describe("ThemeColor", () => {
  it("puts the resolved colour on every tag, so the media query stops mattering", () => {
    useTheme.mockReturnValue({ resolvedTheme: "dark" });

    render(<ThemeColor />);

    // Both, not one: the browser uses the *first* matching tag, so appending a
    // media-less third would lose to the light-scoped one above it.
    expect(contents()).toEqual([THEME_COLOR.dark, THEME_COLOR.dark]);
  });

  it("follows a switch back to the other theme", () => {
    useTheme.mockReturnValue({ resolvedTheme: "dark" });
    const view = render(<ThemeColor />);

    useTheme.mockReturnValue({ resolvedTheme: "light" });
    view.rerender(<ThemeColor />);

    expect(contents()).toEqual([THEME_COLOR.light, THEME_COLOR.light]);
  });

  it("leaves the first paint alone until next-themes has resolved anything", () => {
    // `resolvedTheme` is undefined on the server and until storage is read.
    // The static tags are already correct for `system`, which is the default.
    useTheme.mockReturnValue({ resolvedTheme: undefined });

    render(<ThemeColor />);

    expect(contents()).toEqual([THEME_COLOR.light, THEME_COLOR.dark]);
  });
});
