import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getContent, type LocaleContent, type Profile } from "@/content";
import { StructuredData } from "@/shared/components/StructuredData";
import { buildStructuredData, serializeJsonLd } from "@/shared/components/StructuredData/json-ld";
import {
  DEFAULT_LOCALE,
  SITE_URL,
  SUPPORTED_LOCALES,
  toLanguageTag,
  type Locale,
} from "@/shared/config/site";

// Lets a test render the component with crafted content without touching src/content.
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

type Node = Record<string, unknown>;

function cloneProfile(change: (profile: Profile) => void = () => {}) {
  const profile = structuredClone(getContent(DEFAULT_LOCALE).profile);
  change(profile);
  return profile;
}

function graphOf(profile: Profile, locale: Locale = DEFAULT_LOCALE) {
  const data = buildStructuredData(locale, profile);
  const graph = data["@graph"] as Node[];
  return {
    data,
    person: graph.find((node) => node["@type"] === "Person") as Node,
    website: graph.find((node) => node["@type"] === "WebSite") as Node,
  };
}

const HOSTILE = '</script><script>alert("x")</script><!-- <b>';

describe("buildStructuredData", () => {
  it("describes the owner as a Person from the profile", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const profile = getContent(locale).profile;
      const { data, person } = graphOf(profile, locale);

      expect(data["@context"]).toBe("https://schema.org");
      expect(person).toMatchObject({
        name: profile.person.name,
        jobTitle: profile.person.headline,
        description: profile.person.summary,
        url: `${SITE_URL}/${locale}`,
      });
    }
  });

  it("describes the WebSite with every language and links it to the Person", () => {
    const profile = getContent(DEFAULT_LOCALE).profile;
    const { person, website } = graphOf(profile);

    expect(website).toMatchObject({
      name: profile.person.name,
      url: `${SITE_URL}/`,
      description: profile.seo?.description?.trim() || profile.person.summary,
      inLanguage: SUPPORTED_LOCALES.map(toLanguageTag),
      author: { "@id": person["@id"] },
    });
  });

  it("lists only https social links in sameAs", () => {
    const { person } = graphOf(
      cloneProfile((profile) => {
        profile.contact.social = [
          { platform: "github", label: "GitHub", href: "https://example.com/code" },
          { platform: "website", label: "Old site", href: "http://example.com/old" },
          { platform: "other", label: "Mail", href: "mailto:hello@example.com" },
        ];
      })
    );

    expect(person.sameAs).toEqual(["https://example.com/code"]);
  });

  it("omits sameAs, image and knowsAbout when there is nothing to list", () => {
    const { person } = graphOf(
      cloneProfile((profile) => {
        profile.contact.social = [];
        profile.skills = [];
        delete profile.person.photo;
      })
    );

    expect(person).not.toHaveProperty("sameAs");
    expect(person).not.toHaveProperty("knowsAbout");
    expect(person).not.toHaveProperty("image");
  });

  it("adds the photo as an absolute URL", () => {
    const local = graphOf(
      cloneProfile((profile) => {
        profile.person.photo = { src: "/images/portrait.jpg", alt: "Portrait" };
      })
    );
    const remote = graphOf(
      cloneProfile((profile) => {
        profile.person.photo = { src: "https://example.com/portrait.jpg", alt: "Portrait" };
      })
    );

    expect(local.person.image).toBe(`${SITE_URL}/images/portrait.jpg`);
    expect(remote.person.image).toBe("https://example.com/portrait.jpg");
  });

  it("lists at most 20 distinct skills in knowsAbout", () => {
    const { person } = graphOf(
      cloneProfile((profile) => {
        profile.skills = [
          { group: "A", items: Array.from({ length: 15 }, (_, index) => `Skill ${index}`) },
          { group: "B", items: ["Skill 0", ...Array.from({ length: 15 }, (_, index) => `Tool ${index}`)] },
        ];
      })
    );
    const knowsAbout = person.knowsAbout as string[];

    expect(knowsAbout).toHaveLength(20);
    expect(new Set(knowsAbout).size).toBe(20);
    expect(knowsAbout.slice(0, 2)).toEqual(["Skill 0", "Skill 1"]);
  });

  it("sets worksFor only when exactly one role is ongoing", () => {
    // One role per argument: an end date, or undefined for an ongoing role.
    const withRoles = (...ends: (string | undefined)[]) =>
      cloneProfile((profile) => {
        profile.experience = ends.map((end, index) => ({
          id: `role-${index}`,
          role: "Engineer",
          organization: `Org ${index}`,
          organizationUrl: `https://example.com/org-${index}`,
          period: end ? { start: "2018-01", end } : { start: "2020-01" },
          highlights: ["Built things."],
        }));
      });

    expect(graphOf(withRoles(undefined, "2019-12")).person.worksFor).toEqual({
      "@type": "Organization",
      name: "Org 0",
      url: "https://example.com/org-0",
    });
    expect(graphOf(withRoles(undefined, undefined)).person).not.toHaveProperty("worksFor");
    expect(graphOf(withRoles("2021-01")).person).not.toHaveProperty("worksFor");
  });
});

describe("serializeJsonLd", () => {
  it("escapes every '<' so the content cannot close the script tag", () => {
    const profile = cloneProfile((profile) => {
      profile.person.name = HOSTILE;
      profile.person.summary = HOSTILE;
      profile.skills = [{ group: "x", items: [HOSTILE] }];
    });
    const data = buildStructuredData(DEFAULT_LOCALE, profile);
    const json = serializeJsonLd(data);

    expect(json).not.toContain("<");
    expect(json.toLowerCase()).not.toContain("</script");
    expect(json).toContain("\\u003c/script>");
    expect(JSON.parse(json)).toEqual(data);
  });
});

describe("StructuredData", () => {
  it("renders one JSON-LD script with the graph", () => {
    const html = renderToStaticMarkup(createElement(StructuredData, { locale: DEFAULT_LOCALE }));
    const match = html.match(/^<script type="application\/ld\+json">([\s\S]*)<\/script>$/);

    expect(match).not.toBeNull();
    expect(JSON.parse(match![1])).toEqual(buildStructuredData(DEFAULT_LOCALE));
  });

  it("keeps hostile content inside the script element", () => {
    const content = structuredClone(getContent(DEFAULT_LOCALE));
    content.profile.person.name = HOSTILE;
    content.profile.person.headline = HOSTILE;
    override.content = content;

    const html = renderToStaticMarkup(createElement(StructuredData, { locale: DEFAULT_LOCALE }));

    expect(html).toContain("\\u003c/script>"); // the hostile name is there, escaped
    expect(html.match(/<\/script/gi)).toHaveLength(1);
    expect(html.match(/<script/gi)).toHaveLength(1);
    expect(html).not.toContain("<!--");
    expect(html.endsWith("</script>")).toBe(true);
  });
});
