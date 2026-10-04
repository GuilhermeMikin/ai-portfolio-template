import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { viewport } from "@/app/layout";
import { THEME_COLORS } from "@/shared/config/theme";
import { BRAND_COLORS } from "@/shared/utils/seo";

const GLOBALS_CSS = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));

/**
 * `--color-*` tokens of a block in globals.css (the first `:root` block by default: the
 * light theme), as uppercase hex (`#F6F6F7`).
 */
function readRootColorTokens(css: string, selector = /:root\s*\{([^}]*)\}/): Record<string, string> {
  const root = selector.exec(css.replace(/\/\*[\s\S]*?\*\//g, ""))?.[1];
  if (!root) throw new Error(`No ${selector.source} block found in src/app/globals.css`);

  const tokens: Record<string, string> = {};
  for (const [, name, ...channels] of root.matchAll(/--color-([a-z-]+)\s*:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
    tokens[name] = `#${channels.map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  return tokens;
}

/** `onStrong` → `on-strong`. */
const toTokenName = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

describe("BRAND_COLORS", () => {
  const tokens = readRootColorTokens(readFileSync(GLOBALS_CSS, "utf8"));

  it("covers the color tokens used by the generated images", () => {
    expect(Object.keys(BRAND_COLORS).map(toTokenName).sort()).toEqual(
      ["canvas", "ink", "line", "muted", "on-strong", "strong", "surface"].sort()
    );
  });

  it.each(Object.entries(BRAND_COLORS))(
    "%s matches its --color-* token in src/app/globals.css (recolor both together)",
    (key, hex) => {
      const token = toTokenName(key);
      expect(tokens, `--color-${token} is missing from :root in globals.css`).toHaveProperty(token);
      expect(hex.toUpperCase(), `BRAND_COLORS.${key} vs --color-${token}`).toBe(tokens[token]);
    }
  );

  it("drives the browser theme color in both themes (the manifest colors are checked in seo-routes)", () => {
    const darkTokens = readRootColorTokens(
      readFileSync(GLOBALS_CSS, "utf8"),
      /:root\[data-theme="dark"\]\s*\{([^}]*)\}/
    );
    expect(THEME_COLORS.light).toBe(BRAND_COLORS.surface);
    expect(THEME_COLORS.dark.toUpperCase()).toBe(darkTokens.surface);
    expect(viewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
      { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
    ]);
  });
});
