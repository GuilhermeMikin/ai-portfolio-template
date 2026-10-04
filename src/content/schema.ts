/**
 * Content model for the portfolio.
 *
 * Everything the site renders about its owner — and everything the AI assistant is
 * allowed to know — comes from a `Profile` object (see `src/content/<locale>/profile.ts`).
 * Keep it factual: the assistant treats this file as its only source of truth and will
 * repeat anything written here to visitors, so never put private data in it.
 *
 * `validateProfile()` is a dependency-free validator. It runs in `pnpm content:check`
 * (and therefore before `pnpm build`) and in the test suite.
 */

/** `YYYY` or `YYYY-MM`. Rendered with the visitor's locale (e.g. "Feb 2024"). */
export type YearMonth = string;

export type Period = {
  start: YearMonth;
  /** Omit for an ongoing role or project ("Present"). */
  end?: YearMonth;
};

export type Link = {
  label: string;
  /** Absolute `https://` URL, `mailto:` address, or a site-relative path such as `/files/report.pdf`. */
  href: string;
};

export type SocialPlatform =
  | "github"
  | "gitlab"
  | "linkedin"
  | "x"
  | "bluesky"
  | "mastodon"
  | "youtube"
  | "dribbble"
  | "behance"
  | "medium"
  | "whatsapp"
  | "website"
  | "other";

export type SocialLink = {
  /** Picks the icon. Use "website" or "other" for anything not listed. */
  platform: SocialPlatform;
  /** Visible text and accessible name, e.g. "GitHub". */
  label: string;
  href: string;
};

export type ImageAsset = {
  /** Path of a file in `public/`, e.g. `/images/me.jpg`. */
  src: string;
  alt: string;
};

export type Experience = {
  /** Stable, unique slug (lowercase letters, digits and dashes). */
  id: string;
  role: string;
  organization: string;
  organizationUrl?: string;
  location?: string;
  period: Period;
  /** One or two sentences shown above the highlights. */
  summary?: string;
  highlights: string[];
  stack?: string[];
};

export type Project = {
  /** Stable, unique slug (lowercase letters, digits and dashes). */
  id: string;
  title: string;
  /** One to three sentences. Shown on cards and given to the assistant. */
  summary: string;
  role?: string;
  period?: Period;
  /** Free text such as "Live", "Open source" or "Archived". */
  status?: string;
  /** Optional grouping label on the Projects page (e.g. "Client work"). */
  category?: string;
  /** Featured projects appear on the home page (the first three are shown). */
  featured?: boolean;
  highlights?: string[];
  stack?: string[];
  links?: Link[];
};

export type Education = {
  id: string;
  degree: string;
  institution: string;
  institutionUrl?: string;
  location?: string;
  period: Period;
  details?: string[];
};

export type Certification = {
  name: string;
  issuer: string;
  date?: YearMonth;
  url?: string;
};

export type SpokenLanguage = {
  name: string;
  level: string;
};

export type FaqEntry = {
  question: string;
  answer: string;
};

export type Profile = {
  /**
   * `true` while the site still shows the bundled fictional example. It adds a visible
   * "example profile" notice and asks search engines not to index the site.
   * Set it to `false` (or delete it) once the content is yours.
   */
  isExample?: boolean;

  person: {
    name: string;
    /** Used in sentences such as "Ask about Jordan's work". Defaults to the first word of `name`. */
    shortName?: string;
    /** Role or specialty, e.g. "Product engineer — TypeScript, Python & applied AI". */
    headline: string;
    /** One or two sentences for the home page introduction. */
    summary: string;
    location?: string;
    /** Optional portrait shown on the About page. */
    photo?: ImageAsset;
  };

  brand?: {
    /**
     * Optional logo shown in the header instead of the text name; the name stays its
     * accessible label. `src` is a file in `public/`; width and height are the image's
     * intrinsic size in pixels.
     */
    logo?: { src: string; width: number; height: number };
  };

  about: {
    /** Paragraphs for the About page. The first one is also used on the home page. */
    bio: string[];
    /** "Focus areas" bullets. */
    highlights?: string[];
    /** "Beyond work" bullets. */
    interests?: string[];
  };

  skills: { group: string; items: string[] }[];
  experience: Experience[];
  projects: Project[];
  education?: Education[];
  certifications?: Certification[];
  languages?: SpokenLanguage[];

  contact: {
    email?: string;
    /** Stated availability. The assistant repeats it verbatim in meaning and never goes beyond it. */
    availability?: string;
    responseTime?: string;
    social: SocialLink[];
  };

  resume?: {
    /** Optional downloadable CV, e.g. `{ href: "/resume.pdf" }` with the file in `public/`. */
    pdf?: { href: string };
    /** Shown as "Last updated …", e.g. "2026-09". */
    updated?: YearMonth;
  };

  seo?: {
    /** Defaults to "<name> — <headline>". */
    title?: string;
    /** Defaults to `person.summary`. */
    description?: string;
    keywords?: string[];
  };

  assistant: {
    /** How the assistant introduces itself, e.g. "Jordan's AI assistant". */
    name: string;
    /** Up to three questions offered on the home page. Each must be answerable from this file. */
    suggestedQuestions: string[];
    /** Extra public knowledge for the assistant. Anything here may be shown to visitors. */
    faq?: FaqEntry[];
    /** Optional guidance on tone, answer length and what to bring up. It cannot override the built-in rules. */
    instructions?: string[];
  };
};

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export type ContentIssue = {
  level: "error" | "warning";
  /** Dot path inside the profile, e.g. `projects[2].links[0].href`. */
  path: string;
  message: string;
};

