import type { ReactNode } from "react";
import { FaArrowUpRightFromSquare } from "react-icons/fa6";

import { isExternalHref } from "@/shared/utils/content";

type ContentLinkProps = {
  /** An `https://` URL, a `mailto:` address or a site path such as `/files/report.pdf`. */
  href: string;
  children: ReactNode;
  /** Screen-reader hint for links that open in a new tab (`messages.common.opensInNewTab`). */
  newTabLabel: string;
  className?: string;
  /** Show the "opens elsewhere" icon after the text. */
  showIcon?: boolean;
};

/**
 * A link from the content files. Web links open in a new tab with a visible icon and a
 * screen-reader hint; site paths and `mailto:` links open in place.
 */
export function ContentLink({ href, children, newTabLabel, className, showIcon = true }: ContentLinkProps) {
  if (!isExternalHref(href)) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      {showIcon ? (
        <FaArrowUpRightFromSquare aria-hidden className="ml-1.5 inline-block h-3 w-3 shrink-0 align-[-1px]" />
      ) : null}
      <span className="sr-only"> {newTabLabel}</span>
    </a>
  );
}
