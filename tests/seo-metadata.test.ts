import type { Metadata } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatMessage, getContent, getProfileMessageValues, type LocaleContent } from "@/content";
import {
  DEFAULT_LOCALE,
  SITE_URL,
  SUPPORTED_LOCALES,
  toLanguageTag,
  toOpenGraphLocale,
  type Locale,
} from "@/shared/config/site";
import { SITE_PAGES, getSitePagePath } from "@/shared/config/site-links";
import { buildPageMetadata, buildRootMetadata, getMonogram } from "@/shared/utils/seo";

// Lets a test swap the content (e.g. a non-example profile) without touching src/content.
const override = vi.hoisted(() => ({ content: null as LocaleContent | null }));

vi.mock("@/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/content")>();
  const getContent = (locale: Locale) => override.content ?? actual.getContent(locale);
  return {
    ...actual,
    getContent,
    getProfile: (locale: Locale) => getContent(locale).profile,
    getMessages: (locale: Locale) => getContent(locale).messages,
  };
});

afterEach(() => {
  override.content = null;
});

function useContent(change: (content: LocaleContent) => void) {
  const content = structuredClone(getContent(DEFAULT_LOCALE));
  change(content);
  override.content = content;
}

const pageUrl = (locale: Locale, page: (typeof SITE_PAGES)[number]) =>
  `${SITE_URL}${getSitePagePath(locale, page)}`;

/** Next.js merges metadata key by key, so an explicit `undefined` would erase inherited values. */
function findUndefinedPaths(value: unknown, path = "metadata"): string[] {
  if (value === undefined) return [path];
  if (value === null || typeof value !== "object" || value instanceof URL) return [];
  return Object.entries(value).flatMap(([key, child]) => findUndefinedPaths(child, `${path}.${key}`));
}

function languagesOf(metadata: Metadata) {
  return metadata.alternates?.languages as Record<string, string>;
}

function openGraphOf(metadata: Metadata) {
  return metadata.openGraph as {
    type?: string;
    url?: string;
    title?: string;
    description?: string;
    siteName?: string;
    locale?: string;
    alternateLocale?: string[];
    images?: { url: string; width: number; height: number; alt: string }[];
  };
}

function twitterOf(metadata: Metadata) {
  return metadata.twitter as {
    card?: string;
    title?: string;
    description?: string;
    images?: { url: string }[];
  };
}

