"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { FaEnvelope } from "react-icons/fa6";

import type { SocialPlatform } from "@/content/schema";
import { SocialIcon } from "@/shared/components/SocialIcon";

export type FloatingLink = {
  href: string;
  label: string;
  /** `"email"` for the owner's address (a mailto: link), otherwise the social platform. */
  platform: SocialPlatform | "email";
};

type FloatingLinksProps = {
  /** From `profile.contact`: social links, then the email address. */
  links: FloatingLink[];
  labels: { list: string; backToTop: string; opensInNewTab: string };
};

/** Show "back to top" once the visitor has scrolled this far. */
const BACK_TO_TOP_AFTER_PX = 480;

const BUTTON =
  "grid size-9 place-items-center rounded-full border border-line bg-surface text-muted shadow-card transition-colors hover:border-field hover:text-ink md:size-10";

/**
 * Small floating shortcuts on the right edge: the owner's links and a "back to top"
 * button. Vertically centered from `md`; stacked in the bottom-right corner on phones,
 * where the chat launcher sits bottom-left. The same links are in the footer.
 */
export function FloatingLinks({ links, labels }: FloatingLinksProps) {
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const update = () => setShowBackToTop(window.scrollY > BACK_TO_TOP_AFTER_PX);
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (links.length === 0 && !showBackToTop) {
    return null;
  }

  function backToTop() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    // The button disappears near the top; keep keyboard focus at the start of the content.
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }

  return (
    <nav
      aria-label={labels.list}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-30 md:bottom-auto md:top-1/2 md:-translate-y-1/2 print:hidden"
    >
      <ul className="flex flex-col gap-2">
        {showBackToTop ? (
          <li>
            <button type="button" onClick={backToTop} aria-label={labels.backToTop} title={labels.backToTop} className={BUTTON}>
              <ArrowUp aria-hidden className="size-4" />
            </button>
          </li>
        ) : null}
        {links.map((link) => {
          const external = link.platform !== "email";
          return (
            <li key={link.href}>
              <a
                href={link.href}
                title={link.label}
                className={BUTTON}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {link.platform === "email" ? (
                  <FaEnvelope aria-hidden className="size-4" />
                ) : (
                  <SocialIcon platform={link.platform} className="size-4" />
                )}
                <span className="sr-only">
                  {link.label}
                  {external ? ` ${labels.opensInNewTab}` : null}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
