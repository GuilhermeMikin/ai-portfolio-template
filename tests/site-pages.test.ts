import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AboutPage, { generateMetadata as aboutMetadata } from "@/app/[locale]/about/page";
import ContactPage, { generateMetadata as contactMetadata } from "@/app/[locale]/contact/page";
import ProjectsPage, { generateMetadata as projectsMetadata } from "@/app/[locale]/projects/page";
import ResumePage, { generateMetadata as resumeMetadata } from "@/app/[locale]/resume/page";
import { formatMessage, getContent, type LocaleContent } from "@/content";
import { Footer } from "@/shared/components/Footer";
import { Header } from "@/shared/components/Header";
import { DEFAULT_LOCALE, type Locale } from "@/shared/config/site";

// Lets a test render with crafted content without touching src/content.
const override = vi.hoisted(() => ({ content: null as LocaleContent | null }));
const navigation = vi.hoisted(() => ({ pathname: "/en" }));

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
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

/** A copy of the bundled content with a fictional owner, changed by `change`. */
function useContent(change: (content: LocaleContent) => void = () => {}) {
  const content = structuredClone(getContent(DEFAULT_LOCALE));
  content.profile.person.name = "Ada Example";
  content.profile.person.shortName = "Ada";
  change(content);
  override.content = content;
  return content;
}

const params = { params: Promise.resolve({ locale: DEFAULT_LOCALE as string }) };

/** React's escaping of text in server-rendered HTML. */
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;");

beforeEach(() => {
  // The contact form only renders with an email provider; keep it out of these tests.
  vi.stubEnv("RESEND_API_KEY", "");
});

afterEach(() => {
  override.content = null;
  navigation.pathname = "/en";
});

describe("page metadata", () => {
  it.each([
    ["about", aboutMetadata],
    ["projects", projectsMetadata],
    ["resume", resumeMetadata],
    ["contact", contactMetadata],
  ] as const)("%s has its own description with the owner's name", async (page, generateMetadata) => {
    const { messages } = useContent();
    const expected = formatMessage(messages.meta.descriptions[page], { name: "Ada Example" });

    const metadata = await generateMetadata(params);

    expect(metadata.title).toBe(messages[page].title);
    expect(metadata.description).toBe(expected);
    expect((metadata.openGraph as { description?: string }).description).toBe(expected);
  });
});

describe("contact page", () => {
  it("points to email in the intro when there is an address", async () => {
    const { messages } = useContent(({ profile }) => {
      profile.contact.email = "ada@example.com";
    });

    const html = renderToStaticMarkup(await ContactPage(params));

    expect(html).toContain(escapeHtml(formatMessage(messages.contact.intro, { firstName: "Ada" })));
  });

  it("uses the no-email intro when the profile has no address", async () => {
    const { messages } = useContent(({ profile }) => {
      delete profile.contact.email;
      profile.contact.social = [{ platform: "github", label: "GitHub", href: "https://github.com/ada-example" }];
    });

    const html = renderToStaticMarkup(await ContactPage(params));

    expect(html).toContain(escapeHtml(formatMessage(messages.contact.introNoEmail, { firstName: "Ada" })));
    expect(html).not.toContain(escapeHtml(formatMessage(messages.contact.intro, { firstName: "Ada" })));
  });
});

describe("resume page", () => {
  it("prints the address of social links, hidden on screen and from screen readers", async () => {
    useContent(({ profile }) => {
      profile.contact.social = [
        { platform: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/in/ada-example/" },
        { platform: "website", label: "ada.example.com", href: "https://ada.example.com" },
      ];
    });

    const html = renderToStaticMarkup(await ResumePage(params));

    expect(html).toContain(
      '<span aria-hidden="true" class="hidden text-muted print:inline"> (linkedin.com/in/ada-example)</span>'
    );
    // A label that already is the address isn't printed twice.
    expect(html).not.toContain("(ada.example.com)");
  });
});

describe("footer", () => {
  const footerClasses = () =>
    renderToStaticMarkup(createElement(Footer, { locale: DEFAULT_LOCALE })).match(
      /<footer[^>]*>\s*<div class="([^"]*)"/
    )?.[1] ?? "";

  it("leaves room below its links for the floating chat launcher when the chat is on", () => {
    useContent();

    for (const mode of ["live", "demo"]) {
      vi.stubEnv("CHAT_MODE", mode);
      expect(footerClasses().split(" "), mode).toContain("pb-24");
    }
  });

  it("keeps the regular padding when the chat is off", () => {
    useContent();
    vi.stubEnv("CHAT_MODE", "off");

    const classes = footerClasses().split(" ");

    expect(classes).toContain("pb-8");
    expect(classes).not.toContain("pb-24");
  });
});

describe("header navigation", () => {
  it("marks the current page with aria-current and an underline, not only a color", () => {
    navigation.pathname = "/en/projects";

    const html = renderToStaticMarkup(
      createElement(Header, {
        locale: DEFAULT_LOCALE,
        ownerName: "Ada Example",
        navItems: [
          { page: "about", label: "About" },
          { page: "projects", label: "Projects" },
        ],
        labels: { nav: "Main", openMenu: "Open menu", closeMenu: "Close menu", language: "Language" },
      })
    );
    const links = [...html.matchAll(/<a [^>]*>/g)].map(([tag]) => tag);
    const current = links.filter((tag) => tag.includes('aria-current="page"'));
    const others = links.filter((tag) => tag.includes('href="/en/about"'));

    // Desktop and mobile navigation.
    expect(current).toHaveLength(2);
    for (const tag of current) {
      expect(tag).toContain('href="/en/projects"');
      expect(tag).toMatch(/\bunderline\b/);
    }
    for (const tag of others) {
      expect(tag).not.toContain("aria-current");
      expect(tag).not.toMatch(/\bunderline\b/);
    }
  });
});

// Smoke-renders the remaining pages with the fixture owner.
describe("about and projects pages", () => {
  it("render with the fixture content", async () => {
    const { messages } = useContent();

    expect(renderToStaticMarkup(await AboutPage(params))).toContain(
      escapeHtml(formatMessage(messages.about.heading, { name: "Ada Example" }))
    );
    expect(renderToStaticMarkup(await ProjectsPage(params))).toContain(escapeHtml(messages.projects.title));
  });
});
