import { afterEach, describe, expect, it, vi } from "vitest";

import { formatMessage, getContent, getProfileMessageValues } from "@/content";
import { buildPortfolioContext } from "@/lib/ai/context-build";
import { buildDemoReply } from "@/lib/ai/demo";
import { classifyIntent } from "@/lib/ai/intents";
import { DEFAULT_LOCALE } from "@/shared/config/site";
import { getSitePagePath } from "@/shared/config/site-links";

import { FIXTURE_PROFILE, MINIMAL_PROFILE, resetProfile, setFixtureProfile } from "./fixtures/profile";

vi.mock("@/content", async (importOriginal) => {
  const { mockContentModule } = await import("./fixtures/profile");
  return mockContentModule(await importOriginal());
});

const locale = DEFAULT_LOCALE;
const { messages } = getContent(locale);
const replies = messages.chat.replies;

afterEach(() => {
  resetProfile();
});

function demo(question: string, markdownEnabled?: boolean) {
  return buildDemoReply({
    locale,
    question,
    intent: classifyIntent(question),
    sections: buildPortfolioContext(locale, question).sections,
    markdownEnabled,
  });
}

function notice() {
  return formatMessage(replies.demoIntro, getProfileMessageValues(getContent(locale).profile));
}

describe("buildDemoReply", () => {
  it("answers every suggested question with labeled excerpts", () => {
    for (const question of FIXTURE_PROFILE.assistant.suggestedQuestions) {
      const reply = demo(question);
      expect(reply.startsWith(`*${notice()}*\n\n`), question).toBe(true);
      expect(reply).not.toContain(replies.demoNoMatch);
      const bullets = reply.split("\n").filter((line) => line.startsWith("- "));
      expect(bullets.length).toBeGreaterThanOrEqual(1);
      expect(bullets.length).toBeLessThanOrEqual(2);
    }
  });

  it("links excerpts to their pages", () => {
    const project = FIXTURE_PROFILE.projects[0];
    const reply = demo(`What is ${project.title}?`);
    expect(reply).toContain(`**${project.title}**`);
    expect(reply).toContain(`([${messages.projects.title}](${getSitePagePath(locale, "projects")}))`);
  });

  it("writes plain text without Markdown when CHAT_MARKDOWN_ENABLED is false", () => {
    const project = FIXTURE_PROFILE.projects[0];
    const reply = demo(`What is ${project.title}?`, false);

    expect(reply.startsWith(`${notice()}\n\n`)).toBe(true);
    expect(reply).toContain(`- ${project.title}: `);
    expect(reply).toContain(`(${messages.projects.title}: ${getSitePagePath(locale, "projects")})`);
    expect(reply).not.toMatch(/\*|\]\(|`/);
    expect(demo("Hi!", false)).not.toContain("*");
  });

  it("says when nothing matches", () => {
    expect(demo("Does Robin know Haskell?")).toBe(`*${notice()}*\n\n${replies.demoNoMatch}`);
  });

  it("answers small talk with the fallback line", () => {
    const values = getProfileMessageValues(FIXTURE_PROFILE);
    expect(demo("Hi!")).toBe(`*${notice()}*\n\n${formatMessage(replies.smallTalkFallback, values)}`);
  });

  it("works with a profile that has only the required fields", () => {
    setFixtureProfile(MINIMAL_PROFILE);
    const reply = demo("Which tools does Kai use?");
    expect(reply).toContain(MINIMAL_PROFILE.skills[0].items[0]);
    expect(reply).toContain(`(${getSitePagePath(locale, "about")})`);
  });
});
