/**
 * Path helpers shared by the header, the language switcher and the 404 page.
 * Client-safe.
 */
import { coerceLocale, type Locale } from "@/shared/config/site";
import { getSitePagePath, isSitePage, type SitePage } from "@/shared/config/site-links";

export type PageSlug = Exclude<SitePage, "">;

/** The page a pathname shows (`/en` → `""`, `/en/about` → `"about"`), or `null` for anything else. */
export function getSitePageFromPathname(pathname: string | null | undefined): SitePage | null {
  const segments = (pathname ?? "").split("/").filter(Boolean);
  if (segments.length === 0 || segments.length > 2 || !coerceLocale(segments[0])) {
    return null;
  }
  if (segments.length === 1) {
    return "";
  }
  const slug = segments[1].toLowerCase();
  return isSitePage(slug) ? slug : null;
}

/** The supported locale in a pathname's first segment (`/en/about` → `"en"`), or `null`. */
export function getLocaleFromPathname(pathname: string | null | undefined): Locale | null {
  const [first] = (pathname ?? "").split("/").filter(Boolean);
  return coerceLocale(first);
}

/** The current page in another locale (`/en/about` → `/pt-br/about`); the locale home otherwise. */
export function getLocalizedPathname(pathname: string | null | undefined, locale: Locale): string {
  return getSitePagePath(locale, getSitePageFromPathname(pathname) ?? "");
}
