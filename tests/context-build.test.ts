import { afterEach, describe, expect, it, vi } from "vitest";

import { formatPeriod, getMessages } from "@/content";
import {
  buildContextSections,
  buildPortfolioContext,
  measurePortfolioContext,
  selectContextSections,
  type ContextSection,
} from "@/lib/ai/context-build";
import { CHAT_CONTEXT_MAX_CHARS } from "@/lib/ai/types";
import { DEFAULT_LOCALE } from "@/shared/config/site";
import { getSitePagePath } from "@/shared/config/site-links";

import { FIXTURE_PROFILE as profile, MINIMAL_PROFILE, resetProfile, setFixtureProfile } from "./fixtures/profile";

vi.mock("@/content", async (importOriginal) => {
  const { mockContentModule } = await import("./fixtures/profile");
  return mockContentModule(await importOriginal());
});

const locale = DEFAULT_LOCALE;
const messages = getMessages(locale);

afterEach(() => {
  resetProfile();
});

describe("buildPortfolioContext", () => {
  const context = buildPortfolioContext(locale, "What has Robin built?");

  it("includes the profile, every project and the contact details", () => {
    expect(context.contextText).toContain(profile.person.name);
    for (const project of profile.projects) {
      expect(context.contextText).toContain(project.title);
    }
    for (const role of profile.experience) {
      expect(context.contextText).toContain(role.organization);
      expect(context.contextText).toContain(formatPeriod(role.period, locale, messages.common));
    }
    expect(context.contextText).toContain(profile.contact.email);
    expect(context.contextText).toContain(getSitePagePath(locale, "contact"));
  });

  it("marks first-person text as the owner's words", () => {
    expect(context.contextText).toContain(`"I" and "my" refer to ${profile.person.name}`);
  });

  it("keeps the FAQ in its own block", () => {
    for (const entry of profile.assistant.faq ?? []) {
      expect(context.faqText).toContain(entry.question);
      expect(context.faqText).toContain(entry.answer);
      expect(context.contextText).not.toContain(entry.question);
    }
  });

  it("fits the default budget without omitting anything", () => {
    expect(context.omittedSections).toEqual([]);
    expect(context.contextLength).toBeLessThanOrEqual(CHAT_CONTEXT_MAX_CHARS);
  });

  it("orders the sections and labels them from the message files", () => {
    expect(buildContextSections(locale).map((section) => section.id)).toEqual([
      "profile",
      "focus",
      "skills",
      "experience",
      "projects",
      "education",
      "certifications",
      "languages",
      "interests",
      "contact",
      "resume",
      "faq",
    ]);
    const projects = buildContextSections(locale).find((section) => section.id === "projects");
    expect(projects).toMatchObject({ label: messages.projects.title, href: getSitePagePath(locale, "projects") });
  });

  it("skips the sections a profile leaves empty", () => {
    setFixtureProfile(MINIMAL_PROFILE);
    expect(buildContextSections(locale).map((section) => section.id)).toEqual([
      "profile",
      "skills",
      "contact",
      "resume",
    ]);
    expect(buildPortfolioContext(locale, "Hi").faqText).toBe("");
  });
});

describe("measurePortfolioContext", () => {
  it("reports the size of the full context", () => {
    const measurement = measurePortfolioContext(locale);
    expect(measurement.maxLength).toBe(CHAT_CONTEXT_MAX_CHARS);
    expect(measurement.length).toBeGreaterThan(buildContextSections(locale)[0].content.length);
    expect(measurement.omittedSections).toEqual([]);
  });

  it("lists the sections that would be omitted under a small cap", () => {
    const sections = buildContextSections(locale);
    const full = measurePortfolioContext(locale);
    // Room for the first section only: every other one needs a separator on top.
    const cap = sections[0].content.length;
    const tiny = measurePortfolioContext(locale, cap);

    expect(tiny.maxLength).toBe(cap);
    expect(tiny.length).toBe(full.length);
    expect(tiny.omittedSections).toEqual(sections.slice(1).map((section) => section.id));
  });
});

describe("selectContextSections", () => {
  const section = (id: ContextSection["id"], size: number): ContextSection => ({
    id,
    label: id,
    href: "/",
    content: "x".repeat(size),
    items: [],
  });

  it("skips a section that does not fit but keeps smaller ones after it", () => {
    const result = selectContextSections([section("profile", 50), section("projects", 100), section("faq", 20)], 80);
    expect(result.included.map((entry) => entry.id)).toEqual(["profile", "faq"]);
    expect(result.omitted).toEqual(["projects"]);
    expect(result.length).toBe(72);
  });
});

describe("related pages", () => {
  it("points a skills question at the skills section", () => {
    const { sources } = buildPortfolioContext(locale, "Which technologies does Robin use most?");
    expect(sources[0]).toEqual({
      section: "skills",
      label: messages.about.skillsTitle,
      href: getSitePagePath(locale, "about"),
      locale,
    });
  });

  it("returns at most three distinct pages and never the profile or FAQ", () => {
    for (const question of [
      "What has Robin built with Kafka?",
      "Is Robin available for new work?",
      "Tell me about Robin's education, experience, projects, skills and contact details",
    ]) {
      const { sources } = buildPortfolioContext(locale, question);
      expect(sources.length).toBeLessThanOrEqual(3);
      expect(new Set(sources.map((source) => source.href)).size).toBe(sources.length);
      expect(sources.map((source) => source.section)).not.toContain("profile");
      expect(sources.map((source) => source.section)).not.toContain("faq");
    }
  });

  it("returns nothing for a message without content words", () => {
    expect(buildPortfolioContext(locale, "Hello!").sources).toEqual([]);
  });
});
