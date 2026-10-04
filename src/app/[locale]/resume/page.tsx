import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FaDownload, FaEnvelope } from "react-icons/fa6";

import {
  formatMessage,
  formatPeriod,
  formatYearMonth,
  getContent,
  getProfileMessageValues,
} from "@/content";
import { ChipList } from "@/shared/components/ChipList";
import { ContentLink } from "@/shared/components/ContentLink";
import {
  CertificationList,
  EducationList,
  LanguageList,
  SkillGroups,
} from "@/shared/components/ProfileDetails";
import { SocialIcon } from "@/shared/components/SocialIcon";
import { resolveLocale } from "@/shared/config/site";
import type { ParamsLocale } from "@/shared/types";
import { formatPrintableHref, isExternalHref, sortByMostRecent } from "@/shared/utils/content";
import { buildPageMetadata } from "@/shared/utils/seo";
import { BUTTON_PRIMARY, PAGE_SPACING, TEXT_LINK, cx } from "@/shared/utils/styles";

export async function generateMetadata({ params }: ParamsLocale): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const { profile, messages } = getContent(locale);
  return buildPageMetadata({
    locale,
    page: "resume",
    title: messages.resume.title,
    description: formatMessage(messages.meta.descriptions.resume, getProfileMessageValues(profile)),
  });
}

function ResumeSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-8 print:py-5">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

const CONTACT_LINK = "inline-flex max-w-full items-center gap-2 text-ink underline-offset-4 hover:underline";

export default async function ResumePage({ params }: ParamsLocale) {
  const locale = resolveLocale((await params).locale);
  const { profile, messages } = getContent(locale);
  const { person, contact, resume } = profile;
  const experience = sortByMostRecent(profile.experience);
  const education = profile.education ?? [];
  const certifications = profile.certifications ?? [];
  const languages = profile.languages ?? [];
  const pdfHref = resume?.pdf?.href;
  const newTabLabel = messages.common.opensInNewTab;

  return (
    <div className={cx("mx-auto w-full max-w-4xl px-4 sm:px-6 print:max-w-none print:px-0 print:py-0", PAGE_SPACING)}>
      <header className="flex flex-col gap-6 pb-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted print:hidden">{messages.resume.title}</p>
          <h1 className="mt-1 break-words text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {person.name}
          </h1>
          <p className="mt-2 text-lg text-ink">{person.headline}</p>
          {person.location ? <p className="mt-1 text-sm text-muted">{person.location}</p> : null}

          {contact.email || contact.social.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {contact.email ? (
                <li className="min-w-0">
                  <a href={`mailto:${contact.email}`} className={CONTACT_LINK}>
                    <FaEnvelope aria-hidden className="h-4 w-4 shrink-0 text-muted" />
                    <span className="break-all">{contact.email}</span>
                  </a>
                </li>
              ) : null}
              {contact.social.map((link, index) => {
                const printableHref = formatPrintableHref(link.href);
                // Skip it when the label already is the address.
                const printedHref =
                  printableHref?.toLowerCase() === link.label.trim().toLowerCase() ? null : printableHref;
                return (
                  <li key={`${index}-${link.href}`} className="min-w-0">
                    <ContentLink href={link.href} newTabLabel={newTabLabel} showIcon={false} className={CONTACT_LINK}>
                      <SocialIcon platform={link.platform} className="h-4 w-4 shrink-0 text-muted" />
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        {link.label}
                        {/* Paper has no links: print the address too. Hidden on screen and from screen readers. */}
                        {printedHref ? (
                          <span aria-hidden="true" className="hidden text-muted print:inline">
                            {` (${printedHref})`}
                          </span>
                        ) : null}
                      </span>
                    </ContentLink>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {pdfHref ? (
          <a
            href={pdfHref}
            {...(isExternalHref(pdfHref) ? { target: "_blank", rel: "noopener noreferrer" } : { download: "" })}
            className={cx(BUTTON_PRIMARY, "shrink-0 self-start print:hidden")}
          >
            <FaDownload aria-hidden className="h-3.5 w-3.5" />
            {messages.resume.downloadPdf}
            {isExternalHref(pdfHref) ? <span className="sr-only"> {newTabLabel}</span> : null}
          </a>
        ) : null}
      </header>

      {experience.length > 0 ? (
        <ResumeSection title={messages.resume.experienceTitle}>
          <ol className="space-y-8 border-l border-line">
            {experience.map((item) => (
              <li key={item.id} className="relative min-w-0 pl-6 print:break-inside-avoid">
                <span
                  aria-hidden
                  className="absolute -left-[5.5px] top-[0.45rem] h-2.5 w-2.5 rounded-full border-2 border-canvas bg-ink print:border-surface"
                />
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <h3 className="font-semibold text-ink">{item.role}</h3>
                  <p className="shrink-0 text-sm text-muted">{formatPeriod(item.period, locale, messages.common)}</p>
                </div>
                <p className="mt-0.5 text-sm text-ink">
                  {item.organizationUrl ? (
                    <ContentLink href={item.organizationUrl} newTabLabel={newTabLabel} className={TEXT_LINK}>
                      {item.organization}
                    </ContentLink>
                  ) : (
                    item.organization
                  )}
                  {item.location ? <span className="text-muted"> · {item.location}</span> : null}
                </p>
                {item.summary ? <p className="mt-3 text-sm leading-6 text-muted">{item.summary}</p> : null}
                {item.highlights.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink marker:text-muted">
                    {item.highlights.map((highlight, index) => (
                      <li key={index}>{highlight}</li>
                    ))}
                  </ul>
                ) : null}
                {item.stack?.length ? (
                  <ChipList items={item.stack} label={messages.common.stack} className="mt-3" />
                ) : null}
              </li>
            ))}
          </ol>
        </ResumeSection>
      ) : null}

      {education.length > 0 ? (
        <ResumeSection title={messages.resume.educationTitle}>
          <EducationList items={education} locale={locale} labels={messages.common} />
        </ResumeSection>
      ) : null}

      {profile.skills.length > 0 ? (
        <ResumeSection title={messages.resume.skillsTitle}>
          <SkillGroups skills={profile.skills} />
        </ResumeSection>
      ) : null}

      {certifications.length > 0 ? (
        <ResumeSection title={messages.resume.certificationsTitle}>
          <CertificationList items={certifications} locale={locale} newTabLabel={newTabLabel} />
        </ResumeSection>
      ) : null}

      {languages.length > 0 ? (
        <ResumeSection title={messages.resume.languagesTitle}>
          <div className="max-w-md">
            <LanguageList items={languages} />
          </div>
        </ResumeSection>
      ) : null}

      {resume?.updated ? (
        <p className="border-t border-line pt-6 text-sm text-muted">
          {formatMessage(messages.resume.updated, { date: formatYearMonth(resume.updated, locale) })}
        </p>
      ) : null}
    </div>
  );
}
