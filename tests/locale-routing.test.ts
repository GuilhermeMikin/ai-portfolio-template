import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "@/proxy";
import {
  DEFAULT_LOCALE,
  LOCALE_PREFERENCE_COOKIE_NAME,
  SUPPORTED_LOCALES,
  readLocalePreferenceCookie,
  resolvePreferredLocale,
  type Locale,
} from "@/shared/config/site";
import { SITE_PAGES } from "@/shared/config/site-links";

/** A supported locale other than the default one, if the site has several. */
const OTHER_LOCALE = SUPPORTED_LOCALES.find((locale) => locale !== DEFAULT_LOCALE) as Locale | undefined;

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "https://site.test"), { headers });
}

describe("proxy", () => {
  it("matches every page without a locale except the home page", () => {
    expect(config.matcher).toEqual(SITE_PAGES.filter((page) => page !== "").map((page) => `/${page}`));
  });

  it("redirects to the default locale without a cookie or a known browser language", () => {
    const response = proxy(request("/about?ref=card", { "accept-language": "xx-YY" }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://site.test/${DEFAULT_LOCALE}/about?ref=card`);
  });

  it.runIf(OTHER_LOCALE)("follows the browser language, and the saved choice over it", () => {
    const other = OTHER_LOCALE as Locale;
    const [baseLanguage] = other.split("-");

    const byBrowser = proxy(request("/projects", { "accept-language": `${baseLanguage};q=0.9, xx;q=0.1` }));
    expect(byBrowser.headers.get("location")).toBe(`https://site.test/${other}/projects`);

    const bySavedChoice = proxy(
      request("/projects", {
        "accept-language": baseLanguage,
        cookie: `${LOCALE_PREFERENCE_COOKIE_NAME}=${DEFAULT_LOCALE}`,
      })
    );
    expect(bySavedChoice.headers.get("location")).toBe(`https://site.test/${DEFAULT_LOCALE}/projects`);
  });
});

describe("resolvePreferredLocale", () => {
  it("uses the saved choice, then Accept-Language, then navigator.languages", () => {
    const [locale] = SUPPORTED_LOCALES;
    expect(resolvePreferredLocale({ savedLocale: locale, acceptLanguage: "xx", browserLanguages: ["yy"] })).toBe(
      locale
    );
    expect(resolvePreferredLocale({ browserLanguages: ["xx", locale.toUpperCase()] })).toBe(locale);
    expect(resolvePreferredLocale({ savedLocale: "xx", browserLanguages: ["yy"] })).toBe(DEFAULT_LOCALE);
  });
});

describe("readLocalePreferenceCookie", () => {
  it("finds the saved language among other cookies", () => {
    expect(readLocalePreferenceCookie(`a=1; ${LOCALE_PREFERENCE_COOKIE_NAME}=pt-br; b=2`)).toBe("pt-br");
    expect(readLocalePreferenceCookie("a=1")).toBeNull();
    expect(readLocalePreferenceCookie(`${LOCALE_PREFERENCE_COOKIE_NAME}=%E0%A4%A`)).toBeNull();
  });
});
