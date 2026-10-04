/**
 * Class names shared by the pages so spacing, cards and buttons stay consistent.
 * Only theme tokens (canvas, surface, subtle, ink, muted, line, strong, on-strong).
 */

/** Joins class names, skipping empty values. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Centered column used by the header, the footer and every page. */
export const CONTAINER = "mx-auto w-full max-w-5xl px-4 sm:px-6";

/** Vertical rhythm for inner pages (About, Projects, Resume, Contact). */
export const PAGE_SPACING = "py-12 sm:py-16";

export const PAGE_TITLE = "text-3xl font-semibold tracking-tight text-ink sm:text-4xl";
export const PAGE_INTRO = "mt-4 text-lg leading-8 text-muted";
export const SECTION_TITLE = "text-xl font-semibold tracking-tight text-ink sm:text-2xl";

export const CARD = "rounded-2xl border border-line bg-surface shadow-card";

const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-center text-sm font-semibold transition-colors";
export const BUTTON_PRIMARY = `${BUTTON} bg-strong text-on-strong hover:bg-strong/90`;
export const BUTTON_SECONDARY = `${BUTTON} border border-line bg-surface text-ink hover:bg-subtle`;

/** Underlined link inside running text. */
export const TEXT_LINK =
  "font-medium text-ink underline decoration-muted/40 underline-offset-4 transition-colors hover:decoration-ink";

/** "All projects →" style link next to a section title. */
export const ARROW_LINK =
  "inline-flex items-center gap-1.5 text-sm font-semibold text-ink underline-offset-4 hover:underline";
