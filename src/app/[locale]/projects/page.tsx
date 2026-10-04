import type { Metadata } from "next";

import {
  formatMessage,
  getContent,
  getFirstName,
  getProfileMessageValues,
  type SiteMessages,
} from "@/content";
import type { Project } from "@/content/schema";
import { ProjectCard } from "@/shared/components/ProjectCard";
import { resolveLocale, type Locale } from "@/shared/config/site";
import type { ParamsLocale } from "@/shared/types";
import { groupProjectsByCategory } from "@/shared/utils/content";
import { buildPageMetadata } from "@/shared/utils/seo";
import { CONTAINER, PAGE_INTRO, PAGE_SPACING, PAGE_TITLE, SECTION_TITLE, cx } from "@/shared/utils/styles";

export async function generateMetadata({ params }: ParamsLocale): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const { profile, messages } = getContent(locale);
  return buildPageMetadata({
    locale,
    page: "projects",
    title: messages.projects.title,
    description: formatMessage(messages.meta.descriptions.projects, getProfileMessageValues(profile)),
  });
}

function ProjectGrid({
  projects,
  locale,
  labels,
  headingLevel,
}: {
  projects: Project[];
  locale: Locale;
  labels: SiteMessages["common"];
  headingLevel: "h2" | "h3";
}) {
  return (
    <ul className="grid gap-6 md:grid-cols-2">
      {projects.map((project) => (
        <li key={project.id} className="min-w-0">
          <ProjectCard project={project} locale={locale} labels={labels} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}

export default async function ProjectsPage({ params }: ParamsLocale) {
  const locale = resolveLocale((await params).locale);
  const { profile, messages } = getContent(locale);
  const groups = groupProjectsByCategory(profile.projects, messages.projects.otherCategory);

  return (
    <div className={cx(CONTAINER, PAGE_SPACING)}>
      <header className="max-w-3xl">
        <h1 className={PAGE_TITLE}>{messages.projects.title}</h1>
        <p className={PAGE_INTRO}>
          {formatMessage(messages.projects.intro, { firstName: getFirstName(profile) })}
        </p>
      </header>

      {groups ? (
        groups.map((group, index) => (
          <section key={`${index}-${group.label}`} className="mt-12">
            <h2 className={SECTION_TITLE}>{group.label}</h2>
            <div className="mt-6">
              <ProjectGrid projects={group.projects} locale={locale} labels={messages.common} headingLevel="h3" />
            </div>
          </section>
        ))
      ) : (
        <div className="mt-12">
          <ProjectGrid projects={profile.projects} locale={locale} labels={messages.common} headingLevel="h2" />
        </div>
      )}
    </div>
  );
}
