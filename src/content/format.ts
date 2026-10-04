/**
 * Small, client-safe helpers for turning content into display strings.
 */
import { toLanguageTag } from "@/shared/config/site";

import type { Period, Profile, YearMonth } from "./schema";

/** Replaces `{key}` tokens. Unknown tokens are left as they are, so mistakes stay visible. */
export function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token
  );
}

export function getFirstName(profile: Pick<Profile, "person">): string {
  return profile.person.shortName?.trim() || profile.person.name.trim().split(/\s+/)[0];
}

/** Values every message template may use: `{name}`, `{firstName}`, `{assistantName}`. */
export function getProfileMessageValues(profile: Pick<Profile, "person" | "assistant">) {
  return {
    name: profile.person.name,
    firstName: getFirstName(profile),
    assistantName: profile.assistant.name,
  };
}

/** "2024-03" → "Mar 2024" (in the given locale); "2024" → "2024". */
export function formatYearMonth(value: YearMonth, locale: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!month) {
    return String(year);
  }

  return new Intl.DateTimeFormat(toLanguageTag(locale), {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** "Mar 2024 – Present" with localized labels from the message dictionary. */
export function formatPeriod(
  period: Period,
  locale: string,
  labels: { present: string; periodRange: string }
): string {
  const start = formatYearMonth(period.start, locale);
  const end = period.end ? formatYearMonth(period.end, locale) : labels.present;
  if (period.end && period.end === period.start) {
    return start;
  }

  return formatMessage(labels.periodRange, { start, end });
}

/**
 * Site-relative files (served from `public/`) that the assistant may link to, such as
 * the résumé PDF. Page links are covered by SITE_PAGES in site-links.ts.
 */
export function getSiteAssetPaths(profile: Pick<Profile, "resume" | "projects">): string[] {
  const hrefs = [
    profile.resume?.pdf?.href,
    ...profile.projects.flatMap((project) => project.links ?? []).map((link) => link.href),
  ];
  // Files only (a name with an extension); page paths are covered by SITE_PAGES.
  const isSiteFile = (href: string | undefined): href is string =>
    Boolean(href && href.startsWith("/") && !href.startsWith("//") && /\.[a-z0-9]+$/i.test(href));
  return [...new Set(hrefs.filter(isSiteFile))];
}

const BARE_URL_PATTERN = /https?:\/\/[^\s<>()"'`]+/gi;
const EMAIL_ONLY_PATTERN = /^[^\s@:]+@[^\s@]+\.[^\s@]+$/;

/**
 * Canonical form used to compare external links: parsed by the URL parser (lowercase
 * scheme and host), without a trailing slash. Returns null for anything that is not an
 * http(s) or mailto URL.
 */
export function normalizeExternalHref(href: string): string | null {
  try {
    const url = new URL(href.trim());
    if (url.protocol === "mailto:") {
      return url.href.toLowerCase();
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Every external URL and email address that appears in the profile, normalized. The
 * chat only renders external links from this list, matching the prompt rule that the
 * assistant may link only to URLs found in the content.
 */
export function getAllowedExternalHrefs(profile: Profile): string[] {
  const allowed = new Set<string>();
  const add = (href: string) => {
    const normalized = normalizeExternalHref(href);
    if (normalized) allowed.add(normalized);
  };
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      const text = value.trim();
      if (EMAIL_ONLY_PATTERN.test(text)) add(`mailto:${text}`);
      else if (/^(?:https?|mailto):\S+$/i.test(text)) add(text);
      for (const match of text.matchAll(BARE_URL_PATTERN)) add(match[0].replace(/[.,;:!?]+$/, ""));
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(profile);
  return [...allowed].sort();
}

/** Featured projects first (in file order), padded with the rest, capped at `limit`. */
export function getFeaturedProjects(profile: Pick<Profile, "projects">, limit = 3) {
  const featured = profile.projects.filter((project) => project.featured);
  const rest = profile.projects.filter((project) => !project.featured);
  return [...featured, ...rest].slice(0, limit);
}
