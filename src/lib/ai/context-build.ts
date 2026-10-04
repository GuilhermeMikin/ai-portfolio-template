/**
 * Turns the typed profile into the plain-text context the assistant answers from.
 *
 * The whole (small) portfolio goes into the prompt: no retrieval, no embeddings. The
 * "related pages" shown under an answer are simple keyword matches against the sections.
 */
import {
  formatMessage,
  formatPeriod,
  formatYearMonth,
  getContent,
  type Messages,
  type Profile,
} from "@/content";
import type { Locale } from "@/shared/config/site";
import { getSitePagePath, type SitePage } from "@/shared/config/site-links";

import { CHAT_CONTEXT_MAX_CHARS, type ChatSourceItem } from "./types";

export type ContextSectionId =
  | "profile"
  | "focus"
  | "skills"
  | "experience"
  | "projects"
  | "education"
  | "certifications"
  | "languages"
  | "interests"
  | "contact"
  | "resume"
  | "faq";

/** One entry of a section (a project, a role…), used for demo excerpts. */
export type ContextItem = {
  title: string;
  text: string;
};

export type ContextSection = {
  id: ContextSectionId;
  /** Localized section name, shown on "related page" pills. */
  label: string;
  /** Site page where the section's information lives. */
  href: string;
  /** Plain-text block given to the model. */
  content: string;
  items: ContextItem[];
};

export type PortfolioContext = {
  /** Every section except the FAQ, in order (goes inside <portfolio_content>). */
  contextText: string;
  /** The FAQ block (goes inside <faq>); empty when there is none. */
  faqText: string;
  /** Characters of all included sections. */
  contextLength: number;
  sections: ContextSection[];
  omittedSections: ContextSectionId[];
  sources: ChatSourceItem[];
};

const SECTION_SEPARATOR = "\n\n";
const MAX_SOURCES = 3;
/** Sections that are never offered as a "related page". */
const NON_SOURCE_SECTIONS = new Set<ContextSectionId>(["profile", "faq"]);

/* -------------------------------------------------------------------------- */
/* Section builders                                                            */
/* -------------------------------------------------------------------------- */

type Builder = {
  locale: Locale;
  profile: Profile;
  messages: Messages;
};

type MaybeLine = string | false | 0 | null | undefined;

function compact(lines: MaybeLine[]) {
  return lines.filter((line): line is string => typeof line === "string" && line.trim().length > 0);
}

function joinParts(parts: MaybeLine[], separator = " | ") {
  return compact(parts).join(separator);
}

function createSection(
  { locale }: Builder,
  id: ContextSectionId,
  label: string,
  page: SitePage,
  body: string[],
  items: ContextItem[]
): ContextSection | null {
  if (body.length === 0) {
    return null;
  }

  const href = getSitePagePath(locale, page);
  // The FAQ is rendered in its own <faq> block, so it needs no heading.
  const content = id === "faq" ? body.join("\n") : [`## ${label} (page: ${href})`, ...body].join("\n");
  return { id, label, href, content, items };
}

function buildProfileSection(builder: Builder) {
  const { person, about } = builder.profile;
  const bio = about.bio.filter((paragraph) => paragraph.trim());
  const body = compact([
    `Name: ${person.name}`,
    `Headline: ${person.headline}`,
    `Summary: ${person.summary}`,
    person.location && `Location: ${person.location}`,
    bio.length > 0 &&
      `Bio (written by ${person.name} in the first person; "I" and "my" refer to ${person.name}):`,
    ...bio,
  ]);

  return createSection(builder, "profile", builder.messages.about.title, "about", body, [
    { title: person.name, text: [person.headline, person.summary, ...bio].join(" ") },
  ]);
}

function buildListSection(
  builder: Builder,
  id: ContextSectionId,
  label: string,
  page: SitePage,
  values: string[] | undefined
) {
  const entries = (values ?? []).filter((value) => value.trim());
  return createSection(
    builder,
    id,
    label,
    page,
    entries.map((value) => `- ${value}`),
    entries.map((value) => ({ title: "", text: value }))
  );
}

