/**
 * Fictional profiles for tests that need specific content.
 *
 * Suites that check content-dependent behavior (prompts, demo replies, related pages…)
 * mock "@/content" with these, so they keep passing after the bundled example profile in
 * `src/content/` is replaced:
 *
 *   vi.mock("@/content", async (importOriginal) => {
 *     const { mockContentModule } = await import("./fixtures/profile");
 *     return mockContentModule(await importOriginal());
 *   });
 *
 * UI text still comes from the real message files; tests read it through `getMessages()`.
 * Only type imports from "@/content" here: this module is loaded by that mock.
 */
import type { LocaleContent, Profile } from "@/content";
import type { Locale } from "@/shared/config/site";

/** Every section filled in. */
export const FIXTURE_PROFILE: Profile = {
  isExample: false,
  person: {
    name: "Robin Testwell",
    headline: "Data engineer — Python, SQL and stream processing",
    summary: "Robin builds data pipelines and analytics tools for small product teams.",
    location: "Porto, Portugal",
  },
  about: {
    bio: [
      "I design data pipelines that stay simple to operate.",
      "Before data engineering I worked as a laboratory technician.",
    ],
    highlights: ["Batch and streaming pipelines", "Data quality checks"],
    interests: ["Trail running", "Analog photography"],
  },
  skills: [
    { group: "Languages", items: ["Python", "SQL", "Go"] },
    { group: "Data platforms", items: ["Apache Kafka", "dbt", "PostgreSQL"] },
  ],
  experience: [
    {
      id: "riverbank-analytics",
      role: "Data Engineer",
      organization: "Riverbank Analytics",
      location: "Remote",
      period: { start: "2022-04" },
      summary: "Runs the ingestion platform for retail clients.",
      highlights: ["Moved nightly batch jobs to streaming ingestion", "Introduced data contracts between teams"],
      stack: ["Python", "Apache Kafka", "dbt"],
    },
    {
      id: "northwind-labs",
      role: "Analytics Developer",
      organization: "Northwind Labs",
      period: { start: "2019-09", end: "2022-03" },
      highlights: ["Built the reporting warehouse"],
      stack: ["SQL", "PostgreSQL"],
    },
  ],
  projects: [
    {
      id: "ledger-lint",
      title: "Ledger Lint",
      summary: "An open-source checker that validates accounting exports before they reach the warehouse.",
      status: "Open source",
      featured: true,
      highlights: ["Catches schema drift in CSV exports"],
      stack: ["Python"],
      links: [{ label: "Source", href: "https://code.example.org/robin/ledger-lint" }],
    },
    {
      id: "tide-dashboard",
      title: "Tide dashboard",
      summary: "A streaming dashboard of harbour sensor data.",
      period: { start: "2023-01", end: "2023-06" },
      stack: ["Go", "Apache Kafka"],
    },
  ],
  education: [
    {
      id: "msc-data-science",
      degree: "MSc in Data Science",
      institution: "University of Exampleton",
      period: { start: "2017", end: "2019" },
    },
  ],
  certifications: [{ name: "Cloud Data Engineer", issuer: "Example Cloud", date: "2023-05" }],
  languages: [
    { name: "English", level: "Fluent" },
    { name: "Portuguese", level: "Native" },
  ],
  contact: {
    email: "robin@example.org",
    availability: "Open to freelance data projects from January 2027.",
    responseTime: "Within two working days",
    social: [{ platform: "github", label: "GitHub", href: "https://code.example.org/robin" }],
  },
  resume: { pdf: { href: "/files/robin-testwell-cv.pdf" }, updated: "2026-08" },
  assistant: {
    name: "Robin's AI assistant",
    suggestedQuestions: [
      "Which data platforms does Robin use?",
      "What is Ledger Lint?",
      "Is Robin available for freelance work?",
    ],
    faq: [{ question: "Does Robin work remotely?", answer: "Yes, Robin works remotely from Porto." }],
    instructions: ["Keep answers under four sentences."],
  },
};

/** Only the required fields: no optional sections, no email, no FAQ. */
export const MINIMAL_PROFILE: Profile = {
  person: {
    name: "Kai Minimal",
    headline: "Illustrator",
    summary: "Kai draws maps for board games.",
  },
  about: { bio: ["I draw maps."] },
  skills: [{ group: "Tools", items: ["Ink", "Watercolour"] }],
  experience: [],
  projects: [],
  contact: { social: [] },
  assistant: { name: "Kai's assistant", suggestedQuestions: [] },
};

/** The profile the mocked "@/content" serves; change it with `setFixtureProfile()`. */
const state: { profile: Profile } = { profile: FIXTURE_PROFILE };

export function setFixtureProfile(profile: Profile) {
  state.profile = profile;
}

export function resetProfile() {
  state.profile = FIXTURE_PROFILE;
}

type ContentModule = typeof import("@/content");

/** "@/content" with the fixture profile in every locale and the real UI text. */
export function mockContentModule(actual: ContentModule): ContentModule {
  const getContent = (locale: Locale): LocaleContent => ({
    profile: state.profile,
    messages: actual.getMessages(locale),
  });

  return {
    ...actual,
    getContent,
    getProfile: (locale: Locale) => getContent(locale).profile,
    getMessages: (locale: Locale) => getContent(locale).messages,
  };
}
