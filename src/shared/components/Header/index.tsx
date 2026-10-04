"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { SUPPORTED_LOCALES, type Locale } from "@/shared/config/site";
import { getSitePagePath } from "@/shared/config/site-links";
import { getSitePageFromPathname, type PageSlug } from "@/shared/utils/routes";
import { CONTAINER, cx } from "@/shared/utils/styles";

import { LanguageSwitcher } from "./LanguageSwitcher";

export type HeaderNavItem = { page: PageSlug; label: string };

export type HeaderProps = {
  locale: Locale;
  /** Owner's name: the brand text, or the logo's alt text. */
  ownerName: string;
  logo?: { src: string; width: number; height: number };
  navItems: HeaderNavItem[];
  labels: { nav: string; openMenu: string; closeMenu: string; language: string };
};

const NAV_LINK = "rounded-xl px-3 py-2 text-sm font-medium transition-colors";

/** The current page is underlined as well, so it doesn't stand out by color alone. */
const NAV_LINK_STATE = {
  current: "bg-subtle text-ink underline decoration-2 underline-offset-4",
  other: "text-muted hover:bg-subtle hover:text-ink",
};

export function Header({ locale, ownerName, logo, navItems, labels }: HeaderProps) {
  const pathname = usePathname();
  const currentPage = getSitePageFromPathname(pathname);
  // The menu remembers the path it was opened on, so any navigation closes it.
  const [menuOpenedAt, setMenuOpenedAt] = useState<string | null>(null);
  const isMenuOpen = menuOpenedAt !== null && menuOpenedAt === pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip an Escape something else already handled (e.g. closing the chat dialog).
      if (event.key === "Escape" && !event.defaultPrevented) {
        setMenuOpenedAt(null);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen]);

  const links = navItems.map((item) => ({
    ...item,
    href: getSitePagePath(locale, item.page),
    isCurrent: currentPage === item.page,
  }));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface print:hidden">
      <div className={cx(CONTAINER, "flex h-16 items-center gap-2")}>
        <div className="min-w-0 flex-1">
          <Link
            href={getSitePagePath(locale, "")}
            aria-current={currentPage === "" ? "page" : undefined}
            className="inline-flex max-w-full items-center rounded-lg py-1 text-base font-semibold tracking-tight text-ink"
          >
            {logo ? (
              <Image
                src={logo.src}
                alt={ownerName}
                width={logo.width}
                height={logo.height}
                loading="eager"
                className="h-8 w-auto max-w-full object-contain object-left"
              />
            ) : (
              <span className="truncate">{ownerName}</span>
            )}
          </Link>
        </div>

        <nav aria-label={labels.nav} className="hidden md:block">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.page}>
                <Link
                  href={link.href}
                  aria-current={link.isCurrent ? "page" : undefined}
                  className={cx(
                    NAV_LINK,
                    link.isCurrent ? NAV_LINK_STATE.current : NAV_LINK_STATE.other
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {SUPPORTED_LOCALES.length > 1 ? <LanguageSwitcher locale={locale} label={labels.language} /> : null}

        <button
          ref={menuButtonRef}
          type="button"
          aria-expanded={isMenuOpen}
          aria-controls={menuId}
          aria-label={isMenuOpen ? labels.closeMenu : labels.openMenu}
          onClick={() => setMenuOpenedAt(isMenuOpen ? null : pathname)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink transition-colors hover:bg-subtle md:hidden"
        >
          {isMenuOpen ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
        </button>
      </div>

      <div id={menuId} hidden={!isMenuOpen} className="border-t border-line md:hidden">
        <nav aria-label={labels.nav} className={cx(CONTAINER, "py-2")}>
          <ul>
            {links.map((link) => (
              <li key={link.page}>
                <Link
                  href={link.href}
                  aria-current={link.isCurrent ? "page" : undefined}
                  onClick={() => {
                    setMenuOpenedAt(null);
                    menuButtonRef.current?.focus();
                  }}
                  className={cx(
                    "block rounded-xl px-3 py-3 text-base font-medium transition-colors",
                    link.isCurrent ? NAV_LINK_STATE.current : NAV_LINK_STATE.other
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