function buildSkillsSection(builder: Builder) {
  const groups = builder.profile.skills.filter((group) => group.items.length > 0);
  return createSection(
    builder,
    "skills",
    builder.messages.about.skillsTitle,
    "about",
    groups.map((group) => `- ${group.group}: ${group.items.join(", ")}`),
    groups.map((group) => ({ title: group.group, text: group.items.join(", ") }))
  );
}

function buildExperienceSection(builder: Builder) {
  const { locale, messages } = builder;
  const body: string[] = [];
  const items: ContextItem[] = [];

  for (const role of builder.profile.experience) {
    const organization = role.organizationUrl
      ? `${role.organization} (${role.organizationUrl})`
      : role.organization;
    body.push(
      `- ${joinParts([
        `${role.role} at ${organization}`,
        role.location,
        formatPeriod(role.period, locale, messages.common),
      ])}`,
      ...compact([
        role.summary && `  Summary: ${role.summary}`,
        ...role.highlights.map((highlight) => `  * ${highlight}`),
        role.stack?.length && `  Stack: ${role.stack.join(", ")}`,
      ])
    );
    items.push({
      title: `${role.role}, ${role.organization}`,
      text: compact([role.summary, ...role.highlights]).join(" "),
    });
  }

  return createSection(builder, "experience", messages.resume.experienceTitle, "resume", body, items);
}

function buildProjectsSection(builder: Builder) {
  const { locale, messages } = builder;
  const body: string[] = [];
  const items: ContextItem[] = [];

  for (const project of builder.profile.projects) {
    const details = joinParts([
      project.category && `Category: ${project.category}`,
      project.status && `Status: ${project.status}`,
      project.role && `Role: ${project.role}`,
      project.period && `Period: ${formatPeriod(project.period, locale, messages.common)}`,
    ]);
    body.push(
      `- ${project.title}`,
      ...compact([
        details && `  ${details}`,
        `  Summary: ${project.summary}`,
        ...(project.highlights ?? []).map((highlight) => `  * ${highlight}`),
        project.stack?.length && `  Stack: ${project.stack.join(", ")}`,
        project.links?.length &&
          `  Links: ${project.links.map((link) => `${link.label}: ${link.href}`).join("; ")}`,
      ])
    );
    items.push({
      title: project.title,
      text: compact([project.summary, ...(project.highlights ?? [])]).join(" "),
    });
  }

  return createSection(builder, "projects", messages.projects.title, "projects", body, items);
}

function buildEducationSection(builder: Builder) {
  const { locale, messages } = builder;
  const entries = builder.profile.education ?? [];
  const body = entries.flatMap((entry) => {
    const institution = entry.institutionUrl
      ? `${entry.institution} (${entry.institutionUrl})`
      : entry.institution;
    return [
      `- ${joinParts([
        `${entry.degree}, ${institution}`,
        entry.location,
        formatPeriod(entry.period, locale, messages.common),
      ])}`,
      ...(entry.details ?? []).map((detail) => `  * ${detail}`),
    ];
  });

  return createSection(
    builder,
    "education",
    messages.resume.educationTitle,
    "resume",
    body,
    entries.map((entry) => ({
      title: entry.degree,
      text: compact([`${entry.institution}.`, ...(entry.details ?? [])]).join(" "),
    }))
  );
}

function buildCertificationsSection(builder: Builder) {
  const { locale, messages } = builder;
  const entries = builder.profile.certifications ?? [];
  return createSection(
    builder,
    "certifications",
    messages.resume.certificationsTitle,
    "resume",
    entries.map(
      (entry) =>
        `- ${joinParts([
          `${entry.name}, ${entry.issuer}`,
          entry.date && formatYearMonth(entry.date, locale),
          entry.url,
        ])}`
    ),
    entries.map((entry) => ({
      title: entry.name,
      text: joinParts([entry.issuer, entry.date && formatYearMonth(entry.date, locale)], ", "),
    }))
  );
}

function buildLanguagesSection(builder: Builder) {
  const entries = builder.profile.languages ?? [];
  return createSection(
    builder,
    "languages",
    builder.messages.about.languagesTitle,
    "about",
    entries.map((entry) => `- ${entry.name}: ${entry.level}`),
    entries.map((entry) => ({ title: entry.name, text: entry.level }))
  );
}

