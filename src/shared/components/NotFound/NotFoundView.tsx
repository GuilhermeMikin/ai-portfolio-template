"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DEFAULT_LOCALE, toLanguageTag, type Locale } from "@/shared/config/site";
import { getSitePagePath } from "@/shared/config/site-links";
import { getLocaleFromPathname } from "@/shared/utils/routes";
import { BUTTON_PRIMARY } from "@/shared/utils/styles";

export type NotFoundCopy = { title: string; description: string; backHome: string };

/**
 * The 404 page is prerendered once, in the default locale. After hydration it switches
 * to the locale in the URL (`/pt-br/…`), so the static HTML never mismatches. The
 * document's `lang` and title switch with it (`app/not-found.tsx` sets the title to
 * `notFound.title` of the default locale, without the page-title template).
 */
export function NotFoundView({ copyByLocale }: { copyByLocale: Record<Locale, NotFoundCopy> }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    // Runs once after hydration; the prerendered HTML always uses the default locale, so
    // for that locale these updates change nothing.
    const urlLocale = getLocaleFromPathname(window.location.pathname);
    if (!urlLocale) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocale(urlLocale);
    document.documentElement.lang = toLanguageTag(urlLocale);
    document.title = copyByLocale[urlLocale].title;
  }, [copyByLocale]);

  const copy = copyByLocale[locale];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-20 text-center sm:py-28">
      <p className="text-sm font-semibold text-muted">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{copy.title}</h1>
      <p className="mt-4 text-base leading-7 text-muted">{copy.description}</p>
      <Link href={getSitePagePath(locale, "")} className={`${BUTTON_PRIMARY} mt-8`}>
        {copy.backHome}
      </Link>
    </div>
  );
}
