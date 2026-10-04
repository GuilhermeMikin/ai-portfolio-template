/**
 * Demo mode (CHAT_MODE=demo): simulated replies built from the site content with plain
 * keyword matching. No model, no network call, and every reply says so.
 */
import { formatMessage, getContent, getProfileMessageValues } from "@/content";
import type { Locale } from "@/shared/config/site";

import {
  countMatches,
  getItemTokens,
  getQuestionTokens,
  getSectionKeywordTokens,
  type ContextItem,
  type ContextSection,
  type ContextSectionId,
} from "./context-build";
import type { ChatIntent } from "./types";

const MAX_EXCERPTS = 2;
const EXCERPT_MAX_CHARS = 200;

/** Which sections make the best excerpts when scores tie. */
const DEMO_SECTION_PRIORITY: ContextSectionId[] = [
  "projects",
  "experience",
  "skills",
  "contact",
  "education",
  "certifications",
  "focus",
  "faq",
  "resume",
  "languages",
  "interests",
  "profile",
];

/** Sections whose information has no page of its own. */
const UNLINKED_SECTIONS = new Set<ContextSectionId>(["faq"]);

type ScoredItem = {
  section: ContextSection;
  item: ContextItem;
  score: number;
  priority: number;
  order: number;
};

function truncate(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return text;
  }

  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/** Short texts are shown whole; longer ones by their first sentence that matches the question. */
function pickSnippet(text: string, questionTokens: Set<string>) {
  if (text.length <= EXCERPT_MAX_CHARS) {
    return text;
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const matching = sentences.find(
    (sentence) => countMatches(questionTokens, getItemTokens({ title: "", text: sentence })) > 0
  );
  return truncate(matching ?? sentences[0] ?? text, EXCERPT_MAX_CHARS);
}

function rankItems(questionTokens: Set<string>, sections: ContextSection[]): ScoredItem[] {
  const scored: ScoredItem[] = [];

  for (const section of sections) {
    const keywordMatches = countMatches(questionTokens, getSectionKeywordTokens(section));
    const priority = DEMO_SECTION_PRIORITY.indexOf(section.id);

    section.items.forEach((item, order) => {
      // The section label counts as part of each item ("Contact" for the email entry).
      const itemMatches = countMatches(
        questionTokens,
        getItemTokens({ title: `${section.label} ${item.title}`, text: item.text })
      );
      const score = 2 * itemMatches + keywordMatches;
      if (score > 0) {
        scored.push({ section, item, score, priority, order });
      }
    });
  }

  return scored.sort(
    (left, right) => right.score - left.score || left.priority - right.priority || left.order - right.order
  );
}

function formatExcerpt({ section, item }: ScoredItem, questionTokens: Set<string>, markdownEnabled: boolean) {
  const snippet = item.text ? pickSnippet(item.text, questionTokens) : "";
  const title = item.title && markdownEnabled ? `**${item.title}**` : item.title;
  const body = title ? `${title}${snippet ? `: ${snippet}` : ""}` : snippet;
  const link = UNLINKED_SECTIONS.has(section.id)
    ? ""
    : markdownEnabled
      ? ` ([${section.label}](${section.href}))`
      : ` (${section.label}: ${section.href})`;
  return `- ${body}${link}`;
}

/**
 * Builds a demo reply: the demo notice, then up to two matching excerpts with links to
 * their pages (or a "no match" hint). With `markdownEnabled: false` it is plain text:
 * no emphasis and page paths instead of Markdown links.
 */
export function buildDemoReply({
  locale,
  question,
  intent,
  sections,
  markdownEnabled = true,
}: {
  locale: Locale;
  question: string;
  intent: ChatIntent;
  sections: ContextSection[];
  /** CHAT_MARKDOWN_ENABLED */
  markdownEnabled?: boolean;
}): string {
  const { profile, messages } = getContent(locale);
  const replies = messages.chat.replies;
  const values = getProfileMessageValues(profile);
  const notice = formatMessage(replies.demoIntro, values);
  const intro = markdownEnabled ? `*${notice}*` : notice;

  if (intent === "small_talk") {
    return `${intro}\n\n${formatMessage(replies.smallTalkFallback, values)}`;
  }

  const questionTokens = getQuestionTokens(question, profile);
  const excerpts = rankItems(questionTokens, sections).slice(0, MAX_EXCERPTS);

  if (excerpts.length === 0) {
    return `${intro}\n\n${formatMessage(replies.demoNoMatch, values)}`;
  }

  return [intro, "", ...excerpts.map((excerpt) => formatExcerpt(excerpt, questionTokens, markdownEnabled))].join("\n");
}
