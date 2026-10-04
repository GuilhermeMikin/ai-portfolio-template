import { NextResponse, type NextRequest } from "next/server";

import { LOCALE_PREFERENCE_COOKIE_NAME, resolvePreferredLocale } from "@/shared/config/site";

/**
 * Page paths typed without a locale (`/about`) go to the visitor's saved language, or the
 * browser's preferred one, like `/` does (src/app/page.tsx). Locale-prefixed URLs never
 * reach this function, so a shared `/en/projects` link always opens in English and the
 * pages stay prerendered.
 */
export function proxy(request: NextRequest) {
  const locale = resolvePreferredLocale({
    savedLocale: request.cookies.get(LOCALE_PREFERENCE_COOKIE_NAME)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${request.nextUrl.pathname}`;
  return NextResponse.redirect(url);
}

// Next.js reads the matcher statically, so it must be written out: every page in
// SITE_PAGES except the home page (tests/locale-routing.test.ts checks they match).
export const config = {
  matcher: ["/about", "/projects", "/resume", "/contact"],
};
