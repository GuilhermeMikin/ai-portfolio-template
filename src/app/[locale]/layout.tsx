import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";

import { getAllowedExternalHrefs, getContent, getFirstName, getSiteAssetPaths } from "@/content";
import { getChatClientConfig } from "@/lib/ai/config";
import { ChatWidgetRoot } from "@/shared/components/ChatWidget";
import { FloatingLinks, type FloatingLink } from "@/shared/components/FloatingLinks";
import { Footer } from "@/shared/components/Footer";
import { Header, type HeaderNavItem } from "@/shared/components/Header";
import { StructuredData } from "@/shared/components/StructuredData";
import { SUPPORTED_LOCALES, resolveLocale, toLanguageTag } from "@/shared/config/site";
import { THEME_INIT_SCRIPT } from "@/shared/config/theme";
import type { ParamsLocale } from "@/shared/types";
import { inter } from "@/shared/utils/fonts";
import { buildRootMetadata } from "@/shared/utils/seo";

const NAV_PAGES = ["about", "projects", "resume", "contact"] as const;

/**
 * Only the supported locales exist. Any other first segment (`/xx`, `/favicon.ico`) is a
 * plain 404 served by the prerendered `app/not-found.tsx`; locale-less page paths such as
 * `/about` are redirected by src/proxy.ts.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: ParamsLocale): Promise<Metadata> {
  return buildRootMetadata(resolveLocale((await params).locale));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<ParamsLocale & { children: React.ReactNode }>) {
  const locale = resolveLocale((await params).locale);
  const { profile, messages } = getContent(locale);
  const logo = profile.brand?.logo;
  const navItems: HeaderNavItem[] = NAV_PAGES.map((page) => ({ page, label: messages.nav[page] }));
  const analyticsEnabled = process.env.ENABLE_VERCEL_ANALYTICS === "true";
  const floatingLinks: FloatingLink[] = [
    ...profile.contact.social.map((link) => ({ href: link.href, label: link.label, platform: link.platform })),
    ...(profile.contact.email
      ? [{ href: `mailto:${profile.contact.email}`, label: messages.contact.emailLabel, platform: "email" as const }]
      : []),
  ];

  return (
    // `data-theme` is set on <html> by the inline script before hydration.
    <html lang={toLanguageTag(locale)} className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-canvas font-sans text-ink antialiased print:bg-surface">
        <StructuredData locale={locale} />
        <ChatWidgetRoot
          locale={locale}
          copy={messages.chat}
          config={getChatClientConfig()}
          assistantName={profile.assistant.name}
          ownerName={profile.person.name}
          ownerFirstName={getFirstName(profile)}
          allowedAssetPaths={getSiteAssetPaths(profile)}
          allowedExternalHrefs={getAllowedExternalHrefs(profile)}
        >
          <div className="flex min-h-dvh flex-col">
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[100] focus:rounded-xl focus:bg-strong focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-on-strong"
            >
              {messages.nav.skipToContent}
            </a>
            <Header
              locale={locale}
              ownerName={profile.person.name}
              logo={logo ? { src: logo.src, width: logo.width, height: logo.height } : undefined}
              navItems={navItems}
              labels={{
                nav: messages.nav.label,
                openMenu: messages.nav.openMenu,
                closeMenu: messages.nav.closeMenu,
                language: messages.nav.language,
                themeToDark: messages.nav.themeToDark,
                themeToLight: messages.nav.themeToLight,
              }}
            />
            {/* Right padding from md keeps content clear of the floating links until the
                centered column leaves room for them (xl). */}
            <main id="main-content" tabIndex={-1} className="flex-1 md:pr-14 xl:pr-0">
              {children}
            </main>
            <Footer locale={locale} />
          </div>
          <FloatingLinks
            links={floatingLinks}
            labels={{
              list: messages.footer.socialLabel,
              backToTop: messages.nav.backToTop,
              opensInNewTab: messages.common.opensInNewTab,
            }}
          />
        </ChatWidgetRoot>
        {analyticsEnabled ? <Analytics /> : null}
      </body>
    </html>
  );
}