function buildContactSection(builder: Builder) {
  const { locale, profile, messages } = builder;
  const { contact } = profile;
  const contactPath = getSitePagePath(locale, "contact");
  const labels = messages.contact;

  const fields: ContextItem[] = [
    { title: labels.emailLabel, text: contact.email ?? "" },
    ...contact.social.map((link) => ({ title: link.label, text: link.href })),
    { title: labels.availabilityTitle, text: contact.availability ?? "" },
    { title: labels.responseTimeTitle, text: contact.responseTime ?? "" },
    { title: labels.locationTitle, text: profile.person.location ?? "" },
  ].filter((field) => field.text.trim());

  return createSection(
    builder,
    "contact",
    labels.title,
    "contact",
    [...fields.map((field) => `${field.title}: ${field.text}`), `Contact page: ${contactPath}`],
    fields
  );
}

function buildResumeSection(builder: Builder) {
  const { locale, profile, messages } = builder;
  const resumePath = getSitePagePath(locale, "resume");
  const updated = profile.resume?.updated
    ? formatMessage(messages.resume.updated, { date: formatYearMonth(profile.resume.updated, locale) })
    : undefined;

  return createSection(
    builder,
    "resume",
    messages.resume.title,
    "resume",
    compact([
      `Resume page: ${resumePath}`,
      profile.resume?.pdf?.href && `Resume PDF: ${profile.resume.pdf.href}`,
      updated,
    ]),
    [{ title: messages.resume.title, text: updated ?? "" }]
  );
}

