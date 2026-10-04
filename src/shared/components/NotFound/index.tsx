import { getMessages } from "@/content";
import { SUPPORTED_LOCALES, type Locale } from "@/shared/config/site";

import { NotFoundView, type NotFoundCopy } from "./NotFoundView";

/**
 * 404 content for every locale; the client picks the one in the URL.
 *
 * `not-found` files receive no params, and Next renders them along with every page of
 * their segment, so reading cookies or headers there would make the whole site dynamic.
 */
export function NotFound() {
  const copyByLocale = Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, getMessages(locale).notFound])
  ) as Record<Locale, NotFoundCopy>;

  return <NotFoundView copyByLocale={copyByLocale} />;
}
