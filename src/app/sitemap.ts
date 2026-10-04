import type { MetadataRoute } from "next";

import { SUPPORTED_LOCALES } from "@/shared/config/site";
import { SITE_PAGES } from "@/shared/config/site-links";
import { getLanguageAlternates, getPageUrl } from "@/shared/utils/seo";

/** Every page in every locale, each listing its hreflang alternates (and `x-default`). */
export default function sitemap(): MetadataRoute.Sitemap {
  return SUPPORTED_LOCALES.flatMap((locale) =>
    SITE_PAGES.map((page) => ({
      url: getPageUrl(locale, page),
      alternates: { languages: getLanguageAlternates(page) },
    }))
  );
}
