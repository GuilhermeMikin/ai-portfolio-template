import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  formatMessage,
  formatPeriod,
  getContent,
  getFeaturedProjects,
  getFirstName,
} from "@/content";
import { CONTENT_LIMITS } from "@/content/schema";
import { HomeAssistant } from "@/shared/components/HomeAssistant";
import { ProjectCard, getProjectAnchorId } from "@/shared/components/ProjectCard";
import { resolveLocale } from "@/shared/config/site";
import { getSitePagePath } from "@/shared/config/site-links";
import type { ParamsLocale } from "@/shared/types";
import { sortByMostRecent } from "@/shared/utils/content";
import { buildPageMetadata } from "@/shared/utils/seo";
import {
  ARROW_LINK,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD,
  CONTAINER,
  SECTION_TITLE,
  cx,
} from "@/shared/utils/styles";

const RECENT_ROLES_SHOWN = 3;

export async function generateMetadata({ params }: ParamsLocale): Promise<Metadata> {
  // No `title`: the home page keeps the site's default title.
  return buildPageMetadata({ locale: resolveLocale((await params).locale), page: "" });
}

function SectionHeader({ title, link }: { title: string; link?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <h2 className={SECTION_TITLE}>{title}</h2>
      {link ? (
        <Link href={link.href} className={ARROW_LINK}>
          {link.label}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

export default async function HomePage({ params }: ParamsLocale) {
  const locale = resolveLocale((await params).locale);
  const { profile, messages } = getContent(locale);
  const { person } = profile;
  const firstName = getFirstName(profile);
  const projectsHref = getSitePagePath(locale, "projects");
  const contactHref = getSitePagePath(locale, "contact");

  const featuredProjects = getFeaturedProjects(profile, CONTENT_LIMITS.featuredProjectsShown);
  const recentRoles = sortByMostRecent(profile.experience).slice(0, RECENT_ROLES_SHOWN);
  const aboutSnippet = profile.about.bio[0];

  return (
    <div className={cx(CONTAINER, "pb-20")}>
      <section className="mx-auto max-w-3xl pb-12 pt-16 text-center sm:pt-24">
        <h1 className="break-words text-4xl font-semibold tracking-tight text-ink sm:text-5xl">{person.name}</h1>
        <p className="mt-4 text-lg font-medium text-ink sm:text-xl">{person.headline}</p>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg sm:leading-8">
          {person.summary}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={projectsHref} className={BUTTON_PRIMARY}>
            {messages.home.viewProjects}
          </Link>
          <Link href={contactHref} className={BUTTON_SECONDARY}>
            {messages.home.getInTouch}
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-3xl">
        <HomeAssistant suggestedQuestions={profile.assistant.suggestedQuestions} />
      </div>

      {featuredProjects.length > 0 ? (
        <section className="mt-20">
          <SectionHeader
            title={messages.home.featuredTitle}
            link={{ href: projectsHref, label: messages.home.allProjects }}
          />
          <ul className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {featuredProjects.map((project) => (
              <li key={project.id} className="min-w-0">
                <ProjectCard
                  project={project}
                  locale={locale}
                  labels={messages.common}
                  compact
                  href={`${projectsHref}#${getProjectAnchorId(project.id)}`}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {recentRoles.length > 0 ? (
        <section className="mt-20">
          <SectionHeader
            title={messages.home.experienceTitle}
            link={{ href: getSitePagePath(locale, "resume"), label: messages.home.viewResume }}
          />
          <ul className={cx(CARD, "mt-6 divide-y divide-line")}>
            {recentRoles.map((role) => (
              <li
                key={role.id}
                className="flex flex-col gap-1 p-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6 sm:p-6"
              >
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink">{role.role}</h3>
                  <p className="mt-0.5 text-sm text-muted">{role.organization}</p>
                </div>
                <p className="shrink-0 text-sm text-muted">{formatPeriod(role.period, locale, messages.common)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {aboutSnippet ? (
        <section className="mt-20">
          <SectionHeader title={messages.home.aboutTitle} />
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted sm:text-lg sm:leading-8">{aboutSnippet}</p>
          <Link href={getSitePagePath(locale, "about")} className={cx(ARROW_LINK, "mt-5")}>
            {formatMessage(messages.home.aboutCta, { firstName })}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </section>
      ) : null}

      <section className="mt-20 rounded-2xl bg-strong px-6 py-12 text-center text-on-strong sm:px-12 sm:py-16">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{messages.home.contactTitle}</h2>
        <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-on-strong/80">
          {formatMessage(messages.home.contactText, { firstName })}
        </p>
        <Link
          href={contactHref}
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-xl bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-subtle focus-visible:outline-on-strong"
        >
          {formatMessage(messages.home.contactCta, { firstName })}
        </Link>
      </section>
    </div>
  );
}
