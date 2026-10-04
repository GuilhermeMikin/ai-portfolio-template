import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "@/shared/components/Header/ThemeToggle";
import {
  THEME_COLORS,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  isTheme,
  readStoredTheme,
} from "@/shared/config/theme";

/** Just enough of a browser for the theme helpers: storage, matchMedia, <html> and metas. */
function fakeBrowser({
  stored = null,
  systemDark = false,
  storageThrows = false,
}: {
  stored?: string | null;
  systemDark?: boolean;
  storageThrows?: boolean;
}) {
  const documentElement = { dataset: {} as Record<string, string> };
  const metas = [{ content: "" }, { content: "" }];
  const storage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error("storage blocked");
      return key === THEME_STORAGE_KEY ? stored : null;
    },
  };
  const matchMedia = (query: string) => ({ matches: query === "(prefers-color-scheme: dark)" && systemDark });

  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, matchMedia });
  vi.stubGlobal("document", { documentElement, querySelectorAll: () => metas });
  return { documentElement, metas };
}

/** Runs the inline <head> script the way the browser does, in the global scope. */
const runInitScript = () => new Function(THEME_INIT_SCRIPT)();

describe("THEME_INIT_SCRIPT", () => {
  it("applies the saved choice, whatever the system setting", () => {
    const dark = fakeBrowser({ stored: "dark", systemDark: false });
    runInitScript();
    expect(dark.documentElement.dataset.theme).toBe("dark");

    const light = fakeBrowser({ stored: "light", systemDark: true });
    runInitScript();
    expect(light.documentElement.dataset.theme).toBe("light");
  });

  it("follows the system setting without a valid saved choice", () => {
    const none = fakeBrowser({ systemDark: true });
    runInitScript();
    expect(none.documentElement.dataset.theme).toBe("dark");

    const invalid = fakeBrowser({ stored: "sepia", systemDark: false });
    runInitScript();
    expect(invalid.documentElement.dataset.theme).toBe("light");
  });

  it("still sets a theme when storage is blocked", () => {
    const blocked = fakeBrowser({ storageThrows: true, systemDark: true });
    runInitScript();
    expect(blocked.documentElement.dataset.theme).toBe("dark");
  });
});

describe("theme helpers", () => {
  it("accept only the two themes", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });

  it("read a saved choice and ignore anything else", () => {
    fakeBrowser({ stored: "dark" });
    expect(readStoredTheme()).toBe("dark");
    fakeBrowser({ stored: "sepia" });
    expect(readStoredTheme()).toBeNull();
    fakeBrowser({ storageThrows: true });
    expect(readStoredTheme()).toBeNull();
  });

  it("switch the page and every theme-color meta", () => {
    const { documentElement, metas } = fakeBrowser({});
    applyTheme("dark");
    expect(documentElement.dataset.theme).toBe("dark");
    expect(metas.map((meta) => meta.content)).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);
  });
});

describe("ThemeToggle", () => {
  const html = renderToStaticMarkup(
    createElement(ThemeToggle, { labels: { toDark: "Switch to dark theme", toLight: "Switch to light theme" } })
  );

  it("is a plain button labelled for both themes, switched by CSS rather than state", () => {
    expect(html).toMatch(/^<button type="button"/);
    expect(html).toContain('<span class="sr-only dark:hidden">Switch to dark theme</span>');
    expect(html).toContain('<span class="sr-only hidden dark:inline">Switch to light theme</span>');
    // Moon for the light theme, sun for the dark one; both decorative.
    expect(html.match(/<svg[^>]*aria-hidden="true"/g)).toHaveLength(2);
    expect(html).toContain("lucide-moon");
    expect(html).toContain("lucide-sun");
  });
});