export const CONTENT_LIMITS = {
  summaryMaxChars: 280,
  suggestedQuestionsMax: 3,
  /** Keep in sync with CHAT_MESSAGE_MAX_LENGTH: a suggestion is sent as a chat message. */
  suggestedQuestionMaxChars: 200,
  featuredProjectsShown: 3,
} as const;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const YEAR_MONTH_PATTERN = /^\d{4}(?:-(0[1-9]|1[0-2]))?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLACEHOLDER_PATTERN = /\b(TODO|TBD|FIXME|lorem ipsum)\b|\byour name\b/i;
const EXAMPLE_LEFTOVER_PATTERN =
  /\bexample\.(?:com|org|net)\b|\bfictional example profile\b|\bperfil de exemplo fict[ií]cio\b|github\.com\/GuilhermeMikin\/ai-portfolio-template\b/i;

function walkStrings(value: unknown, path: string, visit: (path: string, value: string) => void) {
  if (typeof value === "string") {
    visit(path, value);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, `${path}[${index}]`, visit));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      walkStrings(child, path ? `${path}.${key}` : key, visit);
    }
  }
}

type ValidateOptions = {
  /**
   * Returns whether a site-relative asset exists (e.g. checks `public/`). Provided by
   * Node scripts and tests; omitted at runtime, where the check is skipped.
   */
  assetExists?: (sitePath: string) => boolean;
  /** Max chars for a chat message; suggested questions must fit. */
  maxMessageLength?: number;
};

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isSiteRelativePath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

/** Whether `end` comes before `start`. A year-only value covers the whole year. */
function endsBeforeStart(start: YearMonth, end: YearMonth) {
  const startValue = start.length === 4 ? `${start}-01` : start;
  const endValue = end.length === 4 ? `${end}-12` : end;
  return endValue.localeCompare(startValue) < 0;
}

/**
 * Validates a profile and returns every problem found (an empty array means valid).
 * Errors must be fixed; warnings are reported but do not fail the build.
 */
