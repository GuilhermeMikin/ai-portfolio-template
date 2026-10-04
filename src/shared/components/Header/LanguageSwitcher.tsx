"use client";

import { Languages } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import {
  LOCALE_LABELS,
  LOCALE_PREFERENCE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_PREFERENCE_COOKIE_NAME,
  SUPPORTED_LOCALES,
  toLanguageTag,
  type Locale,
} from "@/shared/config/site";
import { getLocalizedPathname } from "@/shared/utils/routes";
import { cx } from "@/shared/utils/styles";

/** Remembers the choice for `/` (the root page redirects to the saved locale). */
function persistLocalePreference(locale: Locale) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_PREFERENCE_COOKIE_NAME}=${encodeURIComponent(locale)}; Path=/; Max-Age=${LOCALE_PREFERENCE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

/**
 * Disclosure with one link per locale, keeping the current page. Only rendered when
 * more than one locale is supported. Plain links (full page loads), so `lang`, metadata
 * and content all switch together.
 */
export function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip an Escape something else already handled (e.g. closing the chat dialog).
      if (event.key === "Escape" && !event.defaultPrevented) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-subtle hover:text-ink"
      >
        <Languages aria-hidden className="h-4 w-4" />
        <span className="sr-only">{label}:</span>
        <span className="sr-only sm:not-sr-only">{LOCALE_LABELS[locale]}</span>
      </button>

      <ul
        id={listId}
        hidden={!isOpen}
        className="absolute right-0 top-full z-50 mt-2 min-w-44 rounded-xl border border-line bg-surface p-1 shadow-raised"
      >
        {SUPPORTED_LOCALES.map((code) => (
          <li key={code}>
            <a
              href={getLocalizedPathname(pathname, code)}
              lang={toLanguageTag(code)}
              hrefLang={toLanguageTag(code)}
              aria-current={code === locale ? "true" : undefined}
              onClick={() => persistLocalePreference(code)}
              className={cx(
                "block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-subtle",
                code === locale ? "font-semibold text-ink" : "text-muted hover:text-ink"
              )}
            >
              {LOCALE_LABELS[code]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
