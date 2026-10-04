import { FaGithub } from "react-icons/fa6";

import { ContentLink } from "@/shared/components/ContentLink";
import { CONTAINER, cx } from "@/shared/utils/styles";

export type DemoBannerProps = {
  /** `profile.isExample`: the banner exists only while the bundled example profile is in place. */
  isExample: boolean | undefined;
  /** Where the call to action points (the template's repository). */
  href: string;
  labels: {
    /** Accessible name of the banner. */
    label: string;
    text: string;
    cta: string;
    opensInNewTab: string;
  };
};

/**
 * A slim strip above the header on the example profile: it says the site is an open-source demo
 * with a fictional profile and links to the source. Setting `isExample: false` removes it.
 */
export function DemoBanner({ isExample, href, labels }: DemoBannerProps) {
  if (!isExample) {
    return null;
  }

  return (
    <aside aria-label={labels.label} className="border-b border-line bg-subtle print:hidden">
      <p
        className={cx(
          CONTAINER,
          "flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 py-2 text-center text-xs leading-5 text-muted"
        )}
      >
        <span>{labels.text}</span>
        <ContentLink
          href={href}
          newTabLabel={labels.opensInNewTab}
          className="inline-flex items-center rounded-sm font-medium text-ink underline underline-offset-4 hover:decoration-2"
        >
          <FaGithub aria-hidden className="mr-1.5 h-3.5 w-3.5 shrink-0" />
          {labels.cta}
        </ContentLink>
      </p>
    </aside>
  );
}
