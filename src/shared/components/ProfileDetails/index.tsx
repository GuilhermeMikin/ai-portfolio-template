/**
 * Profile blocks rendered by both the About and the Resume pages. Each one renders
 * nothing when its list is empty, so pages can place them unconditionally.
 */
import { formatPeriod, formatYearMonth } from "@/content/format";
import type { Certification, Education, Profile, SpokenLanguage } from "@/content/schema";
import { ChipList } from "@/shared/components/ChipList";
import { ContentLink } from "@/shared/components/ContentLink";
import type { Locale } from "@/shared/config/site";
import { TEXT_LINK, cx } from "@/shared/utils/styles";

type PeriodLabels = { present: string; periodRange: string };

export function SkillGroups({ skills, className }: { skills: Profile["skills"]; className?: string }) {
  if (skills.length === 0) {
    return null;
  }

  return (
    <div className={cx("grid gap-x-8 gap-y-5 sm:grid-cols-2", className)}>
      {skills.map((group, index) => (
        <div key={`${index}-${group.group}`} className="min-w-0">
          <h3 className="text-sm font-medium text-muted">{group.group}</h3>
          <ChipList items={group.items} className="mt-2" />
        </div>
      ))}
    </div>
  );
}

export function EducationList({
  items,
  locale,
  labels,
}: {
  items: Education[];
  locale: Locale;
  labels: PeriodLabels & { opensInNewTab: string };
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-6">
      {items.map((item) => (
        <li key={item.id} className="min-w-0 print:break-inside-avoid">
          <h3 className="font-semibold text-ink">{item.degree}</h3>
          <p className="mt-0.5 text-sm text-ink">
            {item.institutionUrl ? (
              <ContentLink href={item.institutionUrl} newTabLabel={labels.opensInNewTab} className={TEXT_LINK}>
                {item.institution}
              </ContentLink>
            ) : (
              item.institution
            )}
            {item.location ? <span className="text-muted"> · {item.location}</span> : null}
          </p>
          <p className="mt-0.5 text-sm text-muted">{formatPeriod(item.period, locale, labels)}</p>
          {item.details?.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
              {item.details.map((detail, index) => (
                <li key={index}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function CertificationList({
  items,
  locale,
  newTabLabel,
}: {
  items: Certification[];
  locale: Locale;
  newTabLabel: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-4">
      {items.map((item, index) => (
        <li key={`${index}-${item.name}`} className="min-w-0 print:break-inside-avoid">
          <p className="font-medium text-ink">
            {item.url ? (
              <ContentLink href={item.url} newTabLabel={newTabLabel} className={TEXT_LINK}>
                {item.name}
              </ContentLink>
            ) : (
              item.name
            )}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {item.issuer}
            {item.date ? ` · ${formatYearMonth(item.date, locale)}` : null}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function LanguageList({ items }: { items: SpokenLanguage[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <dl className="divide-y divide-line">
      {items.map((item, index) => (
        <div key={`${index}-${item.name}`} className="flex flex-wrap justify-between gap-x-4 py-2 first:pt-0 last:pb-0">
          <dt className="font-medium text-ink">{item.name}</dt>
          <dd className="text-muted">{item.level}</dd>
        </div>
      ))}
    </dl>
  );
}
