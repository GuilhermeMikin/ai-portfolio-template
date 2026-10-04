import { FaEnvelope } from "react-icons/fa6";

import { formatMessage, getContent } from "@/content";
import { getChatClientConfig } from "@/lib/ai/config";
import { SocialIcon } from "@/shared/components/SocialIcon";
import type { Locale } from "@/shared/config/site";
import { isExternalHref } from "@/shared/utils/content";
import { CONTAINER, cx } from "@/shared/utils/styles";

const ICON_LINK =
  "inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-subtle hover:text-ink";

/**
 * Bottom padding while the chat is on. The floating launcher (ChatWidget) is fixed in the
 * bottom-left corner on phones and bottom-right from `md`, 48 px tall and 16 px (24 px from
 * `md`) above the viewport's edge, so it reaches up to 72 px. With 96 px of padding, the
 * footer's text and links end above it once the page is scrolled to the bottom.
 */
const CHAT_LAUNCHER_CLEARANCE = "pb-24";

/** Outside the component so render stays pure; static pages get the build year. */
function getCurrentYear() {
  return new Date().getFullYear();
}

export function Footer({ locale }: { locale: Locale }) {
  const { profile, messages } = getContent(locale);
  const name = profile.person.name;
  const { email, social } = profile.contact;
  const hasLinks = Boolean(email) || social.length > 0;
  const reserveLauncherSpace = getChatClientConfig().mode !== "off";

  return (
    // Right padding keeps the footer clear of the floating links (stacked bottom-right on
    // phones, vertically centered on the right edge from md until xl).
    <footer className="border-t border-line bg-surface pr-12 md:pr-14 xl:pr-0 print:hidden">
      <div
        className={cx(
          CONTAINER,
          "flex flex-col gap-4 pt-8 md:flex-row md:items-center md:justify-between",
          reserveLauncherSpace ? CHAT_LAUNCHER_CLEARANCE : "pb-8"
        )}
      >
        <div className="min-w-0 space-y-1 text-sm text-muted">
          <p>{formatMessage(messages.footer.copyright, { year: getCurrentYear(), name })}</p>
          {profile.isExample ? (
            <p className="text-xs">{formatMessage(messages.meta.exampleNotice, { name })}</p>
          ) : null}
        </div>

        {hasLinks ? (
          <ul aria-label={messages.footer.socialLabel} className="-ml-2.5 flex flex-wrap items-center gap-1 md:ml-0">
            {email ? (
              <li>
                <a href={`mailto:${email}`} title={messages.contact.emailLabel} className={ICON_LINK}>
                  <FaEnvelope aria-hidden className="h-4 w-4" />
                  <span className="sr-only">{messages.contact.emailLabel}</span>
                </a>
              </li>
            ) : null}
            {social.map((link, index) => {
              const external = isExternalHref(link.href);
              return (
                <li key={`${index}-${link.href}`}>
                  <a
                    href={link.href}
                    title={link.label}
                    className={ICON_LINK}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    <SocialIcon platform={link.platform} className="h-4 w-4" />
                    <span className="sr-only">
                      {link.label}
                      {external ? ` ${messages.common.opensInNewTab}` : null}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </footer>
  );
}
