import type { Metadata } from "next";

import { getMessages } from "@/content";
import { NotFound } from "@/shared/components/NotFound";
import { DEFAULT_LOCALE, toLanguageTag } from "@/shared/config/site";
import { THEME_INIT_SCRIPT } from "@/shared/config/theme";
import { inter } from "@/shared/utils/fonts";

export const metadata: Metadata = {
  title: getMessages(DEFAULT_LOCALE).notFound.title,
};

/**
 * The site's 404 page, prerendered as static HTML (it works without JavaScript).
 * Next.js serves it for every URL that matches no route, including unknown paths under
 * a locale (`/en/missing`). The root layout renders no <html> (the `[locale]` layout
 * does), so this page brings its own document.
 *
 * Why not a `[locale]/not-found.tsx` with the site header? `notFound()` thrown by a
 * dynamic catch-all page cannot be server-rendered in Next.js 16: the response would be
 * an empty shell that only fills in after JavaScript runs.
 */
export default function RootNotFound() {
  return (
    <html lang={toLanguageTag(DEFAULT_LOCALE)} className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-canvas font-sans text-ink antialiased">
        <main className="flex min-h-dvh items-center justify-center">
          <NotFound />
        </main>
      </body>
    </html>
  );
}
