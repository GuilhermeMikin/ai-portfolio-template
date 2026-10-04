/**
 * The on-site links the AI assistant may use. The chat prompt (server) lists them and
 * the ChatMarkdown link guard (client) allow-lists them, so what the model is told and
 * what the UI accepts cannot drift apart. Must stay client-safe.
 */
import { SITE_URL, type Locale } from "./site";

/** Canonical pages under `/{locale}`; `""` is the locale home. */
export const SITE_PAGES = ["", "about", "projects", "resume", "contact"] as const;
export type SitePage = (typeof SITE_PAGES)[number];

export function getSitePagePath(locale: Locale, page: SitePage) {
  return page ? `/${locale}/${page}` : `/${locale}`;
}

export function isSitePage(slug: string): slug is SitePage {
  return (SITE_PAGES as readonly string[]).includes(slug);
}

function getHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Hosts whose absolute URLs point at this site rather than an external one. */
export const SITE_HOSTS: ReadonlySet<string> = new Set(
  [getHost(SITE_URL)].filter((host): host is string => Boolean(host))
);
