import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";

import { formatMessage, getContent, getProfileMessageValues } from "@/content";
import {
  CertificationList,
  EducationList,
  LanguageList,
  SkillGroups,
} from "@/shared/components/ProfileDetails";
import { resolveLocale } from "@/shared/config/site";
import type { ParamsLocale } from "@/shared/types";
import { buildPageMetadata } from "@/shared/utils/seo";
import { CARD, CONTAINER, PAGE_SPACING, PAGE_TITLE, cx } from "@/shared/utils/styles";

export async function generateMetadata({ params }: ParamsLocale): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const { profile, messages } = getContent(locale);
  return buildPageMetadata({
    locale,
    page: "about",
    title: messages.about.title,
    description: formatMessage(messages.meta.descriptions.about, getProfileMessageValues(profile)),
  });
}

function AboutSection({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={cx(CARD, "min-w-0 p-6 sm:p-8", className)}>
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-base leading-7 text-ink marker:text-muted">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export default async function AboutPage({ params }: ParamsLocale) {
  const locale = resolveLocale((await params).locale);
  const { profile, messages } = getContent(locale);
  const { photo } = profile.person;
  const focusAreas = profile.about.highlights ?? [];
  const interests = profile.about.interests ?? [];
  const education = profile.education ?? [];
  const certifications = profile.certifications ?? [];
  const languages = profile.languages ?? [];
  const labels = messages.about;

  return (
    <div className={cx(CONTAINER, PAGE_SPACING)}>
      <header className="flex flex-col gap-8 sm:flex-row sm:items-start">
        {photo ? (
          <div className="relative aspect-square w-32 shrink-0 overflow-hidden rounded-2xl border border-line bg-subtle sm:w-40">
            <Image src={photo.src} alt={photo.alt} fill sizes="160px" loading="eager" className="object-cover" />
          </div>
        ) : null}
        <div className="min-w-0 max-w-3xl">
          <h1 className={cx(PAGE_TITLE, "break-words")}>
            {formatMessage(labels.heading, { name: profile.person.name })}
          </h1>
          <div className="mt-6 space-y-4 text-base leading-7 text-ink sm:text-lg sm:leading-8">
            {profile.about.bio.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      </header>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {focusAreas.length > 0 ? (
          <AboutSection title={labels.highlightsTitle} className="md:col-span-2">
            <BulletList items={focusAreas} />
          </AboutSection>
        ) : null}

        {profile.skills.length > 0 ? (
          <AboutSection title={labels.skillsTitle} className="md:col-span-2">
            <SkillGroups skills={profile.skills} />
          </AboutSection>
        ) : null}

        {education.length > 0 ? (
          <AboutSection title={labels.educationTitle}>
            <EducationList items={education} locale={locale} labels={messages.common} />
          </AboutSection>
        ) : null}

        {certifications.length > 0 ? (
          <AboutSection title={labels.certificationsTitle}>
            <CertificationList items={certifications} locale={locale} newTabLabel={messages.common.opensInNewTab} />
          </AboutSection>
        ) : null}

        {languages.length > 0 ? (
          <AboutSection title={labels.languagesTitle}>
            <LanguageList items={languages} />
          </AboutSection>
        ) : null}

        {interests.length > 0 ? (
          <AboutSection title={labels.interestsTitle}>
            <BulletList items={interests} />
          </AboutSection>
        ) : null}
      </div>
    </div>
  );
}
