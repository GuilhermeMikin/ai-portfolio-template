import { describe, expect, it } from "vitest";

import { size as appleIconSize } from "@/app/apple-icon";
import { size as iconSize } from "@/app/icon";
import manifest from "@/app/manifest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { getFirstName, getProfile } from "@/content";
import { DEFAULT_LOCALE, SITE_URL, SUPPORTED_LOCALES, toLanguageTag } from "@/shared/config/site";
import { SITE_PAGES, getSitePagePath } from "@/shared/config/site-links";
import { BRAND_COLORS } from "@/shared/utils/seo";

describe("sitemap", () => {
  const entries = sitemap();

  it("lists every page in every locale exactly once", () => {
    const expected = SUPPORTED_LOCALES.flatMap((locale) =>
      SITE_PAGES.map((page) => `${SITE_URL}${getSitePagePath(locale, page)}`)
    );

    expect(entries.map((entry) => entry.url).sort()).toEqual([...expected].sort());
  });

  it("gives every entry its hreflang alternates and x-default", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const page of SITE_PAGES) {
        const entry = entries.find((item) => item.url === `${SITE_URL}${getSitePagePath(locale, page)}`);
        const languages = entry?.alternates?.languages as Record<string, string>;

        for (const other of SUPPORTED_LOCALES) {
          expect(languages[toLanguageTag(other)]).toBe(`${SITE_URL}${getSitePagePath(other, page)}`);
        }
        expect(languages["x-default"]).toBe(`${SITE_URL}${getSitePagePath(DEFAULT_LOCALE, page)}`);
        expect(Object.keys(languages)).toHaveLength(SUPPORTED_LOCALES.length + 1);
      }
    }
  });
});

describe("robots", () => {
  it("allows the site, keeps crawlers out of /api/ and points to the sitemap", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ userAgent: "*", allow: "/", disallow: "/api/" });
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe("manifest", () => {
  it("describes the site with the default-locale profile and the generated icons", () => {
    const profile = getProfile(DEFAULT_LOCALE);
    const result = manifest();

    expect(result).toMatchObject({
      name: profile.person.name,
      short_name: getFirstName(profile),
      start_url: `/${DEFAULT_LOCALE}`,
      display: "browser",
      background_color: BRAND_COLORS.canvas,
      theme_color: BRAND_COLORS.surface,
    });
    expect(result.icons).toEqual([
      { src: "/icon", sizes: `${iconSize.width}x${iconSize.height}`, type: "image/png" },
      {
        src: "/apple-icon",
        sizes: `${appleIconSize.width}x${appleIconSize.height}`,
        type: "image/png",
      },
    ]);
  });
});
