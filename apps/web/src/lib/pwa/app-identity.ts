// Shared by the manifest, the document metadata, the theme-color tags and the
// offline page, which must agree.

export const APP_NAME = "Momentum";

/** Home screens truncate past ~12 characters. */
export const APP_SHORT_NAME = "Momentum";

export const APP_DESCRIPTION = "A scheduling-first, gamified productivity system.";

/**
 * `--background` in each theme, as sRGB: a `<meta name="theme-color">` and the
 * manifest cannot reference a CSS variable. Must match
 * `packages/ui/src/styles/globals.css`; change both in the same commit.
 */
export const THEME_COLOR = {
  light: "#fdfdfe",
  dark: "#0f1115",
} as const;
