/**
 * Light and dark themes. The colors live in src/app/globals.css: `:root` holds the light
 * tokens and `:root[data-theme="dark"]` the dark ones. Client-safe.
 *
 * The theme is the visitor's saved choice (localStorage) or, without one, the operating
 * system's setting. THEME_INIT_SCRIPT applies it before the first paint, so a dark page
 * never flashes light.
 */
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "site_theme";

/** Browser UI color (`<meta name="theme-color">`) per theme: the header's `--color-surface`. */
export const THEME_COLORS: Record<Theme, string> = {
  light: "#FFFFFF",
  dark: "#181A1D",
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** The saved choice, or null when there is none (or storage is blocked). */
export function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice lasts until the page is reloaded.
  }
}

export function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getCurrentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Switches the page and the browser UI color to `theme`. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = THEME_COLORS[theme];
  }
}

/**
 * Inline script for the document <head>: sets `data-theme` on <html> before anything is
 * painted. Kept tiny and dependency-free; the production CSP allows inline scripts.
 */
export const THEME_INIT_SCRIPT = `(function(){var t;try{t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t})()`;
