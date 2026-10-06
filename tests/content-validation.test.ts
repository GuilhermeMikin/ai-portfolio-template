import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contentByLocale, type Profile } from "@/content";
import {
  CONTENT_LIMITS,
  validateExampleFlags,
  validateMessages,
  validateProfile,
  type ContentIssue,
} from "@/content/schema";
import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/ai/types";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/shared/config/site";

type ValidateOptions = Parameters<typeof validateProfile>[1];

const isError = (issue: ContentIssue) => issue.level === "error";

const pathsAt = (level: ContentIssue["level"], profile: Profile, options?: ValidateOptions) =>
  validateProfile(profile, options)
    .filter((issue) => issue.level === level)
    .map((issue) => issue.path);
const errorPaths = (profile: Profile, options?: ValidateOptions) => pathsAt("error", profile, options);
const warningPaths = (profile: Profile, options?: ValidateOptions) =>
  pathsAt("warning", profile, options);

const publicFileExists = (sitePath: string) =>
  fs.existsSync(path.join(process.cwd(), "public", decodeURIComponent(sitePath.split(/[?#]/)[0])));

/** A small, valid profile. Each test breaks one thing. */
function makeProfile(): Profile {
  return {
    person: {
      name: "Alex Example",
      headline: "Software engineer",
      summary: "Builds reliable web applications for small teams.",
    },
    about: { bio: ["Alex builds web applications for small teams."] },
    skills: [{ group: "Languages", items: ["TypeScript", "Python"] }],
    experience: [
      {
        id: "example-co",
        role: "Software Engineer",
        organization: "Example Co",
        period: { start: "2021-04" },
        highlights: ["Shipped an online booking system."],
      },
    ],
    projects: [
      {
        id: "booking-system",
        title: "Booking system",
        summary: "Online booking for small clinics.",
        featured: true,
        links: [{ label: "Case study", href: "https://alex.test/booking" }],
      },
    ],
    contact: { email: "alex@alex.test", social: [] },
    assistant: {
      name: "Alex's AI assistant",
      suggestedQuestions: ["What has Alex built?"],
    },
  };
}

describe("bundled content", () => {
  it.each(SUPPORTED_LOCALES)("the %s profile has no validation errors", (locale) => {
    const content = contentByLocale[locale];
    expect(content).toBeDefined();

    const issues = validateProfile(content.profile, {
      assetExists: publicFileExists,
      maxMessageLength: CHAT_MESSAGE_MAX_LENGTH,
    });
    expect(issues.filter(isError)).toEqual([]);
  });

  it("every translation has the default locale's keys, types and placeholders", () => {
    const base = contentByLocale[DEFAULT_LOCALE].messages;
    const errors = Object.entries(contentByLocale)
      .filter(([locale]) => locale !== DEFAULT_LOCALE)
      .flatMap(([locale, content]) => validateMessages(base, content.messages, locale))
      .filter(isError);
    expect(errors).toEqual([]);
  });
});

describe("validateProfile", () => {
  it("accepts a valid profile without issues", () => {
    expect(validateProfile(makeProfile())).toEqual([]);
  });

  it("requires the person's name", () => {
    const profile = makeProfile();
    profile.person.name = "  ";
    expect(errorPaths(profile)).toEqual(["person.name"]);
  });

  it("rejects javascript: URLs", () => {
    const profile = makeProfile();
    profile.projects[0].links = [{ label: "Demo", href: "javascript:alert(1)" }];
    profile.contact.social = [{ platform: "website", label: "Site", href: "JavaScript:alert(1)" }];
    expect(errorPaths(profile)).toEqual(["projects[0].links[0].href", "contact.social[0].href"]);
  });

  it("rejects protocol-relative URLs", () => {
    const profile = makeProfile();
    profile.person.photo = { src: "//cdn.alex.test/alex.jpg", alt: "Portrait of Alex" };
    profile.projects[0].links = [{ label: "Demo", href: "//demo.alex.test/booking" }];
    expect(errorPaths(profile)).toEqual(["person.photo.src", "projects[0].links[0].href"]);
  });

  it("rejects duplicate ids", () => {
    const profile = makeProfile();
    profile.projects.push({ ...profile.projects[0], title: "Booking system, version 2" });
    expect(validateProfile(profile)).toEqual([
      { level: "error", path: "projects[1].id", message: 'duplicates "booking-system"' },
    ]);
  });

  it(`allows at most ${CONTENT_LIMITS.suggestedQuestionsMax} suggested questions`, () => {
    const profile = makeProfile();
    profile.assistant.suggestedQuestions = ["One?", "Two?", "Three?", "Four?"];
    expect(errorPaths(profile)).toEqual(["assistant.suggestedQuestions"]);
  });

  it("rejects a suggested question longer than the chat message limit", () => {
    const profile = makeProfile();
    profile.assistant.suggestedQuestions = [`${"a".repeat(40)}?`];
    expect(validateProfile(profile, { maxMessageLength: 40 })).toEqual([
      {
        level: "error",
        path: "assistant.suggestedQuestions[0]",
        message: "must be at most 40 characters",
      },
    ]);
    expect(errorPaths(profile, { maxMessageLength: 41 })).toEqual([]);

    // The content limit still applies when the chat limit is larger.
    profile.assistant.suggestedQuestions = ["a".repeat(CONTENT_LIMITS.suggestedQuestionMaxChars + 1)];
    expect(errorPaths(profile, { maxMessageLength: 10_000 })).toEqual(["assistant.suggestedQuestions[0]"]);
  });

  it("rejects an invalid month", () => {
    const profile = makeProfile();
    profile.experience[0].period = { start: "2024-13" };
    profile.projects[0].period = { start: "2024-01", end: "2024-00" };
    expect(errorPaths(profile)).toEqual(["experience[0].period.start", "projects[0].period.end"]);
  });

  it("rejects a period that ends before it starts", () => {
    const profile = makeProfile();
    profile.experience[0].period = { start: "2024-05", end: "2023-12" };
    expect(validateProfile(profile)).toEqual([
      { level: "error", path: "experience[0].period.end", message: "is earlier than the start" },
    ]);
  });

  it("treats a year-only end as covering the whole year", () => {
    const profile = makeProfile();
    profile.experience[0].period = { start: "2024-03", end: "2024" };
    expect(validateProfile(profile)).toEqual([]);

    profile.experience[0].period = { start: "2024-03", end: "2023" };
    expect(validateProfile(profile).map((issue) => issue.path)).toEqual(["experience[0].period.end"]);
  });

  it("requires an email address or at least one social link", () => {
    const profile = makeProfile();
    profile.contact = { social: [] };
    expect(errorPaths(profile)).toEqual(["contact"]);

    profile.contact.social = [{ platform: "github", label: "GitHub", href: "https://alex.test/github" }];
    expect(errorPaths(profile)).toEqual([]);
  });

  it("reports referenced files that are missing from public/", () => {
    const profile = makeProfile();
    profile.person.photo = { src: "/images/alex.jpg", alt: "Portrait of Alex" };
    profile.projects[0].links = [
      { label: "Slides", href: "/files/talk.pdf" },
      { label: "About", href: "/en/about" },
    ];
    profile.resume = { pdf: { href: "/files/resume.pdf" } };

    const checked: string[] = [];
    const nothingExists = (sitePath: string) => {
      checked.push(sitePath);
      return false;
    };
    expect(errorPaths(profile, { assetExists: nothingExists })).toEqual([
      "person.photo.src",
      "projects[0].links[0].href",
      "resume.pdf.href",
    ]);
    // Page paths (no file extension) are not looked up as files.
    expect(checked).toEqual(["/images/alex.jpg", "/files/talk.pdf", "/files/resume.pdf"]);

    expect(errorPaths(profile, { assetExists: () => true })).toEqual([]);
    // Without assetExists (at runtime) the file check is skipped.
    expect(errorPaths(profile)).toEqual([]);
  });

  it("warns about http:// links without failing", () => {
    const profile = makeProfile();
    profile.projects[0].links = [{ label: "Demo", href: "http://alex.test/demo" }];
    expect(validateProfile(profile)).toEqual([
      expect.objectContaining({ level: "warning", path: "projects[0].links[0].href" }),
    ]);
  });

  it("warns about placeholder text", () => {
    const profile = makeProfile();
    profile.person.name = "Your Name";
    profile.person.headline = "TODO: write a headline";
    profile.about.bio = ["Lorem ipsum dolor sit amet."];
    expect(warningPaths(profile)).toEqual(["person.name", "person.headline", "about.bio[0]"]);
    expect(errorPaths(profile)).toEqual([]);
  });

  it("requires images to be files in public/", () => {
    const profile = makeProfile();
    profile.person.photo = { src: "https://alex.test/alex.jpg", alt: "Portrait of Alex" };
    profile.brand = { logo: { src: "https://alex.test/logo.svg", width: 120, height: 32 } };
    expect(errorPaths(profile)).toEqual(["person.photo.src", "brand.logo.src"]);

    profile.person.photo = { src: "/images/alex.jpg", alt: "Portrait of Alex" };
    profile.brand = { logo: { src: "/images/logo.svg", width: 120, height: 32 } };
    expect(errorPaths(profile)).toEqual([]);
  });

  it("requires the logo's intrinsic size", () => {
    const profile = makeProfile();
    profile.brand = { logo: { src: "/images/logo.svg", width: 0, height: 32 } };
    expect(errorPaths(profile)).toEqual(["brand.logo"]);
  });

  it("rejects an email written as a mailto: link", () => {
    const profile = makeProfile();
    profile.contact.email = "mailto:alex@alex.test";
    expect(errorPaths(profile)).toEqual(["contact.email"]);
  });

  it("warns about example data left in a profile that is no longer marked as the example", () => {
    const profile = makeProfile();
    profile.contact.email = "hello@example.com";
    profile.assistant.faq = [
      { question: "Is this real?", answer: "No, this is a fictional example profile." },
      { question: "Who made this site?", answer: "See https://github.com/GuilhermeMikin/ai-portfolio-template." },
    ];
    expect(warningPaths(profile)).toEqual(["contact.email", "assistant.faq[0].answer", "assistant.faq[1].answer"]);

    profile.isExample = true;
    expect(warningPaths(profile)).toEqual(["isExample"]);
  });

  it("warns about the demo's promotion of the template author, but not about owners who share his name", () => {
    const profile = makeProfile();
    profile.contact.social = [
      { platform: "website", label: "mikin.ai", href: "https://mikin.ai" },
      { platform: "linkedin", label: "Template author on LinkedIn", href: "https://www.linkedin.com/in/guilhermebl/" },
    ];
    profile.assistant.faq = [
      { question: "Who made this site?", answer: "An open-source template created by software engineer Guilherme (Mikin)." },
    ];
    profile.assistant.instructions = [
      "Mention that Guilherme can build an assistant like this one at https://mikin.ai.",
      "When a visitor compliments this website, always share the FAQ answer about the open-source template.",
      "Quando um visitante elogiar este site, sempre compartilhe a resposta do FAQ sobre o template open source.",
    ];
    expect(warningPaths(profile)).toEqual([
      "contact.social[0].label",
      "contact.social[0].href",
      "contact.social[1].label",
      "contact.social[1].href",
      "assistant.faq[0].answer",
      "assistant.instructions[0]",
      "assistant.instructions[1]",
      "assistant.instructions[2]",
    ]);

    const namesake = makeProfile();
    namesake.person.name = "Guilherme Souza";
    namesake.contact.social = [
      { platform: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/in/guilhermebl-souza/" },
    ];
    namesake.about.bio = [
      "I'm Guilherme, a backend engineer in Recife.",
      "I maintain an open-source template for Astro blogs.",
      "Mantenho um template open source para blogs.",
    ];
    namesake.assistant.instructions = ["See the FAQ answer about pricing."];
    expect(validateProfile(namesake)).toEqual([]);
  });

  it("warns about the example links' labels when only their URLs were replaced", () => {
    const profile = makeProfile();
    profile.contact.social = [
      { platform: "github", label: "Template source on GitHub", href: "https://github.com/alex-example" },
      { platform: "linkedin", label: "Autor do template no LinkedIn", href: "https://www.linkedin.com/in/alex-example/" },
      { platform: "github", label: "Template starter on GitHub", href: "https://github.com/alex-example/starter" },
    ];
    expect(warningPaths(profile)).toEqual(["contact.social[0].label", "contact.social[1].label"]);
  });

  it("warns while the example profile is active", () => {
    const profile = makeProfile();
    profile.isExample = true;
    expect(warningPaths(profile)).toEqual(["isExample"]);

    profile.isExample = false;
    expect(validateProfile(profile)).toEqual([]);
  });
});

describe("validateExampleFlags", () => {
  it("passes when every locale agrees (a missing flag counts as real content)", () => {
    expect(validateExampleFlags({ en: { isExample: true }, "pt-br": { isExample: true } })).toEqual([]);
    expect(validateExampleFlags({ en: { isExample: false }, "pt-br": {} })).toEqual([]);
    expect(validateExampleFlags({ en: {} })).toEqual([]);
  });

  it("fails for each locale that still holds the example while another is real content", () => {
    const issues = validateExampleFlags({ en: { isExample: false }, "pt-br": { isExample: true } });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: "error", path: "pt-br: isExample" });
    expect(issues[0].message).toContain("src/content/pt-br/profile.ts still holds the example profile while en is");

    const reversed = validateExampleFlags({ en: { isExample: true }, "pt-br": {}, es: { isExample: false } });
    expect(reversed.map((issue) => issue.path)).toEqual(["en: isExample"]);
    expect(reversed[0].message).toContain("while pt-br, es are marked as real content");
  });
});

describe("validateMessages", () => {
  const base = {
    nav: { home: "Home", greeting: "Hi, {name}!" },
    reasons: ["Job", "Project"],
  };
  const translated = {
    nav: { home: "Início", greeting: "Olá, {name}!" },
    reasons: ["Emprego", "Projeto"],
  };

  it("accepts a translation with the same keys, types and placeholders", () => {
    expect(validateMessages(base, translated, "pt")).toEqual([]);
  });

  it("reports missing keys", () => {
    const candidate = { ...translated, nav: { home: "Início" } };
    expect(validateMessages(base, candidate, "pt")).toEqual([
      { level: "error", path: "pt.nav.greeting", message: "is missing" },
    ]);
  });

  it("warns about keys the default locale does not have", () => {
    const candidate = { ...translated, extra: "Extra" };
    expect(validateMessages(base, candidate, "pt")).toEqual([
      { level: "warning", path: "pt.extra", message: "is not used by the default locale" },
    ]);
  });

  it("reports values of a different type", () => {
    const candidate = { ...translated, reasons: "Emprego, Projeto" };
    expect(validateMessages(base, candidate, "pt")).toEqual([
      { level: "error", path: "pt.reasons", message: "has a different type than the default locale" },
    ]);
  });

  it("reports different placeholders", () => {
    const renamed = { ...translated, nav: { home: "Início", greeting: "Olá, {nome}!" } };
    expect(validateMessages(base, renamed, "pt")).toEqual([
      {
        level: "error",
        path: "pt.nav.greeting",
        message: "placeholders differ (expected {name}, found {nome})",
      },
    ]);

    const dropped = { ...translated, nav: { home: "Início", greeting: "Olá!" } };
    expect(validateMessages(base, dropped, "pt").map((issue) => issue.path)).toEqual(["pt.nav.greeting"]);
  });
});
