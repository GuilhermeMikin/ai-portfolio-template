import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DemoBanner } from "@/shared/components/DemoBanner";

const labels = {
  label: "About this demo",
  text: "Open-source portfolio demo · Fictional profile",
  cta: "View source on GitHub",
  opensInNewTab: "(opens in a new tab)",
};
const href = "https://github.com/example/portfolio-template";

const render = (isExample: boolean | undefined) =>
  renderToStaticMarkup(createElement(DemoBanner, { isExample, href, labels }));

describe("DemoBanner", () => {
  it("labels the example profile as a demo and links to the source in a new tab", () => {
    const html = render(true);

    expect(html).toMatch(/^<aside aria-label="About this demo"/);
    expect(html).toContain("Open-source portfolio demo · Fictional profile");
    expect(html).toMatch(
      new RegExp(`<a href="${href}" target="_blank" rel="noopener noreferrer"[^>]*>.*View source on GitHub`)
    );
    expect(html).toContain("(opens in a new tab)");
    expect(html).toContain("print:hidden");
  });

  it("renders nothing once the profile is no longer the example", () => {
    expect(render(false)).toBe("");
    expect(render(undefined)).toBe("");
  });
});