export function validateProfile(profile: Profile, options: ValidateOptions = {}): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const error = (path: string, message: string) => issues.push({ level: "error", path, message });
  const warning = (path: string, message: string) =>
    issues.push({ level: "warning", path, message });

  const requireText = (path: string, value: unknown) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      error(path, "is required and must be a non-empty string");
      return false;
    }
    if (PLACEHOLDER_PATTERN.test(value)) {
      warning(path, "looks like placeholder text");
    }
    return true;
  };

  const optionalText = (path: string, value: unknown) => {
    if (value === undefined) return;
    requireText(path, value);
  };

  const checkTextList = (path: string, values: unknown, { required = false } = {}) => {
    if (values === undefined) {
      if (required) error(path, "is required");
      return;
    }
    if (!Array.isArray(values)) {
      error(path, "must be an array of strings");
      return;
    }
    if (required && values.length === 0) error(path, "must have at least one item");
    values.forEach((value, index) => requireText(`${path}[${index}]`, value));
  };

  const checkLinkHref = (path: string, href: unknown, { allowRelative = true } = {}) => {
    if (typeof href !== "string" || href.trim().length === 0) {
      error(path, "is required");
      return;
    }
    if (href.startsWith("mailto:")) {
      if (!EMAIL_PATTERN.test(href.slice("mailto:".length))) error(path, "is not a valid mailto: address");
      return;
    }
    if (isHttpUrl(href)) {
      if (href.startsWith("http:")) warning(path, "uses http:// — prefer https://");
      return;
    }
    if (allowRelative && isSiteRelativePath(href)) {
      if (options.assetExists && /\.[a-z0-9]+$/i.test(href) && !options.assetExists(href)) {
        error(path, `points to ${href}, but no such file exists in public/`);
      }
      return;
    }
    error(path, "must be an https:// URL, a mailto: address or a site-relative path starting with /");
  };

  // Images go through next/image, which only serves local files unless remote hosts are
  // configured, so `src` must be a file in public/.
  const checkImageSrc = (path: string, src: unknown) => {
    if (typeof src !== "string" || src.length === 0) {
      error(path, "is required");
    } else if (!isSiteRelativePath(src)) {
      error(path, "must be a file in public/, referenced with a path starting with / (e.g. /images/me.jpg)");
    } else if (options.assetExists && !options.assetExists(src)) {
      error(path, `points to ${src}, but no such file exists in public/`);
    }
  };

  const checkImage = (path: string, image: ImageAsset | undefined) => {
    if (!image) return;
    requireText(`${path}.alt`, image.alt);
    checkImageSrc(`${path}.src`, image.src);
  };

  const checkPeriod = (path: string, period: Period | undefined, { required = false } = {}) => {
    if (!period) {
      if (required) error(path, "is required");
      return;
    }
    if (!YEAR_MONTH_PATTERN.test(period.start ?? "")) {
      error(`${path}.start`, 'must look like "2024" or "2024-03"');
      return;
    }
    if (period.end !== undefined) {
      if (!YEAR_MONTH_PATTERN.test(period.end)) {
        error(`${path}.end`, 'must look like "2024" or "2024-03" (omit it for "Present")');
      } else if (endsBeforeStart(period.start, period.end)) {
        error(`${path}.end`, "is earlier than the start");
      }
    }
  };

  const checkUniqueIds = (path: string, items: { id: string }[] | undefined) => {
    if (!items) return;
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (typeof item.id !== "string" || !SLUG_PATTERN.test(item.id)) {
        error(`${path}[${index}].id`, 'must be a slug such as "my-project"');
      } else if (seen.has(item.id)) {
        error(`${path}[${index}].id`, `duplicates "${item.id}"`);
      }
      seen.add(item.id);
    });
  };

  // person
  requireText("person.name", profile.person?.name);
  optionalText("person.shortName", profile.person?.shortName);
  requireText("person.headline", profile.person?.headline);
  if (requireText("person.summary", profile.person?.summary)) {
    if (profile.person.summary.length > CONTENT_LIMITS.summaryMaxChars) {
      warning(
        "person.summary",
        `is ${profile.person.summary.length} characters; keep it under ${CONTENT_LIMITS.summaryMaxChars} so the introduction stays short`
      );
    }
  }
  optionalText("person.location", profile.person?.location);
  checkImage("person.photo", profile.person?.photo);

  // brand
  if (profile.brand?.logo) {
    checkImageSrc("brand.logo.src", profile.brand.logo.src);
    const { width, height } = profile.brand.logo;
    if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
      error("brand.logo", "needs positive width and height (the image's intrinsic size in pixels)");
    }
  }

  // about
  checkTextList("about.bio", profile.about?.bio, { required: true });
  checkTextList("about.highlights", profile.about?.highlights);
  checkTextList("about.interests", profile.about?.interests);

  // skills
  if (!Array.isArray(profile.skills)) {
    error("skills", "must be an array");
  } else {
    profile.skills.forEach((group, index) => {
      requireText(`skills[${index}].group`, group.group);
      checkTextList(`skills[${index}].items`, group.items, { required: true });
    });
  }

  // experience
  if (!Array.isArray(profile.experience)) {
    error("experience", "must be an array (it can be empty)");
  } else {
    checkUniqueIds("experience", profile.experience);
    profile.experience.forEach((item, index) => {
      const path = `experience[${index}]`;
      requireText(`${path}.role`, item.role);
      requireText(`${path}.organization`, item.organization);
      if (item.organizationUrl !== undefined) {
        checkLinkHref(`${path}.organizationUrl`, item.organizationUrl, { allowRelative: false });
      }
      optionalText(`${path}.location`, item.location);
      checkPeriod(`${path}.period`, item.period, { required: true });
      optionalText(`${path}.summary`, item.summary);
      checkTextList(`${path}.highlights`, item.highlights, { required: true });
      checkTextList(`${path}.stack`, item.stack);
    });
  }

  // projects
  if (!Array.isArray(profile.projects) || profile.projects.length === 0) {
    error("projects", "must list at least one project");
  } else {
    checkUniqueIds("projects", profile.projects);
    profile.projects.forEach((project, index) => {
      const path = `projects[${index}]`;
      requireText(`${path}.title`, project.title);
      requireText(`${path}.summary`, project.summary);
      optionalText(`${path}.role`, project.role);
      checkPeriod(`${path}.period`, project.period);
      optionalText(`${path}.status`, project.status);
      optionalText(`${path}.category`, project.category);
      checkTextList(`${path}.highlights`, project.highlights);
      checkTextList(`${path}.stack`, project.stack);
      project.links?.forEach((link, linkIndex) => {
        requireText(`${path}.links[${linkIndex}].label`, link.label);
        checkLinkHref(`${path}.links[${linkIndex}].href`, link.href);
      });
    });
    const featured = profile.projects.filter((project) => project.featured).length;
    if (featured === 0) {
      warning("projects", "no project is marked `featured`; the home page will show the first three");
    } else if (featured > CONTENT_LIMITS.featuredProjectsShown) {
      warning(
        "projects",
        `${featured} projects are featured; only the first ${CONTENT_LIMITS.featuredProjectsShown} appear on the home page`
      );
    }
  }

  if (
    Array.isArray(profile.experience) &&
    profile.experience.length === 0 &&
    (profile.education?.length ?? 0) === 0
  ) {
    error("experience", "add at least one experience or education entry so the Resume page has content");
  }

  // education
  checkUniqueIds("education", profile.education);
  profile.education?.forEach((item, index) => {
    const path = `education[${index}]`;
    requireText(`${path}.degree`, item.degree);
    requireText(`${path}.institution`, item.institution);
    if (item.institutionUrl !== undefined) {
      checkLinkHref(`${path}.institutionUrl`, item.institutionUrl, { allowRelative: false });
    }
    optionalText(`${path}.location`, item.location);
    checkPeriod(`${path}.period`, item.period, { required: true });
    checkTextList(`${path}.details`, item.details);
  });

  // certifications & languages
  profile.certifications?.forEach((item, index) => {
    const path = `certifications[${index}]`;
    requireText(`${path}.name`, item.name);
    requireText(`${path}.issuer`, item.issuer);
    if (item.date !== undefined && !YEAR_MONTH_PATTERN.test(item.date)) {
      error(`${path}.date`, 'must look like "2024" or "2024-03"');
    }
    if (item.url !== undefined) checkLinkHref(`${path}.url`, item.url, { allowRelative: false });
  });
  profile.languages?.forEach((item, index) => {
    requireText(`languages[${index}].name`, item.name);
    requireText(`languages[${index}].level`, item.level);
  });

  // contact
  if (!profile.contact) {
    error("contact", "is required");
  } else {
    if (profile.contact.email !== undefined) {
      if (/^mailto:/i.test(profile.contact.email)) {
        error("contact.email", "must be the bare address (you@example.com); the site adds mailto: itself");
      } else if (!EMAIL_PATTERN.test(profile.contact.email)) {
        error("contact.email", "is not a valid email address");
      }
    }
    optionalText("contact.availability", profile.contact.availability);
    optionalText("contact.responseTime", profile.contact.responseTime);
    if (!Array.isArray(profile.contact.social)) {
      error("contact.social", "must be an array (it can be empty)");
    } else {
      profile.contact.social.forEach((link, index) => {
        requireText(`contact.social[${index}].label`, link.label);
        checkLinkHref(`contact.social[${index}].href`, link.href, { allowRelative: false });
      });
    }
    if (!profile.contact.email && (profile.contact.social?.length ?? 0) === 0) {
      error("contact", "add an email or at least one social link so visitors can reach you");
    }
  }

  // resume
  if (profile.resume?.pdf) checkLinkHref("resume.pdf.href", profile.resume.pdf.href);
  if (profile.resume?.updated !== undefined && !YEAR_MONTH_PATTERN.test(profile.resume.updated)) {
    error("resume.updated", 'must look like "2024" or "2024-03"');
  }

  // seo
  optionalText("seo.title", profile.seo?.title);
  optionalText("seo.description", profile.seo?.description);
  checkTextList("seo.keywords", profile.seo?.keywords);

  // assistant
  if (!profile.assistant) {
    error("assistant", "is required");
  } else {
    requireText("assistant.name", profile.assistant.name);
    const questions = profile.assistant.suggestedQuestions;
    checkTextList("assistant.suggestedQuestions", questions, { required: false });
    if (Array.isArray(questions)) {
      if (questions.length > CONTENT_LIMITS.suggestedQuestionsMax) {
        error(
          "assistant.suggestedQuestions",
          `has ${questions.length} items; the home page shows at most ${CONTENT_LIMITS.suggestedQuestionsMax}`
        );
      }
      const maxLength = Math.min(
        CONTENT_LIMITS.suggestedQuestionMaxChars,
        options.maxMessageLength ?? Number.POSITIVE_INFINITY
      );
      questions.forEach((question, index) => {
        if (typeof question === "string" && question.length > maxLength) {
          error(`assistant.suggestedQuestions[${index}]`, `must be at most ${maxLength} characters`);
        }
      });
    }
    profile.assistant.faq?.forEach((entry, index) => {
      requireText(`assistant.faq[${index}].question`, entry.question);
      requireText(`assistant.faq[${index}].answer`, entry.answer);
    });
    checkTextList("assistant.instructions", profile.assistant.instructions);
  }

  if (profile.isExample) {
    warning(
      "isExample",
      "the bundled example profile is active — replace the content and set isExample to false before launching"
    );
  } else {
    // Leftovers from the bundled example once it is marked as real content.
    walkStrings(profile, "", (path, value) => {
      if (EXAMPLE_LEFTOVER_PATTERN.test(value)) {
        warning(path, "looks like leftover example data (example.com address, the fictional example profile or the demo's template FAQ)");
      }
    });
  }

  return issues;
}

