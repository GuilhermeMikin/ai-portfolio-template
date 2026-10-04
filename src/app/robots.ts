import type { MetadataRoute } from "next";

import { SITE_URL } from "@/shared/config/site";

/**
 * Crawling stays allowed even for the example profile: its pages carry a `noindex`
 * robots meta tag, which crawlers can only see if they may fetch the page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
