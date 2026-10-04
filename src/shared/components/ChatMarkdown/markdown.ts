/**
 * A small Markdown subset for chat replies, parsed into plain data.
 *
 * `ChatMarkdown` renders the result with React elements only, so model output can never
 * inject markup: `<script>` stays literal text. Supported: paragraphs (single line breaks
 * are kept), `-`/`*`/`+` and numbered lists, **bold**, *italic* / _italic_, `inline code`,
 * fenced code blocks (an unclosed fence, as seen mid-stream, is code so far), `#` headings
 * (rendered as bold paragraphs) and links that pass `resolveChatHref`. Bare http(s) URLs and
 * email addresses are links too, so the ones from the content become clickable.
 *
 * Client-safe. `pnpm eval` (scripts/eval/run.ts) audits the links in model replies with
 * this same parser and `resolveChatHref`, so it flags exactly what the chat would not
 * render as a link.
 */
import { normalizeExternalHref } from "@/content/format";
import { SUPPORTED_LOCALES, type Locale } from "@/shared/config/site";
import { SITE_HOSTS, getSitePagePath, isSitePage } from "@/shared/config/site-links";

export type ChatMarkdownInlineToken =
  | {
      type: "text";
      content: string;
      /** Set when this text is the label of a link whose href was rejected as unsafe. */
      droppedHref?: string;
    }
  | { type: "code"; content: string }
  | { type: "link"; content: string; href: string }
  | { type: "strong"; children: ChatMarkdownInlineToken[] }
  | { type: "em"; children: ChatMarkdownInlineToken[] };

/** The tokens that carry text (bold and italic only wrap other tokens). */
export type ChatMarkdownLeafToken = Extract<ChatMarkdownInlineToken, { content: string }>;

export type ChatMarkdownBlock =
  | { type: "paragraph"; tokens: ChatMarkdownInlineToken[] }
  | { type: "heading"; tokens: ChatMarkdownInlineToken[] }
  | { type: "unordered-list"; items: ChatMarkdownInlineToken[][] }
  | { type: "ordered-list"; items: ChatMarkdownInlineToken[][]; start: number }
  | {
      type: "code";
      content: string;
      /** From the opening fence (```ts), when it looks like a language name. */
      language?: string;
      /** False while the closing fence has not arrived yet (streaming). */
      closed: boolean;
    };

export type ResolvedChatHref = {
  href: string;
  kind: "page" | "asset" | "external";
  newTab: boolean;
};

/*
 * Inline syntax, in priority order (the earliest match wins; ties go to the first
 * alternative): code, link, bold, *italic*, _italic_, bare URL, bare email. Emphasis must
 * hug its text (`2 * 3 * 4` is not italic) and `_` only counts at word boundaries
 * (snake_case stays). A bare URL stops before brackets, quotes and trailing punctuation.
 */
