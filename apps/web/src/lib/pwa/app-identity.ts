/**
 * The strings and colours that describe the installed application.
 *
 * They are here rather than inline because four places need to agree: the
 * manifest, the document's metadata, the theme-color meta tags, and the offline
 * page. A name that differs between the manifest and the title bar is the kind
 * of thing nobody notices until it is on someone's dock.
 */

export const APP_NAME = "Momentum";

/** Home screens truncate past ~12 characters; this already fits. */
export const APP_SHORT_NAME = "Momentum";

export const APP_DESCRIPTION = "A scheduling-first, gamified productivity system.";

/**
 * `--background` in each theme, as sRGB.
 *
 * A `<meta name="theme-color">` cannot reference a CSS variable, and the
 * manifest cannot either, so these two literals are the only place in the
 * application where a theme colour is written out by hand. They are the
 * computed values of `--background` in `packages/ui/src/styles/globals.css`;
 * change them in the same commit as that file, never on their own.
 */
export const THEME_COLOR = {
  light: "#fdfdfe",
  dark: "#0f1115",
} as const;
