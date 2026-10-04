import type { Metadata } from "next";
import { FaEnvelope } from "react-icons/fa6";

import { formatMessage, getContent, getFirstName, getProfileMessageValues } from "@/content";
import { isContactFormEnabled } from "@/lib/contact/config";
import { ContactForm } from "@/shared/components/ContactForm";
import { ContentLink } from "@/shared/components/ContentLink";
import { SocialIcon } from "@/shared/components/SocialIcon";
import { resolveLocale } from "@/shared/config/site";
import type { ParamsLocale } from "@/shared/types";
import { buildPageMetadata } from "@/shared/utils/seo";
import { CARD, CONTAINER, PAGE_INTRO, PAGE_SPACING, PAGE_TITLE, cx } from "@/shared/utils/styles";

export async function generateMetadata({ params }: ParamsLocale): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const { profile, messages } = getContent(locale);
  return buildPageMetadata({
    locale,
    page: "contact",
    title: messages.contact.title,
    description: formatMessage(messages.meta.descriptions.contact, getProfileMessageValues(profile)),
  });
}

const CARD_TITLE = "text-lg font-semibold tracking-tight text-ink";

export default async function ContactPage({ params }: ParamsLocale) {
  const locale = resolveLocale((await params).locale);
  const { profile, messages } = getContent(locale);
  const copy = messages.contact;
  const firstName = getFirstName(profile);
  const { email, availability, responseTime, social } = profile.contact;
  const location = profile.person.location;
  const showForm = isContactFormEnabled();

  const details = [
    { title: copy.availabilityTitle, value: availability },
    { title: copy.responseTimeTitle, value: responseTime },
    { title: copy.locationTitle, value: location },
  ].filter((detail): detail is { title: string; value: string } => Boolean(detail.value));

  return (
    <div className={cx(CONTAINER, PAGE_SPACING)}>
      <header className="max-w-3xl">
        <h1 className={PAGE_TITLE}>{copy.title}</h1>
        <p className={PAGE_INTRO}>{formatMessage(email ? copy.intro : copy.introNoEmail, { firstName })}</p>
      </header>

      <div className={cx("mt-10 grid gap-6", showForm ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : "max-w-3xl")}>
        <div className="min-w-0 space-y-6">
          {email ? (
            <section className={cx(CARD, "p-6 sm:p-8")}>
              <h2 className={CARD_TITLE}>{copy.emailLabel}</h2>
              <a
                href={`mailto:${email}`}
                className="mt-3 inline-flex max-w-full items-center gap-3 text-xl font-semibold text-ink underline decoration-muted/40 underline-offset-4 transition-colors hover:decoration-ink sm:text-2xl"
              >
                <FaEnvelope aria-hidden className="h-5 w-5 shrink-0 text-muted" />
                <span className="min-w-0 break-all">{email}</span>
              </a>
            </section>
          ) : null}

          {details.length > 0 ? (
            <dl className={cx(CARD, "space-y-5 p-6 sm:p-8")}>
              {details.map((detail) => (
                <div key={detail.title}>
                  <dt className="text-sm font-medium text-muted">{detail.title}</dt>
                  <dd className="mt-1 text-base leading-7 text-ink">{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {social.length > 0 ? (
            <section className={cx(CARD, "p-6 sm:p-8")}>
              <h2 className={CARD_TITLE}>{copy.socialTitle}</h2>
              <ul className="mt-4 space-y-3">
                {social.map((link, index) => (
                  <li key={`${index}-${link.href}`} className="min-w-0">
                    <ContentLink
                      href={link.href}
                      newTabLabel={messages.common.opensInNewTab}
                      className="inline-flex max-w-full items-center gap-3 font-medium text-ink underline-offset-4 hover:underline"
                    >
                      <SocialIcon platform={link.platform} className="h-5 w-5 shrink-0 text-muted" />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{link.label}</span>
                    </ContentLink>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {showForm ? (
          <section className={cx(CARD, "min-w-0 p-6 sm:p-8")}>
            <h2 className={CARD_TITLE}>{copy.form.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{formatMessage(copy.form.description, { firstName })}</p>
            <div className="mt-6">
              <ContactForm copy={copy.form} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
