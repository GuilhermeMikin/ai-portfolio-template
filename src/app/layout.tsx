import type { Metadata, Viewport } from "next";

import { SITE_URL } from "@/shared/config/site";
import { THEME_COLORS } from "@/shared/config/theme";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export const viewport: Viewport = {
  // Both themes are designed; this also keeps Android's "auto dark" recoloring off.
  colorScheme: "light dark",
  // Browser UI color, matching the sticky header (`--color-surface`). The theme toggle
  // updates these tags when the visitor's choice differs from the system setting.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

/**
 * The document (<html lang>, <body>, fonts, header and footer) is rendered by
 * `app/[locale]/layout.tsx`, where the locale is known. This root layout only loads
 * the global styles; `app/not-found.tsx` brings its own <html> for URLs outside a locale.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