function buildFaqSection(builder: Builder) {
  const entries = (builder.profile.assistant.faq ?? []).filter(
    (entry) => entry.question.trim() && entry.answer.trim()
  );
  return createSection(
    builder,
    "faq",
    "FAQ",
    "",
    entries.map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`),
    entries.map((entry) => ({ title: entry.question, text: entry.answer }))
  );
}

/** Every non-empty section, in the fixed order the model sees them. */
export function buildContextSections(locale: Locale): ContextSection[] {
  const { profile, messages } = getContent(locale);
  const builder: Builder = { locale, profile, messages };

  const sections = [
    buildProfileSection(builder),
    buildListSection(builder, "focus", messages.about.highlightsTitle, "about", profile.about.highlights),
    buildSkillsSection(builder),
    buildExperienceSection(builder),
    buildProjectsSection(builder),
    buildEducationSection(builder),
    buildCertificationsSection(builder),
    buildLanguagesSection(builder),
    buildListSection(builder, "interests", messages.about.interestsTitle, "about", profile.about.interests),
    buildContactSection(builder),
    buildResumeSection(builder),
    buildFaqSection(builder),
  ];

  return sections.filter((section): section is ContextSection => section !== null);
}

/* -------------------------------------------------------------------------- */
/* Budget                                                                      */
/* -------------------------------------------------------------------------- */

function joinedLength(sections: ContextSection[]) {
  return sections.reduce(
    (total, section, index) => total + section.content.length + (index > 0 ? SECTION_SEPARATOR.length : 0),
    0
  );
}

/**
 * Keeps sections in order while they fit in `maxChars`. A section that does not fit is
 * left out (a later, smaller one may still fit); nothing is cut mid-section.
 */
export function selectContextSections(sections: ContextSection[], maxChars: number) {
  const included: ContextSection[] = [];
  const omitted: ContextSectionId[] = [];
  let length = 0;

  for (const section of sections) {
    const nextLength =
      included.length === 0 ? section.content.length : length + SECTION_SEPARATOR.length + section.content.length;
    if (nextLength > maxChars) {
      omitted.push(section.id);
      continue;
    }

    included.push(section);
    length = nextLength;
  }

  return { included, omitted, length };
}

/**
 * How large the assistant context is for a locale. `length` is the size of the full
 * context before any section is left out; `omittedSections` lists what would not fit.
 * `pnpm content:check` fails when anything would be omitted.
 */
export function measurePortfolioContext(
  locale: Locale,
  maxLength: number = CHAT_CONTEXT_MAX_CHARS
): { length: number; maxLength: number; omittedSections: string[] } {
  const sections = buildContextSections(locale);
  const { omitted } = selectContextSections(sections, maxLength);
  return { length: joinedLength(sections), maxLength, omittedSections: omitted };
}

/* -------------------------------------------------------------------------- */
/* Keyword matching (related pages and demo excerpts)                          */
/* -------------------------------------------------------------------------- */

const STOPWORDS = new Set(
  [
    // English
    "an", "and", "are", "as", "at", "be", "but", "by", "can", "could", "did", "do", "does", "for",
    "from", "had", "has", "have", "he", "her", "his", "how", "if", "in", "into", "is", "it", "its",
    "me", "more", "most", "my", "no", "not", "of", "on", "or", "our", "she", "so", "some", "tell",
    "than", "that", "the", "their", "them", "then", "there", "these", "they", "this", "to", "us",
    "use", "used", "uses", "using", "was", "we", "were", "what", "when", "where", "which", "who",
    "whom", "why", "will", "with", "would", "you", "your", "about", "any", "also", "all", "just",
    "like", "much", "many", "very", "know", "show", "give", "get", "please", "thanks", "hi", "hello",
    "kind", "type", "sort", "new", "other", "here",
    // Too common in portfolio text to point anywhere ("Beyond work", "my best work").
    "work",
    // Portuguese, Spanish, French, German (accents removed)
    "de", "da", "das", "dos", "em", "na", "nas", "nos", "um", "uma", "os", "que", "qual", "quais",
    "como", "onde", "quem", "para", "por", "com", "sobre", "ele", "ela", "seu", "sua", "tem", "ja",
    "ou", "se", "mais", "voce", "pode", "del", "la", "el", "los", "las", "una", "en", "cual", "cuales",
    "donde", "quien", "con", "su", "sus", "tiene", "ha", "es", "mas", "puedes", "usted", "du", "des",
    "le", "les", "une", "et", "quel", "quelle", "quels", "quelles", "comment", "qui", "pour", "par",
    "avec", "sur", "son", "sa", "ses", "est", "il", "elle", "au", "aux", "ce", "mon", "ma", "mes",
    "vous", "tu", "der", "die", "den", "dem", "ein", "eine", "einen", "und", "ist", "sind", "was",
    "welche", "welcher", "wie", "wo", "wer", "fur", "mit", "uber", "sein", "seine", "ihr", "ihre",
    "hat", "hast", "auch", "mir", "du", "sie", "er", "im", "zu", "auf", "von",
    // More Portuguese, for the bundled pt-br content ("trabalho" mirrors "work" above)
    "ao", "aos", "pelo", "pela", "foi", "ser", "sao", "isso", "esse", "essa", "este", "esta", "muito",
    "fale", "conte", "mostre", "trabalho", "trabalha",
  ]
);

/**
 * Extra words that point at a section, in English and then Portuguese (accent-free), for
 * the bundled locales; section labels from the message files cover any other language.
 * They are stemmed like everything else, and the stemmer only drops a final "s", so
 * Portuguese plurals that change the ending (-ções, -ns) are listed as well.
 */
const SECTION_KEYWORDS: Partial<Record<ContextSectionId, string[]>> = {
  focus: ["focus", "specialty", "specialize", "strength", "expertise", "foco", "especialidade", "forte"],
  skills: [
    "skill", "technology", "tech", "tool", "stack", "framework", "language", "programming",
    "habilidade", "tecnologia", "ferramenta", "linguagem", "linguagens", "programacao", "sabe",
  ],
  experience: [
    "experience", "job", "role", "career", "worked", "employer", "company",
    "experiencia", "emprego", "cargo", "carreira", "trabalhou", "empresa",
  ],
  projects: [
    "project", "built", "build", "made", "created", "portfolio", "app", "product",
    "projeto", "construiu", "criou", "fez", "desenvolveu", "aplicativo", "produto",
  ],
  education: [
    "education", "degree", "study", "studied", "university", "college", "school",
    "formacao", "formacoes", "graduacao", "graduacoes", "faculdade", "estudou", "universidade", "diploma",
  ],
  certifications: [
    "certification", "certificate", "certified", "course",
    "certificacao", "certificacoes", "certificado", "curso",
  ],
  languages: ["language", "speak", "speaks", "spoken", "fluent", "idioma", "lingua", "fala", "fluente"],
  interests: ["hobby", "interest", "fun", "free", "outside", "personal", "interesse", "lazer", "livre", "pessoal"],
  contact: [
    "contact", "email", "reach", "hire", "available", "availability", "freelance", "touch",
    "contato", "contratar", "disponivel", "disponibilidade", "falar",
  ],
  resume: ["resume", "cv", "pdf", "download", "curriculo", "baixar"],
};

/** A light, symmetric stemmer: questions and content go through the same rules. */
function stem(token: string) {
  return token
    .replace(/ability$/, "able")
    .replace(/i(?:es|ed)$/, "y")
    .replace(/(?<=\p{L}{3})(?:ing|ed)$/u, "")
    .replace(/(?<=\p{L}{3})s$/u, "");
}

/** Lowercase, accent-free, stemmed tokens of at least two characters, without stopwords. */
export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
    .map(stem);
  return new Set(tokens);
}

/** The owner's name matches everything and nothing, so it is ignored in questions. */
export function getQuestionTokens(question: string, profile: Pick<Profile, "person">) {
  const nameTokens = tokenize(`${profile.person.name} ${profile.person.shortName ?? ""}`);
  const tokens = tokenize(question);
  for (const token of nameTokens) {
    tokens.delete(token);
  }
  return tokens;
}

export function countMatches(question: Set<string>, candidates: Set<string>) {
  let matches = 0;
  for (const token of question) {
    if (candidates.has(token)) {
      matches += 1;
    }
  }
  return matches;
}

/** Tokens that name a section: its label plus its keywords. */
export function getSectionKeywordTokens(section: Pick<ContextSection, "id" | "label">) {
  return tokenize(`${section.label} ${(SECTION_KEYWORDS[section.id] ?? []).join(" ")}`);
}

export function getItemTokens(item: ContextItem) {
  return tokenize(`${item.title} ${item.text}`);
}

/** Up to three "related pages" for a question, best match first, one per page. */
export function pickRelevantSources(
  questionTokens: Set<string>,
  sections: ContextSection[],
  locale: Locale
): ChatSourceItem[] {
  if (questionTokens.size === 0) {
    return [];
  }

  const ranked = sections
    .filter((section) => !NON_SOURCE_SECTIONS.has(section.id))
    .map((section, order) => {
      const itemTokens = new Set(section.items.flatMap((item) => [...getItemTokens(item)]));
      return {
        section,
        order,
        // Naming a section ("skills", "education") counts more than a word inside it.
        score:
          2 * countMatches(questionTokens, getSectionKeywordTokens(section)) +
          countMatches(questionTokens, itemTokens),
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.order - right.order);

  const sources: ChatSourceItem[] = [];
  const seenHrefs = new Set<string>();
  for (const { section } of ranked) {
    if (seenHrefs.has(section.href)) continue;
    seenHrefs.add(section.href);
    sources.push({ section: section.id, label: section.label, href: section.href, locale });
    if (sources.length === MAX_SOURCES) break;
  }

  return sources;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export function buildPortfolioContext(
  locale: Locale,
  question: string,
  { maxChars = CHAT_CONTEXT_MAX_CHARS }: { maxChars?: number } = {}
): PortfolioContext {
  const { profile } = getContent(locale);
  const { included, omitted, length } = selectContextSections(buildContextSections(locale), maxChars);
  const faq = included.find((section) => section.id === "faq");

  return {
    contextText: included
      .filter((section) => section.id !== "faq")
      .map((section) => section.content)
      .join(SECTION_SEPARATOR),
    faqText: faq?.content ?? "",
    contextLength: length,
    sections: included,
    omittedSections: omitted,
    sources: pickRelevantSources(getQuestionTokens(question, profile), included, locale),
  };
}
