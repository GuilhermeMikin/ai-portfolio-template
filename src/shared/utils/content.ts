/**
 * Presentation helpers for profile data. Pure and client-safe.
 */
import type { Period, Project, YearMonth } from "@/content/schema";

export type ProjectGroup = { label: string; projects: Project[] };

/**
 * Groups projects by `category` in order of first appearance, with uncategorized
 * projects last under `otherLabel`. Returns `null` when no project has a category.
 */
export function groupProjectsByCategory(projects: Project[], otherLabel: string): ProjectGroup[] | null {
  if (!projects.some((project) => project.category?.trim())) {
    return null;
  }

  const groups = new Map<string, Project[]>();
  const uncategorized: Project[] = [];
  for (const project of projects) {
    const category = project.category?.trim();
    if (!category) {
      uncategorized.push(project);
      continue;
    }
    const group = groups.get(category);
    if (group) {
      group.push(project);
    } else {
      groups.set(category, [project]);
    }
  }

  const result = [...groups].map(([label, items]) => ({ label, projects: items }));
  if (uncategorized.length > 0) {
    result.push({ label: otherLabel, projects: uncategorized });
  }
  return result;
}

function toSortKey(value: YearMonth) {
  return value.length === 4 ? `${value}-01` : value;
}

/** Most recent first: ongoing entries, then by end date, then by start date. Stable for ties. */
export function sortByMostRecent<T extends { period: Period }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const leftEnd = left.period.end ? toSortKey(left.period.end) : "9999-12";
    const rightEnd = right.period.end ? toSortKey(right.period.end) : "9999-12";
    return (
      rightEnd.localeCompare(leftEnd) ||
      toSortKey(right.period.start).localeCompare(toSortKey(left.period.start))
    );
  });
}

/** Web links open in a new tab; site paths and `mailto:` links stay in the current one. */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * A link as it is written on paper, for printed pages: no scheme, no "www." and no trailing
 * slash (`https://www.example.com/in/ada/` → `example.com/in/ada`, `mailto:ada@example.com`
 * → `ada@example.com`). Returns null for anything but http(s) and mailto links.
 */
export function formatPrintableHref(href: string): string | null {
  const match = /^(?:https?:\/\/|mailto:)(.*)$/i.exec(href.trim());
  const text = match?.[1].replace(/^www\./i, "").replace(/\/+$/, "");
  return text || null;
}
