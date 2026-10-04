import { describe, expect, it } from "vitest";

import {
  formatMessage,
  formatPeriod,
  getAllowedExternalHrefs,
  getFeaturedProjects,
  getFirstName,
  getSiteAssetPaths,
  normalizeExternalHref,
  type Profile,
} from "@/content";
import type { Project } from "@/content/schema";

describe("formatMessage", () => {
  it("replaces every {token} with its value", () => {
    expect(formatMessage("{page} · {name} · {page}", { page: "About", name: "Alex" })).toBe(
      "About · Alex · About"
    );
  });

  it("accepts numbers", () => {
    expect(formatMessage("{count}/{max}", { count: 12, max: 500 })).toBe("12/500");
  });

  it("leaves unknown tokens visible", () => {
    expect(formatMessage("Hi {name}, {missing}", { name: "Alex" })).toBe("Hi Alex, {missing}");
    // Inherited object properties are not values.
    expect(formatMessage("{constructor} {toString}", {})).toBe("{constructor} {toString}");
  });

  it("returns text without tokens unchanged", () => {
    expect(formatMessage("No tokens here", { name: "Alex" })).toBe("No tokens here");
  });
});

describe("formatPeriod", () => {
  const labels = { present: "Present", periodRange: "{start} – {end}" };

  it('shows "Present" for a period without an end', () => {
    expect(formatPeriod({ start: "2023-02" }, "en", labels)).toBe("Feb 2023 – Present");
  });

  it("formats a closed range", () => {
    expect(formatPeriod({ start: "2020-06", end: "2023-01" }, "en", labels)).toBe("Jun 2020 – Jan 2023");
    expect(formatPeriod({ start: "2019", end: "2020" }, "en", labels)).toBe("2019 – 2020");
  });

  it("shows a single date when the period starts and ends in the same month", () => {
    expect(formatPeriod({ start: "2024-03", end: "2024-03" }, "en", labels)).toBe("Mar 2024");
    expect(formatPeriod({ start: "2021", end: "2021" }, "en", labels)).toBe("2021");
  });

  it("uses the labels from the message dictionary", () => {
    const custom = { present: "now", periodRange: "from {start} until {end}" };
    expect(formatPeriod({ start: "2023-02" }, "en", custom)).toBe("from Feb 2023 until now");
  });
});

describe("getFirstName", () => {
  const withName = (name: string, shortName?: string): Pick<Profile, "person"> => ({
    person: { name, shortName, headline: "Engineer", summary: "Builds web applications." },
  });

  it("prefers the trimmed shortName", () => {
    expect(getFirstName(withName("Alexandra Example", "Alex"))).toBe("Alex");
    expect(getFirstName(withName("Alexandra Example", "  Alex  "))).toBe("Alex");
  });

  it("falls back to the first word of the name", () => {
    expect(getFirstName(withName("  Alexandra   Maria Example "))).toBe("Alexandra");
    expect(getFirstName(withName("Alexandra Example", "   "))).toBe("Alexandra");
    expect(getFirstName(withName("Prince"))).toBe("Prince");
  });
});

describe("getFeaturedProjects", () => {
  const project = (id: string, featured?: boolean): Project => ({
    id,
    title: `Project ${id}`,
    summary: `Summary of ${id}.`,
    featured,
  });
  const ids = (projects: Project[]) => projects.map((item) => item.id);

  it("lists featured projects first, in file order, then the others", () => {
    const projects = [project("a"), project("b", true), project("c"), project("d", true), project("e")];
    expect(ids(getFeaturedProjects({ projects }, 4))).toEqual(["b", "d", "a", "c"]);
  });

  it("returns three projects by default", () => {
    const projects = [project("a"), project("b"), project("c"), project("d")];
    expect(ids(getFeaturedProjects({ projects }))).toEqual(["a", "b", "c"]);
  });

  it("caps the featured projects at the limit", () => {
    const projects = ["a", "b", "c", "d"].map((id) => project(id, true));
    expect(ids(getFeaturedProjects({ projects }))).toEqual(["a", "b", "c"]);
  });

  it("returns every project when there are fewer than the limit", () => {
    expect(ids(getFeaturedProjects({ projects: [project("a")] }))).toEqual(["a"]);
  });

  it("does not reorder the profile's projects", () => {
    const projects = [project("a"), project("b", true)];
    getFeaturedProjects({ projects });
    expect(ids(projects)).toEqual(["a", "b"]);
  });
});

describe("link allow-lists", () => {
  const profile = {
    person: { name: "Alex Example", headline: "Engineer", summary: "Builds things. Notes at https://alex.test/notes." },
    about: { bio: ["Bio."] },
    skills: [],
    experience: [],
    projects: [
      {
        id: "booking",
        title: "Booking",
        summary: "Booking app.",
        links: [
          { label: "Repository", href: "https://alex.test/repo/" },
          { label: "Slides", href: "/files/talk.pdf" },
          { label: "About page", href: "/en/about" },
        ],
      },
    ],
    contact: { email: "Alex@Alex.test", social: [{ platform: "github", label: "GitHub", href: "https://alex.test/github" }] },
    resume: { pdf: { href: "/files/resume.pdf" } },
    assistant: { name: "Alex's assistant", suggestedQuestions: [] },
  } as unknown as Profile;

  it("lists the site files the assistant may link to", () => {
    expect(getSiteAssetPaths(profile)).toEqual(["/files/resume.pdf", "/files/talk.pdf"]);
  });

  it("lists every external URL and email in the profile, normalized", () => {
    expect(getAllowedExternalHrefs(profile)).toEqual([
      "https://alex.test/github",
      "https://alex.test/notes",
      "https://alex.test/repo",
      "mailto:alex@alex.test",
    ]);
  });

  it("normalizes case and trailing slashes but keeps queries distinct", () => {
    expect(normalizeExternalHref("HTTPS://Alex.TEST/repo/")).toBe("https://alex.test/repo");
    expect(normalizeExternalHref("mailto:alex@alex.test?bcc=someone@else.test")).not.toBe("mailto:alex@alex.test");
    expect(normalizeExternalHref("javascript:alert(1)")).toBeNull();
  });
});
