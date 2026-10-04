import type { Metadata, Viewport } from "next";

import { SITE_URL } from "@/shared/config/site";
import { BRAND_COLORS } from "@/shared/utils/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export const viewport: Viewport = {
  // Light-only design; also opts out of "auto dark" recoloring on Android browsers.
  colorScheme: "only light",
  // Browser UI color, matching the sticky header (`--color-surface`).
  themeColor: BRAND_COLORS.surface,
};

/**
 * The document (<html lang>, <body>, fonts, header and footer) is rendered by
 * `app/[locale]/layout.tsx`, where the locale is known. This root layout only loads
 * the global styles; `app/not-found.tsx` brings its own <html> for URLs outside a locale.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