describe("buildRootMetadata", () => {
  it("uses '<name> — <headline>' as the default title and builds the template from messages", () => {
    useContent(({ profile, messages }) => {
      profile.person.name = "Ada Example";
      profile.person.headline = "Systems engineer";
      delete profile.seo;
      messages.meta.pageTitle = "{page} · {name}";
    });

    const metadata = buildRootMetadata(DEFAULT_LOCALE);

    expect(metadata.title).toEqual({
      default: "Ada Example — Systems engineer",
      template: "%s · Ada Example",
    });
    expect(metadata.metadataBase?.toString()).toBe(new URL(SITE_URL).toString());
  });

  it("prefers seo.title and seo.description when they are set", () => {
    useContent(({ profile }) => {
      profile.seo = { title: "Ada Example | Portfolio", description: "Custom description." };
    });

    const metadata = buildRootMetadata(DEFAULT_LOCALE);

    expect((metadata.title as { default: string }).default).toBe("Ada Example | Portfolio");
    expect(metadata.description).toBe("Custom description.");
  });

  it("falls back to person.summary for the description and omits empty keywords", () => {
    useContent(({ profile }) => {
      profile.seo = { keywords: [] };
    });

    const metadata = buildRootMetadata(DEFAULT_LOCALE);

    expect(metadata.description).toBe(getContent(DEFAULT_LOCALE).profile.person.summary);
    expect("keywords" in metadata).toBe(false);
  });

  it("derives title and template from the bundled content for every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const { profile, messages } = getContent(locale);
      const metadata = buildRootMetadata(locale);
      const template = formatMessage(messages.meta.pageTitle, {
        ...getProfileMessageValues(profile),
        page: "%s",
      });

      expect(template).toContain("%s");
      expect(metadata.title).toEqual({
        default: profile.seo?.title?.trim() || `${profile.person.name} — ${profile.person.headline}`,
        template,
      });
      expect(metadata.description).toBe(profile.seo?.description?.trim() || profile.person.summary);
    }
  });

  it("asks search engines not to index the example profile", () => {
    useContent(({ profile }) => {
      profile.isExample = true;
    });

    expect(buildRootMetadata(DEFAULT_LOCALE).robots).toEqual({ index: false, follow: false });
  });

  it("allows indexing once isExample is turned off", () => {
    useContent(({ profile }) => {
      profile.isExample = false;
    });

    expect(buildRootMetadata(DEFAULT_LOCALE).robots).toEqual({ index: true, follow: true });
  });

  it("sets the canonical URL, hreflang alternates and x-default of the home page", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const metadata = buildRootMetadata(locale);
      const languages = languagesOf(metadata);

      expect(metadata.alternates?.canonical).toBe(pageUrl(locale, ""));
      for (const other of SUPPORTED_LOCALES) {
        expect(languages[toLanguageTag(other)]).toBe(pageUrl(other, ""));
      }
      expect(languages["x-default"]).toBe(pageUrl(DEFAULT_LOCALE, ""));
      expect(Object.keys(languages)).toHaveLength(SUPPORTED_LOCALES.length + 1);
    }
  });

  it("describes the site for social cards with the locale's Open Graph tag", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const { profile } = getContent(locale);
      const metadata = buildRootMetadata(locale);
      const openGraph = openGraphOf(metadata);
      const otherLocales = SUPPORTED_LOCALES.filter((other) => other !== locale).map(toOpenGraphLocale);

      expect(openGraph.type).toBe("website");
      expect(openGraph.siteName).toBe(profile.person.name);
      expect(openGraph.locale).toBe(toOpenGraphLocale(locale));
      expect(openGraph.alternateLocale ?? []).toEqual(otherLocales);
      expect(openGraph.url).toBe(pageUrl(locale, ""));
      expect(openGraph.images).toEqual([
        {
          url: `${pageUrl(locale, "")}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `${profile.person.name} — ${profile.person.headline}`,
          type: "image/png",
        },
      ]);
      expect(twitterOf(metadata).card).toBe("summary_large_image");
      expect(twitterOf(metadata).images?.[0]?.url).toBe(openGraph.images?.[0]?.url);
      expect(findUndefinedPaths(metadata)).toEqual([]);
    }
  });
});

describe("buildPageMetadata", () => {
  it("sets canonical, hreflang and Open Graph URLs for every page in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const page of SITE_PAGES) {
        const metadata = buildPageMetadata({ locale, page, title: page ? "Page" : undefined });
        const languages = languagesOf(metadata);

        expect(metadata.alternates?.canonical).toBe(pageUrl(locale, page));
        expect(openGraphOf(metadata).url).toBe(pageUrl(locale, page));
        for (const other of SUPPORTED_LOCALES) {
          expect(languages[toLanguageTag(other)]).toBe(pageUrl(other, page));
        }
        expect(languages["x-default"]).toBe(pageUrl(DEFAULT_LOCALE, page));
        expect(findUndefinedPaths(metadata)).toEqual([]);
      }
    }
  });

  it("keeps the plain page name as title and puts the full title on social cards", () => {
    useContent(({ profile, messages }) => {
      profile.person.name = "Ada Example";
      messages.meta.pageTitle = "{page} · {name}";
    });

    const metadata = buildPageMetadata({ locale: DEFAULT_LOCALE, page: "about", title: "About" });

    expect(metadata.title).toBe("About");
    expect(openGraphOf(metadata).title).toBe("About · Ada Example");
    expect(twitterOf(metadata).title).toBe("About · Ada Example");
  });

  it("uses the site description when the page has none", () => {
    const { profile } = getContent(DEFAULT_LOCALE);
    const expected = profile.seo?.description?.trim() || profile.person.summary;

    const metadata = buildPageMetadata({ locale: DEFAULT_LOCALE, page: "projects", title: "Projects" });

    expect(metadata.description).toBe(expected);
    expect(openGraphOf(metadata).description).toBe(expected);
    expect(twitterOf(metadata).description).toBe(expected);
  });

  it("uses the page description when given", () => {
    const metadata = buildPageMetadata({
      locale: DEFAULT_LOCALE,
      page: "contact",
      title: "Contact",
      description: "How to get in touch.",
    });

    expect(metadata.description).toBe("How to get in touch.");
    expect(openGraphOf(metadata).description).toBe("How to get in touch.");
    expect(twitterOf(metadata).description).toBe("How to get in touch.");
  });

  it("leaves the title to the layout on the home page", () => {
    const { profile } = getContent(DEFAULT_LOCALE);
    const metadata = buildPageMetadata({ locale: DEFAULT_LOCALE, page: "" });

    expect("title" in metadata).toBe(false);
    expect(openGraphOf(metadata).title).toBe(
      profile.seo?.title?.trim() || `${profile.person.name} — ${profile.person.headline}`
    );
  });

  it("repeats the Open Graph basics, because a page's openGraph replaces the layout's", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const openGraph = openGraphOf(buildPageMetadata({ locale, page: "resume", title: "Resume" }));

      expect(openGraph.type).toBe("website");
      expect(openGraph.siteName).toBe(getContent(locale).profile.person.name);
      expect(openGraph.locale).toBe(toOpenGraphLocale(locale));
      expect(openGraph.images?.[0]?.url).toBe(`${pageUrl(locale, "")}/opengraph-image`);
    }
  });
});

describe("getMonogram", () => {
  it.each([
    ["Jordan Rivera", "JR"],
    ["Madonna", "M"],
    ["  ana   maria  de  souza ", "AS"],
    ["Maria Fernanda de Albuquerque Cavalcanti Rodrigues", "MR"],
    ["Jean-Luc Picard", "JP"],
    ["Zoë Ångström-Øberg", "ZÅ"],
    ["(Sam) O'Neil", "SO"],
    ["Ada 🚀", "A"],
    ["李小龙", "李"],
    ["ßeta Gamma", "SG"],
    ["", ""],
  ])("%j → %j", (name, expected) => {
    expect(getMonogram(name)).toBe(expected);
  });
});
