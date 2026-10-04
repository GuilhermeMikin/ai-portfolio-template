import type { Locale } from "@/shared/config/site";

import { buildStructuredData, serializeJsonLd } from "./json-ld";

/** Person + WebSite JSON-LD for search engines. Server component; render it once per page. */
export function StructuredData({ locale }: { locale: Locale }) {
  return (
    <script
      type="application/ld+json"
      // Built from the site's own content; serializeJsonLd escapes "<".
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildStructuredData(locale)) }}
    />
  );
}
