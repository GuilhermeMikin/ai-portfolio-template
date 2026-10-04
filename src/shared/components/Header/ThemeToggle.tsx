"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";

import {
  applyTheme,
  getCurrentTheme,
  getSystemTheme,
  readStoredTheme,
  storeTheme,
} from "@/shared/config/theme";

export type ThemeToggleLabels = { toDark: string; toLight: string };

/**
 * Switches between the light and dark themes and remembers the choice. Until the visitor
 * picks one, the site follows the system setting, live.
 *
 * The theme is only known in the browser (THEME_INIT_SCRIPT sets it before hydration), so
 * the icon and the label switch with CSS (`dark:`) instead of state: the server HTML and
 * the first client render stay identical.
 */
export function ThemeToggle({ labels }: { labels: ThemeToggleLabels }) {
  useEffect(() => {
    // The theme-color metas are rendered for the system setting; match the actual theme.
    applyTheme(getCurrentTheme());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = () => {
      if (!readStoredTheme()) applyTheme(getSystemTheme());
    };
    media.addEventListener("change", followSystem);
    return () => media.removeEventListener("change", followSystem);
  }, []);

  const toggleTheme = () => {
    const next = getCurrentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    storeTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-subtle hover:text-ink"
    >
      <Moon aria-hidden className="h-4 w-4 dark:hidden" />
      <Sun aria-hidden className="hidden h-4 w-4 dark:block" />
      <span className="sr-only dark:hidden">{labels.toDark}</span>
      <span className="sr-only hidden dark:inline">{labels.toLight}</span>
    </button>
  );
}
