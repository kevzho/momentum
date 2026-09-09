import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import manifest from "@/app/manifest";

/*
 * `proxy.ts` is imported for its matcher alone. Its one import reaches the
 * request-scoped Supabase client, which is `server-only` and refuses to load
 * outside a server component; the matcher is a plain string and has nothing to
 * do with any of that.
 */
vi.mock("@/lib/supabase/proxy", () => ({ refreshSession: vi.fn() }));

const { config: proxyConfig } = await import("@/proxy");

/**
 * Installability, asserted against the files a browser actually fetches.
 *
 * Every check here stands in for something that fails silently in a browser: an
 * icon whose declared size is not its real size is simply not used, a manifest
 * that 307s to /login is "not installable" with no error anywhere, and a
 * maskable icon without its safe-zone padding just looks wrong on one platform
 * and fine on the others.
 */

const PUBLIC_DIR = join(import.meta.dirname, "..", "..", "..", "public");

/** Width and height straight out of the PNG's IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(join(PUBLIC_DIR, file));
  expect(bytes.subarray(1, 4).toString("ascii"), `${file} is a PNG`).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("web app manifest", () => {
  const value = manifest();

  it("declares the fields a browser requires to offer installation", () => {
    expect(value.name).toBe("Momentum");
    expect(value.short_name).toBe("Momentum");
    expect(value.start_url).toBe("/today");
    expect(value.scope).toBe("/");
    expect(value.display).toBe("standalone");
  });

  it("never falls back to a browser tab, and never asks for the title-bar overlay", () => {
    // An installed window that quietly became a tab is the failure this phase
    // exists to prevent, so `browser` must not be in the fallback chain.
    expect(value.display_override).not.toContain("browser");
    // And declaring `window-controls-overlay` *enables* it: Chrome would draw
    // the window controls into a top bar that has not reserved room for them.
    expect(value.display_override).not.toContain("window-controls-overlay");
  });

  it("keeps the splash colours in step with the design tokens", () => {
    // `--background`, light theme. Changing it in globals.css without changing
    // it here shows up as a flash of the wrong colour on every cold launch.
    expect(value.theme_color).toBe("#fdfdfe");
    expect(value.background_color).toBe("#fdfdfe");
  });

  it("ships every icon it declares, at the size it declares", () => {
    expect(value.icons?.length).toBeGreaterThan(0);

    for (const icon of value.icons ?? []) {
      const [width, height] = String(icon.sizes).split("x").map(Number);
      const actual = pngSize(String(icon.src).replace(/^\//, ""));
      expect(actual, `${icon.src} is ${icon.sizes}`).toEqual({ width, height });
    }
  });

  it("offers 192 and 512 for both purposes, as separate files", () => {
    const by = (purpose: string) =>
      (value.icons ?? [])
        .filter((icon) => icon.purpose === purpose)
        .map((icon) => String(icon.sizes));

    expect(by("any")).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(by("maskable")).toEqual(expect.arrayContaining(["192x192", "512x512"]));

    // Never one file serving both: a maskable icon carries 10% of padding the
    // platform crops, so the same PNG used as `any` renders small and floating.
    const maskableSources = new Set(
      (value.icons ?? []).filter((i) => i.purpose === "maskable").map((i) => String(i.src)),
    );
    for (const icon of value.icons ?? []) {
      if (icon.purpose === "any") expect(maskableSources.has(String(icon.src))).toBe(false);
    }
  });

  it("draws the maskable icons inside the safe zone", () => {
    // The guarantee is only a centred circle of 80% diameter; the corners of
    // the canvas are cropped on Android. The mark is therefore drawn at 54.7%,
    // whose own corners sit inside that circle.
    const source = readFileSync(join(PUBLIC_DIR, "icons", "icon-maskable.svg"), "utf8");
    const [, translate] = /translate\((\d+(?:\.\d+)?) /.exec(source) ?? [];
    const [, scale] = /scale\((\d+(?:\.\d+)?)\)/.exec(source) ?? [];

    const offset = Number(translate);
    const markSize = Number(scale) * 100;
    const halfDiagonal = (markSize / 2) * Math.SQRT2;

    expect(offset + markSize / 2).toBeCloseTo(256, 5); // centred on a 512 canvas
    expect(halfDiagonal).toBeLessThan(512 * 0.4); // inside the safe circle
  });
});

describe("the auth proxy", () => {
  /** The matcher, as the exemption it encodes: does this path reach `proxy()`? */
  function isProxied(pathname: string): boolean {
    const [pattern] = proxyConfig.matcher;
    return new RegExp(`^${pattern}$`).test(pathname);
  }

  it("exempts the files a browser fetches without credentials", () => {
    // Each of these would otherwise be answered with a 307 to /login for a
    // signed-out visitor: the manifest would not parse, and the worker would be
    // registered from a text/html document and rejected.
    expect(isProxied("/manifest.webmanifest")).toBe(false);
    expect(isProxied("/sw.js")).toBe(false);
    expect(isProxied("/offline.html")).toBe(false);
    expect(isProxied("/icons/icon-192.png")).toBe(false);
    expect(isProxied("/icons/apple-touch-icon.png")).toBe(false);
  });

  it("still guards every application route", () => {
    expect(isProxied("/today")).toBe(true);
    expect(isProxied("/calendar")).toBe(true);
    expect(isProxied("/settings")).toBe(true);
    expect(isProxied("/login")).toBe(true);
  });
});
