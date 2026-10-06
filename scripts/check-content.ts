#!/usr/bin/env tsx
/**
 * Checks the portfolio content of every locale before it ships.
 *
 *   pnpm content:check        (also the first step of `pnpm build`)
 *
 * Across locales it fails when some profiles are marked as real content (`isExample: false`)
 * while others still hold the bundled example (validateExampleFlags()).
 *
 * For each locale in SUPPORTED_LOCALES it:
 *   - validates the profile with validateProfile(): required fields, links, dates, ids,
 *     suggested questions and the files it references under public/;
 *   - compares the messages of a non-default locale with the default locale's (same keys,
 *     value types and {placeholders}) with validateMessages();
 *   - measures the assistant's context. A section that does not fit the budget would be
 *     invisible to the assistant, so it is an error.
 *
 * Exit 0 = no errors (warnings are allowed); 1 = at least one error; 2 = the check crashed.
 */
import fs from "node:fs";
import path from "node:path";

import type { ContentIssue } from "@/content/schema";

/** Above this share of the context budget, a warning suggests keeping new content short. */
const CONTEXT_WARNING_RATIO = 0.9;

const PUBLIC_DIR = path.resolve(process.cwd(), "public");

/**
 * Whether a site path such as `/images/me%20small.jpg` is a file in public/.
 * Decodes %-escapes, ignores any ?query or #hash and never looks outside public/.
 */
function publicFileExists(sitePath: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(sitePath.split(/[?#]/)[0]);
  } catch {
    return false; // Malformed %-escape.
  }

  const filePath = path.join(PUBLIC_DIR, decoded);
  const relative = path.relative(PUBLIC_DIR, filePath);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return false;
  }

  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

const formatNumber = (value: number) => value.toLocaleString("en-US");
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const LOCALE_CODE_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/;
const SITE_URL_VARIABLES = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
];

/** Whether a canonical site URL is configured, in the environment or in a .env file next build reads. */
function hasSiteUrl() {
  if (SITE_URL_VARIABLES.some((name) => process.env[name]?.trim())) return true;
  return [".env.production.local", ".env.local", ".env.production", ".env"].some((file) => {
    try {
      return /^\s*NEXT_PUBLIC_SITE_URL\s*=\s*["']?[^\s"'#]/m.test(fs.readFileSync(path.join(process.cwd(), file), "utf8"));
    } catch {
      return false;
    }
  });
}

async function main(): Promise<number> {
  // Loaded here rather than at the top so that content that fails to load is reported
  // as a crash (exit 2) instead of looking like a validation failure.
  const { contentByLocale } = await import("@/content");
  const { validateExampleFlags, validateMessages, validateProfile } = await import("@/content/schema");
  const { measurePortfolioContext } = await import("@/lib/ai/context-build");
  const { CHAT_MESSAGE_MAX_LENGTH } = await import("@/lib/ai/types");
  const { DEFAULT_LOCALE, SUPPORTED_LOCALES } = await import("@/shared/config/site");

  const defaultMessages = contentByLocale[DEFAULT_LOCALE]?.messages;
  let errorCount = 0;
  let warningCount = 0;

  console.log(`Content check: ${plural(SUPPORTED_LOCALES.length, "locale")} (${SUPPORTED_LOCALES.join(", ")})`);
  if (!hasSiteUrl()) {
    console.log(
      "  · note     NEXT_PUBLIC_SITE_URL is not set: canonical URLs, Open Graph tags and the sitemap " +
        "will use http://localhost:3000. Set it before a production build (Vercel sets a fallback)."
    );
  }

  for (const locale of SUPPORTED_LOCALES) {
    const content = contentByLocale[locale];
    const issues: ContentIssue[] = [];
    const notes: string[] = [];

    if (!LOCALE_CODE_PATTERN.test(locale)) {
      issues.push({
        level: "error",
        path: "SUPPORTED_LOCALES",
        message: `"${locale}" must be a lowercase code such as "en" or "pt-br" (src/shared/config/site.ts)`,
      });
    }

    if (!content) {
      // TypeScript reports this too, but tsx does not type-check.
      issues.push({
        level: "error",
        path: "content",
        message: `"${locale}" is in SUPPORTED_LOCALES but has no entry in contentByLocale (src/content/index.ts)`,
      });
    } else {
      issues.push(
        ...validateProfile(content.profile, {
          assetExists: publicFileExists,
          maxMessageLength: CHAT_MESSAGE_MAX_LENGTH,
        })
      );

      if (locale !== DEFAULT_LOCALE && defaultMessages) {
        issues.push(...validateMessages(defaultMessages, content.messages, locale));
      }

      const context = measurePortfolioContext(locale);
      const share = context.maxLength > 0 ? context.length / context.maxLength : 1;
      notes.push(
        `context  ${formatNumber(context.length)} of ${formatNumber(context.maxLength)} characters ` +
          `(${Math.round(share * 100)}% of the assistant's budget)`
      );
      if (context.omittedSections.length > 0) {
        issues.push({
          level: "error",
          path: "assistant context",
          message:
            `the assistant would not see: ${context.omittedSections.join(", ")}. ` +
            "Shorten the content, or raise CHAT_CONTEXT_MAX_CHARS in src/lib/ai/types.ts " +
            "(a larger context costs more tokens on every chat request).",
        });
      } else if (share >= CONTEXT_WARNING_RATIO) {
        issues.push({
          level: "warning",
          path: "assistant context",
          message: `uses ${Math.round(share * 100)}% of its budget; content added later may not reach the assistant`,
        });
      }

      if (content.profile.isExample) {
        notes.push(
          `hint     src/content/${locale}/profile.ts still holds the example profile (${content.profile.person.name}). ` +
            "Replace it with your own content and set isExample: false. Until then the site shows a " +
            "demo banner and an example notice, and asks search engines not to index it."
        );
      }
    }

    const errors = issues.filter((issue) => issue.level === "error");
    const warnings = issues.filter((issue) => issue.level === "warning");
    errorCount += errors.length;
    warningCount += warnings.length;

    console.log(`\n${locale}${locale === DEFAULT_LOCALE ? " (default locale)" : ""}`);
    for (const issue of errors) console.log(`  ✗ error    ${issue.path}: ${issue.message}`);
    for (const issue of warnings) console.log(`  ! warning  ${issue.path}: ${issue.message}`);
    if (issues.length === 0) console.log("  ✓ no problems found");
    for (const note of notes) console.log(`  · ${note}`);
  }

  const crossLocaleIssues = validateExampleFlags(
    Object.fromEntries(
      SUPPORTED_LOCALES.flatMap((locale) => (contentByLocale[locale] ? [[locale, contentByLocale[locale].profile]] : []))
    )
  );
  if (crossLocaleIssues.length > 0) {
    errorCount += crossLocaleIssues.length;
    console.log("\nall locales");
    for (const issue of crossLocaleIssues) console.log(`  ✗ error    ${issue.path}: ${issue.message}`);
  }

  console.log("");
  if (errorCount > 0) {
    console.log(
      `✗ ${plural(errorCount, "error")}, ${plural(warningCount, "warning")}. ` +
        "Fix the errors above, then run pnpm content:check again."
    );
    return 1;
  }

  console.log(`✓ Content OK (${plural(warningCount, "warning")}).`);
  return 0;
}

main().then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    console.error("✗ The content check crashed:");
    console.error(error);
    process.exitCode = 2;
  }
);
