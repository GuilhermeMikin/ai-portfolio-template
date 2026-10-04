import type { MetadataRoute } from "next";

import { getFirstName, getProfile } from "@/content";
import { DEFAULT_LOCALE, toLanguageTag } from "@/shared/config/site";
import {
  APPLE_ICON_SIZE,
  BRAND_COLORS,
  ICON_SIZE,
  getSiteDescription,
} from "@/shared/utils/seo";

const toSizes = ({ width, height }: { width: number; height: number }) => `${width}x${height}`;

/** Served at /manifest.webmanifest; Next.js links it from every page. */
export default function manifest(): MetadataRoute.Manifest {
  const profile = getProfile(DEFAULT_LOCALE);

  return {
    name: profile.person.name,
    short_name: getFirstName(profile),
    description: getSiteDescription(profile),
    lang: toLanguageTag(DEFAULT_LOCALE),
    start_url: `/${DEFAULT_LOCALE}`,
    display: "browser",
    background_color: BRAND_COLORS.canvas,
    // Same as the viewport theme color (the header's surface).
    theme_color: BRAND_COLORS.surface,
    // Routes Next.js serves for src/app/icon.tsx and src/app/apple-icon.tsx.
    icons: [
      { src: "/icon", sizes: toSizes(ICON_SIZE), type: "image/png" },
      { src: "/apple-icon", sizes: toSizes(APPLE_ICON_SIZE), type: "image/png" },
    ],
  };
}
