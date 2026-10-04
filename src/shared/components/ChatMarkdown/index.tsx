import Link from "next/link";
import type { ReactNode } from "react";

import type { Locale } from "@/shared/config/site";

import {
  parseChatMarkdown,
  resolveChatHref,
  type ChatMarkdownBlock,
  type ChatMarkdownInlineToken,
} from "./markdown";

export type ChatMarkdownProps = {
  text: string;
  /** Page links always point to this locale. */
  locale: Locale;
  /** Site files (such as the résumé PDF) that links may point to: `getSiteAssetPaths(profile)`. */
  allowedAssetPaths?: readonly string[];
  /**
   * External URLs and email addresses that links may point to, normalized:
   * `getAllowedExternalHrefs(profile)`. Any other external link renders as its label.
   */
  allowedExternalHrefs?: readonly string[];
  /** Called with the page path when a page link starts a client-side navigation. */
  onNavigate?: (href: string) => void;
  /** Visually hidden suffix for links that open in a new tab, e.g. "(opens in a new tab)". */
  newTabLabel?: string;
  /** Accessible name of a fenced code block without a language, e.g. "Code". */
  codeBlockLabel: string;
};

type RenderContext = Omit<ChatMarkdownProps, "text" | "allowedAssetPaths" | "allowedExternalHrefs"> & {
  allowedAssetPaths: readonly string[];
  allowedExternalHrefs: readonly string[];
};

const LINK_CLASS_NAME =
  "font-medium text-ink underline decoration-ink/30 underline-offset-2 transition-colors hover:decoration-ink";

function renderLink(
  token: Extract<ChatMarkdownInlineToken, { type: "link" }>,
  key: string,
  context: RenderContext
): ReactNode {
  const resolved = resolveChatHref(
    token.href,
    context.locale,
    context.allowedAssetPaths,
    context.allowedExternalHrefs
  );
  if (!resolved) {
    return <span key={key}>{token.content}</span>;
  }

  if (!resolved.newTab) {
    const { onNavigate } = context;
    // Client-side navigation keeps the conversation (it lives in the layout).
    return (
      <Link
        key={key}
        href={resolved.href}
        onNavigate={onNavigate ? () => onNavigate(resolved.href) : undefined}
        className={LINK_CLASS_NAME}
      >
        {token.content}
      </Link>
    );
  }

  return (
    <a key={key} href={resolved.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS_NAME}>
      {token.content}
      {context.newTabLabel ? <span className="sr-only"> {context.newTabLabel}</span> : null}
    </a>
  );
}

function renderInline(tokens: ChatMarkdownInlineToken[], keyPrefix: string, context: RenderContext): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (token.type) {
      case "text":
        return token.content;
      case "code":
        return (
          <code key={key} className="rounded-md border border-line bg-surface px-1 py-px font-mono text-[0.85em]">
            {token.content}
          </code>
        );
      case "strong":
        return (
          <strong key={key} className="font-semibold">
            {renderInline(token.children, key, context)}
          </strong>
        );
      case "em":
        return <em key={key}>{renderInline(token.children, key, context)}</em>;
      case "link":
        return renderLink(token, key, context);
    }
  });
}

function renderBlock(block: ChatMarkdownBlock, key: string, context: RenderContext): ReactNode {
  switch (block.type) {
    case "paragraph":
      return (
        <p key={key} className="whitespace-pre-wrap">
          {renderInline(block.tokens, key, context)}
        </p>
      );
    case "heading":
      // Not an h-tag: replies must not add entries to the page outline.
      return (
        <p key={key} className="whitespace-pre-wrap font-semibold">
          {renderInline(block.tokens, key, context)}
        </p>
      );
    case "unordered-list":
    case "ordered-list": {
      const items = block.items.map((item, index) => (
        <li key={`${key}-${index}`} className="whitespace-pre-wrap pl-0.5">
          {renderInline(item, `${key}-${index}`, context)}
        </li>
      ));
      return block.type === "ordered-list" ? (
        <ol key={key} start={block.start} className="list-decimal space-y-1 pl-5 marker:text-muted">
          {items}
        </ol>
      ) : (
        <ul key={key} className="list-disc space-y-1 pl-5 marker:text-muted">
          {items}
        </ul>
      );
    }
    case "code":
      return (
        <div key={key} className="max-w-full overflow-hidden rounded-xl border border-line bg-surface">
          {block.language ? (
            <p className="border-b border-line px-3 py-1 font-mono text-xs text-muted">{block.language}</p>
          ) : null}
          {/* Focusable so keyboard users can scroll long lines; the focus ring is inset
              because the rounded wrapper clips anything outside it. */}
          <pre
            tabIndex={0}
            role="region"
            aria-label={block.language ?? context.codeBlockLabel}
            className={`${block.language ? "rounded-b-xl" : "rounded-xl"} overflow-x-auto px-3 py-2.5 font-mono text-[13px] leading-5 text-ink focus-visible:-outline-offset-2`}
          >
            <code>{block.content}</code>
          </pre>
        </div>
      );
  }
}

/**
 * Renders an assistant reply. Output is built from React elements only (never raw
 * HTML), and links go through `resolveChatHref`; anything it rejects stays plain text.
 */
export function ChatMarkdown({
  text,
  locale,
  allowedAssetPaths = [],
  allowedExternalHrefs = [],
  onNavigate,
  newTabLabel,
  codeBlockLabel,
}: ChatMarkdownProps) {
  const context: RenderContext = {
    locale,
    allowedAssetPaths,
    allowedExternalHrefs,
    onNavigate,
    newTabLabel,
    codeBlockLabel,
  };

  return (
    <div className="min-w-0 space-y-3 break-words">
      {parseChatMarkdown(text).map((block, index) => renderBlock(block, `b${index}`, context))}
    </div>
  );
}