// Link targets may contain one level of balanced parentheses (`https://…/Foo_(bar)`).
const INLINE_PATTERN =
  /`([^`\n]+)`|\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\*\*([^\s*](?:[^\n]*?[^\s*])?)\*\*|\*([^\s*](?:[^*\n]*?[^\s*])?)\*|(^|[^\w])_([^\s_](?:[^_\n]*?[^\s_])?)_(?!\w)|(https?:\/\/[^\s<>()[\]{}"'`*]*[^\s<>()[\]{}"'`*.,;:!?])|([\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,})(?![\w-])/g;

const FENCE_OPEN_PATTERN = /^(\s*)(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE_PATTERN = /^\s*(`{3,}|~{3,})\s*$/;
const LANGUAGE_PATTERN = /^[\w#+.-]{1,32}$/;
const HEADING_PATTERN = /^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/;
const UNORDERED_ITEM_PATTERN = /^\s*[-*+]\s+(.*\S)\s*$/;
const ORDERED_ITEM_PATTERN = /^\s*(\d{1,9})[.)]\s+(.*\S)\s*$/;
const CONTINUATION_PATTERN = /^\s{2,}\S/;

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const WHITESPACE_OR_CONTROL_PATTERN = /[\s\u0000-\u001f\u007f]/;

/**
 * First gate for link targets, independent of the current page: http(s), mailto or a
 * relative reference. Protocol-relative (`//host`) and backslash tricks are rejected,
 * because browsers read `/\host` and `\\host` as `//host`.
 */
export function isSafeMarkdownHref(href: string): boolean {
  const value = href.trim();
  if (
    !value ||
    WHITESPACE_OR_CONTROL_PATTERN.test(value) ||
    value.includes("\\") ||
    value.startsWith("//")
  ) {
    return false;
  }

  if (/^(?:[/?#]|\.\.?\/)/.test(value)) {
    return true;
  }

  try {
    return SAFE_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isLocaleSegment(segment: string) {
  return (SUPPORTED_LOCALES as readonly string[]).includes(segment);
}

function resolveSitePath(
  path: string,
  locale: Locale,
  allowedAssetPaths: readonly string[]
): ResolvedChatHref | null {
  // Pages have no anchors or query-driven views the assistant knows about.
  if (/[?#]/.test(path)) {
    return null;
  }

  if (allowedAssetPaths.includes(path)) {
    return { href: path, kind: "asset", newTab: true };
  }

  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const segments = trimmed === "/" ? [] : trimmed.slice(1).split("/");
  const rest = segments.length > 0 && isLocaleSegment(segments[0]) ? segments.slice(1) : segments;

  // Files in public/ are not localized: `/en/resume.pdf` means `/resume.pdf`.
  const unprefixed = `/${rest.join("/")}`;
  if (allowedAssetPaths.includes(unprefixed)) {
    return { href: unprefixed, kind: "asset", newTab: true };
  }

  const page = rest.length === 0 ? "" : rest.length === 1 ? rest[0] : null;
  if (page === null || !isSitePage(page)) {
    return null;
  }

  // Always the visitor's current locale: switching locale remounts the layout and
  // would wipe the conversation.
  return { href: getSitePagePath(locale, page), kind: "page", newTab: false };
}

/**
 * Where a link in a chat reply (or a "related page" pill) may point. `null` means
 * "render the label as text".
 *
 * - Same-site links (relative, or absolute on a SITE_HOSTS host) must resolve to a
 *   canonical page of the current locale (SITE_PAGES) or to one of `allowedAssetPaths`.
 * - External http(s) and mailto links must appear in `allowedExternalHrefs`
 *   (`getAllowedExternalHrefs(profile)`, compared with `normalizeExternalHref`), so a
 *   reply can only link to URLs and email addresses written in the content. They render
 *   in their parsed, canonical form and open in a new tab.
 */
export function resolveChatHref(
  href: string,
  locale: Locale,
  allowedAssetPaths: readonly string[] = [],
  allowedExternalHrefs: readonly string[] = []
): ResolvedChatHref | null {
  const value = href.trim();
  if (!isSafeMarkdownHref(value)) {
    return null;
  }

  if (value.startsWith("/")) {
    return resolveSitePath(value, locale, allowedAssetPaths);
  }

  // `./x`, `../x`, `?x` and `#x` depend on whichever page the widget is open on.
  if (/^[.?#]/.test(value)) {
    return null;
  }

  // `https:host` (no slashes) is a path relative to the current page for a browser on
  // an https page, but `https://host` for the URL parser: too ambiguous to render.
  if (/^https?:(?!\/\/)/i.test(value)) {
    return null;
  }

  const url = new URL(value);
  if (url.protocol === "mailto:" || !SITE_HOSTS.has(url.host)) {
    // Credentials in the authority (`https://site.example@evil.example`) only disguise the host.
    if (url.username || url.password) {
      return null;
    }
    const normalized = normalizeExternalHref(value);
    return normalized && allowedExternalHrefs.includes(normalized)
      ? { href: url.href, kind: "external", newTab: true }
      : null;
  }

  // A query or fragment cannot hide in the authority, so testing the whole href is exact.
  return /[?#]/.test(value) ? null : resolveSitePath(url.pathname, locale, allowedAssetPaths);
}

function pushText(tokens: ChatMarkdownInlineToken[], content: string) {
  if (!content) {
    return;
  }

  const last = tokens[tokens.length - 1];
  if (last?.type === "text" && last.droppedHref === undefined) {
    last.content += content;
    return;
  }

  tokens.push({ type: "text", content });
}

export function parseChatMarkdownInline(input: string): ChatMarkdownInlineToken[] {
  const tokens: ChatMarkdownInlineToken[] = [];
  let lastIndex = 0;

  for (const match of input.matchAll(INLINE_PATTERN)) {
    const [
      fullMatch,
      code,
      linkLabel,
      linkHref,
      strong,
      starEm,
      underscorePrefix,
      underscoreEm,
      bareUrl,
      bareEmail,
    ] = match;
    const matchIndex = match.index ?? 0;
    pushText(tokens, input.slice(lastIndex, matchIndex));
    lastIndex = matchIndex + fullMatch.length;

    if (code !== undefined) {
      tokens.push({ type: "code", content: code });
    } else if (linkLabel !== undefined && linkHref !== undefined) {
      const href = linkHref.trim();
      tokens.push(
        isSafeMarkdownHref(href)
          ? { type: "link", content: linkLabel, href }
          : { type: "text", content: linkLabel, droppedHref: href }
      );
    } else if (strong !== undefined) {
      tokens.push({ type: "strong", children: parseChatMarkdownInline(strong) });
    } else if (starEm !== undefined) {
      tokens.push({ type: "em", children: parseChatMarkdownInline(starEm) });
    } else if (underscoreEm !== undefined) {
      pushText(tokens, underscorePrefix ?? "");
      tokens.push({ type: "em", children: parseChatMarkdownInline(underscoreEm) });
    } else if (bareUrl !== undefined) {
      if (isSafeMarkdownHref(bareUrl)) {
        tokens.push({ type: "link", content: bareUrl, href: bareUrl });
      } else {
        pushText(tokens, bareUrl);
      }
    } else if (bareEmail !== undefined) {
      tokens.push({ type: "link", content: bareEmail, href: `mailto:${bareEmail}` });
    }
  }

  pushText(tokens, input.slice(lastIndex));
  return tokens;
}

function matchFenceOpen(line: string) {
  const match = line.match(FENCE_OPEN_PATTERN);
  if (!match) {
    return null;
  }

  const [, indent, marker, info] = match;
  // "```code```" on one line is inline code, not a fence.
  if (marker.startsWith("`") && info.includes("`")) {
    return null;
  }

  const language = info.trim().split(/\s+/)[0];
  return {
    indent: indent.length,
    marker,
    language: LANGUAGE_PATTERN.test(language) ? language : undefined,
  };
}

function isFenceClose(line: string, openMarker: string) {
  const match = line.match(FENCE_CLOSE_PATTERN);
  return Boolean(match && match[1][0] === openMarker[0] && match[1].length >= openMarker.length);
}

function stripIndent(line: string, width: number) {
  let index = 0;
  while (index < width && (line[index] === " " || line[index] === "\t")) {
    index += 1;
  }

  return line.slice(index);
}

type ListKind = "unordered-list" | "ordered-list";

function matchListItem(line: string): { kind: ListKind; text: string; number: number } | null {
  const unordered = line.match(UNORDERED_ITEM_PATTERN);
  if (unordered) {
    return { kind: "unordered-list", text: unordered[1], number: 1 };
  }

  const ordered = line.match(ORDERED_ITEM_PATTERN);
  return ordered ? { kind: "ordered-list", text: ordered[2], number: Number(ordered[1]) } : null;
}

export function parseChatMarkdown(input: string): ChatMarkdownBlock[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ChatMarkdownBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", tokens: parseChatMarkdownInline(paragraph.join("\n")) });
      paragraph = [];
    }
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    const fence = matchFenceOpen(line);
    if (fence) {
      flushParagraph();
      const content: string[] = [];
      let closed = false;
      index += 1;
      while (index < lines.length) {
        const codeLine = lines[index];
        index += 1;
        if (isFenceClose(codeLine, fence.marker)) {
          closed = true;
          break;
        }
        content.push(stripIndent(codeLine, fence.indent));
      }
      blocks.push({ type: "code", content: content.join("\n"), language: fence.language, closed });
      continue;
    }

    const heading = line.match(HEADING_PATTERN);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", tokens: parseChatMarkdownInline(heading[1]) });
      index += 1;
      continue;
    }

    const firstItem = matchListItem(line);
    if (firstItem) {
      flushParagraph();
      const items = [firstItem.text];
      index += 1;

      while (index < lines.length) {
        const next = lines[index];
        const item = matchListItem(next);
        if (item) {
          if (item.kind !== firstItem.kind) {
            break;
          }
          items.push(item.text);
          index += 1;
          continue;
        }

        if (!next.trim()) {
          // Blank lines between items of the same kind keep one ("loose") list.
          let lookahead = index + 1;
          while (lookahead < lines.length && !lines[lookahead].trim()) {
            lookahead += 1;
          }
          const following = lookahead < lines.length ? matchListItem(lines[lookahead]) : null;
          if (following?.kind !== firstItem.kind) {
            break;
          }
          index = lookahead;
          continue;
        }

        // An indented line continues the previous item.
        if (CONTINUATION_PATTERN.test(next) && !matchFenceOpen(next) && !HEADING_PATTERN.test(next)) {
          items[items.length - 1] += `\n${next.trim()}`;
          index += 1;
          continue;
        }

        break;
      }

      const parsedItems = items.map((item) => parseChatMarkdownInline(item));
      blocks.push(
        firstItem.kind === "ordered-list"
          ? { type: "ordered-list", items: parsedItems, start: firstItem.number }
          : { type: "unordered-list", items: parsedItems }
      );
      continue;
    }

    paragraph.push(line.trim());
    index += 1;
  }

  flushParagraph();
  return blocks;
}

/** Every text, code and link token in reading order, including those inside bold or italic. */
export function flattenChatMarkdownTokens(blocks: ChatMarkdownBlock[]): ChatMarkdownLeafToken[] {
  const leaves: ChatMarkdownLeafToken[] = [];
  const visit = (tokens: ChatMarkdownInlineToken[]) => {
    for (const token of tokens) {
      if (token.type === "strong" || token.type === "em") {
        visit(token.children);
      } else {
        leaves.push(token);
      }
    }
  };

  for (const block of blocks) {
    if (block.type === "paragraph" || block.type === "heading") {
      visit(block.tokens);
    } else if (block.type !== "code") {
      block.items.forEach(visit);
    }
  }

  return leaves;
}
