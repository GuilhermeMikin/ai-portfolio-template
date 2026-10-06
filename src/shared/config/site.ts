/**
 * Site-wide settings: canonical URL and the list of supported locales.
 *
 * Client-safe: imported by client components, so it must never read server-only
 * secrets. To add a language, append its code to `SUPPORTED_LOCALES`, give it a
 * label below and add `src/content/<locale>/` (see docs/customization.md).
 */

function resolveSiteUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    // Vercel system variables (production domain first, then the deployment URL).
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      // Only the origin is used: canonical URLs are built from it.
      return new URL(withScheme).origin;
    } catch {
      throw new Error(
        `Invalid site URL "${value}". Set NEXT_PUBLIC_SITE_URL to an absolute URL such as https://example.com.`
      );
    }
  }

  return "http://localhost:3000";
}

/** Absolute origin used for canonical URLs, Open Graph, the sitemap and JSON-LD. */
export const SITE_URL = resolveSiteUrl();

/** This template's source code, linked from the demo banner while `profile.isExample` is true. */
export const TEMPLATE_REPOSITORY_URL = "https://github.com/GuilhermeMikin/ai-portfolio-template";

/**
 * URL segment of every supported locale (`/en/about`): lowercase, e.g. `"pt-br"`.
 * The first one is the default locale.
 */
export const SUPPORTED_LOCALES = ["en", "pt-br"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = SUPPORTED_LOCALES[0];

/** Name shown in the language switcher (only rendered when there is more than one locale). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "pt-br": "Português",
};

export const LOCALE_PREFERENCE_COOKIE_NAME = "site_locale";
export const LOCALE_PREFERENCE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** BCP 47 tag for `lang`, `hreflang` and `Intl` (`pt-br` → `pt-BR`). */
export function toLanguageTag(locale: string) {
  const [language, region] = locale.split("-");
  return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase();
}

/** Open Graph locale format (`en` → `en`, `pt-br` → `pt_BR`). */
export function toOpenGraphLocale(locale: string) {
  return toLanguageTag(locale).replace("-", "_");
}

export function isSupportedLocale(locale: string): locale is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale.toLowerCase());
}

export function coerceLocale(locale?: string | null): Locale | null {
  if (!locale) {
    return null;
  }

  const normalizedLocale = locale.toLowerCase();
  return isSupportedLocale(normalizedLocale) ? (normalizedLocale as Locale) : null;
}

export function resolveLocale(locale?: string | null): Locale {
  return coerceLocale(locale) ?? DEFAULT_LOCALE;
}

/** First supported locale for each base language (`pt` → `pt-br`). */
const BASE_LANGUAGE_LOCALE_MAP: Record<string, Locale> = {};
for (const locale of SUPPORTED_LOCALES) {
  const [base] = locale.split("-");
  BASE_LANGUAGE_LOCALE_MAP[base] ??= locale;
}

export function localeForBaseLanguage(baseLanguage: string): Locale | null {
  return BASE_LANGUAGE_LOCALE_MAP[baseLanguage.toLowerCase()] ?? null;
}

function getAcceptLanguageCandidates(acceptLanguage?: string | null) {
  if (!acceptLanguage) {
    return [];
  }

  return acceptLanguage
    .split(",")
    .map((entry, index) => {
      const [rawTag, ...parameters] = entry.trim().split(";");
      if (!rawTag) {
        return null;
      }

      let quality = 1;

      for (const parameter of parameters) {
        const normalizedParameter = parameter.trim().toLowerCase();
        if (!normalizedParameter.startsWith("q=")) {
          continue;
        }

        const parsedQuality = Number.parseFloat(normalizedParameter.slice(2));
        if (Number.isFinite(parsedQuality)) {
          quality = parsedQuality;
        }
      }

      return {
        index,
        quality,
        tag: rawTag,
      };
    })
    .filter(
      (
        candidate
      ): candidate is {
        index: number;
        quality: number;
        tag: string;
      } => Boolean(candidate && candidate.quality > 0)
    )
    .sort((left, right) => right.quality - left.quality || left.index - right.index)
    .map((candidate) => candidate.tag);
}

export function matchSupportedLocale(
  localeCandidates: Iterable<string | null | undefined>
): Locale | null {
  for (const localeCandidate of localeCandidates) {
    if (typeof localeCandidate !== "string") {
      continue;
    }

    const normalizedCandidate = localeCandidate.trim().toLowerCase();
    if (!normalizedCandidate) {
      continue;
    }

    const exactLocale = coerceLocale(normalizedCandidate);
    if (exactLocale) {
      return exactLocale;
    }

    const [baseLanguage] = normalizedCandidate.split("-");
    const mappedLocale = localeForBaseLanguage(baseLanguage);
    if (mappedLocale) {
      return mappedLocale;
    }
  }

  return null;
}

/**
 * The visitor's language: the saved choice (cookie) first, then the browser's preferences,
 * from the Accept-Language header on the server or `navigator.languages` in the browser.
 */
export function resolvePreferredLocale({
  acceptLanguage,
  browserLanguages,
  savedLocale,
}: {
  acceptLanguage?: string | null;
  browserLanguages?: readonly string[];
  savedLocale?: string | null;
}): Locale {
  return (
    matchSupportedLocale([
      savedLocale,
      ...getAcceptLanguageCandidates(acceptLanguage),
      ...(browserLanguages ?? []),
    ]) ?? DEFAULT_LOCALE
  );
}

/** The saved language from a `document.cookie` string, if any. */
export function readLocalePreferenceCookie(cookieString: string): string | null {
  for (const part of cookieString.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === LOCALE_PREFERENCE_COOKIE_NAME) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}
