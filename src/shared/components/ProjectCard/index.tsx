import Link from "next/link";

import type { SiteMessages } from "@/content";
import { formatPeriod } from "@/content/format";
import type { Project } from "@/content/schema";
import { ChipList } from "@/shared/components/ChipList";
import { ContentLink } from "@/shared/components/ContentLink";
import type { Locale } from "@/shared/config/site";
import { CARD, TEXT_LINK, cx } from "@/shared/utils/styles";

type ProjectCardProps = {
  project: Project;
  locale: Locale;
  labels: SiteMessages["common"];
  /** `h2` when the card sits directly under the page title, `h3` under a section title. */
  headingLevel?: "h2" | "h3";
  /**
   * Home page variant: title, meta line, summary and stack only. With `href`, the
   * title links to the full card on the Projects page.
   */
  compact?: boolean;
  href?: string;
};

/** DOM id of a project's card on the Projects page (for `/projects#project-…` links). */
export function getProjectAnchorId(projectId: string) {
  return `project-${projectId}`;
}

export function ProjectCard({
  project,
  locale,
  labels,
  headingLevel: Heading = "h3",
  compact = false,
  href,
}: ProjectCardProps) {
  const meta = [project.status, project.period ? formatPeriod(project.period, locale, labels) : null]
    .filter(Boolean)
    .join(" · ");
  const highlights = compact ? [] : (project.highlights ?? []);
  const links = compact ? [] : (project.links ?? []);

  return (
    <article
      id={compact ? undefined : getProjectAnchorId(project.id)}
      className={cx(CARD, "flex h-full flex-col p-6 print:break-inside-avoid print:shadow-none")}
    >
      <Heading className="text-lg font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
        {href ? (
          <Link href={href} className="underline-offset-4 hover:underline">
            {project.title}
          </Link>
        ) : (
          project.title
        )}
      </Heading>
      {meta ? <p className="mt-1 text-sm text-muted">{meta}</p> : null}

      <p className="mt-3 text-sm leading-6 text-muted">{project.summary}</p>

      {highlights.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink marker:text-muted">
          {highlights.map((highlight, index) => (
            <li key={index}>{highlight}</li>
          ))}
        </ul>
      ) : null}

      {!compact && project.role ? (
        <p className="mt-4 text-sm leading-6">
          <span className="font-medium text-ink">{labels.role}:</span>{" "}
          <span className="text-muted">{project.role}</span>
        </p>
      ) : null}

      {project.stack?.length ? <ChipList items={project.stack} label={labels.stack} className="mt-4" /> : null}

      {links.length > 0 ? (
        <ul aria-label={labels.links} className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-5 text-sm">
          {links.map((link, index) => (
            <li key={`${index}-${link.href}`} className="min-w-0">
              <ContentLink href={link.href} newTabLabel={labels.opensInNewTab} className={TEXT_LINK}>
                {link.label}
              </ContentLink>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