/* -------------------------------------------------------------------------- */
/* Message dictionaries                                                         */
/* -------------------------------------------------------------------------- */

const PLACEHOLDER_TOKEN = /\{(\w+)\}/g;

function collectLeaves(value: unknown, prefix: string, leaves: Map<string, unknown>) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectLeaves(child, prefix ? `${prefix}.${key}` : key, leaves);
    }
    return;
  }
  leaves.set(prefix, value);
}

function placeholdersOf(value: unknown) {
  const text = Array.isArray(value) ? value.join("\n") : typeof value === "string" ? value : "";
  return [...text.matchAll(PLACEHOLDER_TOKEN)].map((match) => match[1]).sort();
}

/**
 * Compares a translated dictionary with the default-locale one: same keys, same
 * value types and the same `{placeholders}` in every string.
 */
export function validateMessages(base: unknown, candidate: unknown, label: string): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const baseLeaves = new Map<string, unknown>();
  const candidateLeaves = new Map<string, unknown>();
  collectLeaves(base, "", baseLeaves);
  collectLeaves(candidate, "", candidateLeaves);

  for (const [key, baseValue] of baseLeaves) {
    if (!candidateLeaves.has(key)) {
      issues.push({ level: "error", path: `${label}.${key}`, message: "is missing" });
      continue;
    }
    const value = candidateLeaves.get(key);
    if (typeof value !== typeof baseValue || Array.isArray(value) !== Array.isArray(baseValue)) {
      issues.push({ level: "error", path: `${label}.${key}`, message: "has a different type than the default locale" });
      continue;
    }
    if (typeof value === "string" && value.trim().length === 0) {
      issues.push({ level: "error", path: `${label}.${key}`, message: "is empty" });
    }
    const expected = placeholdersOf(baseValue).join(",");
    const actual = placeholdersOf(value).join(",");
    if (expected !== actual) {
      issues.push({
        level: "error",
        path: `${label}.${key}`,
        message: `placeholders differ (expected {${expected}}, found {${actual}})`,
      });
    }
  }
  for (const key of candidateLeaves.keys()) {
    if (!baseLeaves.has(key)) {
      issues.push({ level: "warning", path: `${label}.${key}`, message: "is not used by the default locale" });
    }
  }
  return issues;
}
