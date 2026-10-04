import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FloatingLinks } from "@/shared/components/FloatingLinks";

const labels = { list: "Social links", backToTop: "Back to top", opensInNewTab: "(opens in a new tab)" };

const render = (links: Parameters<typeof FloatingLinks>[0]["links"]) =>
  renderToStaticMarkup(createElement(FloatingLinks, { links, labels }));

describe("FloatingLinks", () => {
  it("renders the owner's links as a labelled list, with external links opening in a new tab", () => {
    const html = render([
      { href: "https://github.com", label: "GitHub", platform: "github" },
      { href: "mailto:alex@alex.test", label: "Email", platform: "email" },
    ]);

    expect(html).toContain('aria-label="Social links"');
    expect(html).toContain('href="https://github.com" title="GitHub"');
    expect(html).toMatch(/href="https:\/\/github\.com"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    expect(html).toContain("GitHub (opens in a new tab)");
    expect(html).toContain('href="mailto:alex@alex.test"');
    expect(html).not.toMatch(/href="mailto:[^"]*"[^>]*target="_blank"/);
  });

  it("starts without the back-to-top button and renders nothing without links", () => {
    expect(render([{ href: "https://github.com", label: "GitHub", platform: "github" }])).not.toContain("Back to top");
    expect(render([])).toBe("");
  });
});
