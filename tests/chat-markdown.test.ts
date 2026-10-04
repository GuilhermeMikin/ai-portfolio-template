import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getAllowedExternalHrefs } from "@/content/format";
import type { Profile } from "@/content/schema";
import { ChatMarkdown } from "@/shared/components/ChatMarkdown";
import {
  flattenChatMarkdownTokens,
  isSafeMarkdownHref,
  parseChatMarkdown,
  parseChatMarkdownInline,
  resolveChatHref,
} from "@/shared/components/ChatMarkdown/markdown";
import { SITE_URL } from "@/shared/config/site";

const text = (content: string) => ({ type: "text", content });

/** Normalized external links, as `getAllowedExternalHrefs(profile)` returns them. */
const EXTERNAL = ["https://docs.example.com/guide", "https://github.com/example", "mailto:hello@example.com"];

function render(markdown: string, allowedAssetPaths: string[] = [], allowedExternalHrefs: string[] = EXTERNAL) {
  return renderToStaticMarkup(
    createElement(ChatMarkdown, {
      text: markdown,
      locale: "en",
      allowedAssetPaths,
      allowedExternalHrefs,
      newTabLabel: "(opens in a new tab)",
      codeBlockLabel: "Code",
    })
  );
}

describe("parseChatMarkdown: blocks", () => {
  it("splits paragraphs on blank lines and keeps single line breaks", () => {
    expect(parseChatMarkdown("First line\nsecond line\n\nSecond paragraph")).toEqual([
      { type: "paragraph", tokens: [text("First line\nsecond line")] },
      { type: "paragraph", tokens: [text("Second paragraph")] },
    ]);
  });

  it("returns no blocks for empty or blank input", () => {
    expect(parseChatMarkdown("")).toEqual([]);
    expect(parseChatMarkdown(" \n\n ")).toEqual([]);
  });

  it("parses bullet lists, with any bullet marker", () => {
    expect(parseChatMarkdown("Highlights:\n- One\n* Two\n+ Three")).toEqual([
      { type: "paragraph", tokens: [text("Highlights:")] },
      { type: "unordered-list", items: [[text("One")], [text("Two")], [text("Three")]] },
    ]);
  });

  it("parses numbered lists and keeps their start number", () => {
    expect(parseChatMarkdown("1. One\n2. Two")).toEqual([
      { type: "ordered-list", start: 1, items: [[text("One")], [text("Two")]] },
    ]);
    expect(parseChatMarkdown("3) Three\n4) Four")).toEqual([
      { type: "ordered-list", start: 3, items: [[text("Three")], [text("Four")]] },
    ]);
  });

  it("keeps a loose list (blank lines between items) as one list", () => {
    const blocks = parseChatMarkdown("1. One\n\n2. Two\n\n3. Three");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "ordered-list", items: [[text("One")], [text("Two")], [text("Three")]] });
  });

  it("joins indented continuation lines to the previous item", () => {
    expect(parseChatMarkdown("- **Title**\n  More detail\n- Next")).toEqual([
      {
        type: "unordered-list",
        items: [[{ type: "strong", children: [text("Title")] }, text("\nMore detail")], [text("Next")]],
      },
    ]);
  });

  it("does not mistake emphasis or numbers for list items", () => {
    expect(parseChatMarkdown("*Italic* start")[0].type).toBe("paragraph");
    expect(parseChatMarkdown("-1 degrees")[0].type).toBe("paragraph");
  });

  it("parses # to ### headings as heading blocks", () => {
    expect(parseChatMarkdown("# Title\n## Sub\n### Third ###\nBody")).toEqual([
      { type: "heading", tokens: [text("Title")] },
      { type: "heading", tokens: [text("Sub")] },
      { type: "heading", tokens: [text("Third")] },
      { type: "paragraph", tokens: [text("Body")] },
    ]);
    expect(parseChatMarkdown("#hashtag")).toEqual([{ type: "paragraph", tokens: [text("#hashtag")] }]);
  });

  it("parses a closed fenced code block with its language, verbatim", () => {
    expect(parseChatMarkdown("Example:\n```ts\nconst a = **1**;\n  <b>x</b>\n```\nAfter")).toEqual([
      { type: "paragraph", tokens: [text("Example:")] },
      { type: "code", content: "const a = **1**;\n  <b>x</b>", language: "ts", closed: true },
      { type: "paragraph", tokens: [text("After")] },
    ]);
  });

  it("supports tilde fences and fences without a language", () => {
    expect(parseChatMarkdown("~~~\nplain\n~~~")).toEqual([
      { type: "code", content: "plain", language: undefined, closed: true },
    ]);
  });

  it("renders an unclosed fence (mid-stream) as code so far", () => {
    expect(parseChatMarkdown("Run:\n```python\nprint('hi')\n# a comment")).toEqual([
      { type: "paragraph", tokens: [text("Run:")] },
      { type: "code", content: "print('hi')\n# a comment", language: "python", closed: false },
    ]);
    expect(parseChatMarkdown("```")).toEqual([{ type: "code", content: "", language: undefined, closed: false }]);
  });

  it("only closes a fence with the same marker, at least as long", () => {
    expect(parseChatMarkdown("````\n```\nstill code\n````")).toEqual([
      { type: "code", content: "```\nstill code", language: undefined, closed: true },
    ]);
  });

  it("treats ```code``` on a single line as inline code, not a fence", () => {
    expect(parseChatMarkdown("```npm test```")[0].type).toBe("paragraph");
  });
});

describe("parseChatMarkdownInline", () => {
  it("parses bold and italic (* and _)", () => {
    expect(parseChatMarkdownInline("**bold**, *italic* and _also_.")).toEqual([
      { type: "strong", children: [text("bold")] },
      text(", "),
      { type: "em", children: [text("italic")] },
      text(" and "),
      { type: "em", children: [text("also")] },
      text("."),
    ]);
  });

  it("parses emphasis nested in bold, and links inside bold", () => {
    expect(parseChatMarkdownInline("**see *this* [About](/about)**")).toEqual([
      {
        type: "strong",
        children: [text("see "), { type: "em", children: [text("this")] }, text(" "), { type: "link", content: "About", href: "/about" }],
      },
    ]);
  });

  it("leaves arithmetic, snake_case and unclosed markers as text", () => {
    expect(parseChatMarkdownInline("2 * 3 * 4")).toEqual([text("2 * 3 * 4")]);
    expect(parseChatMarkdownInline("use snake_case_names")).toEqual([text("use snake_case_names")]);
    expect(parseChatMarkdownInline("**still streaming")).toEqual([text("**still streaming")]);
  });

  it("parses inline code literally", () => {
    expect(parseChatMarkdownInline("Run `pnpm **dev**` locally")).toEqual([
      text("Run "),
      { type: "code", content: "pnpm **dev**" },
      text(" locally"),
    ]);
  });

  it("keeps safe links and turns unsafe ones into their label", () => {
    expect(parseChatMarkdownInline("[Projects](/projects)")).toEqual([
      { type: "link", content: "Projects", href: "/projects" },
    ]);

    const tokens = parseChatMarkdownInline("[Bad](javascript:alert(1)) [Sneaky](/\\evil.example.com)");
    expect(tokens.some((token) => token.type === "link")).toBe(false);
    expect(tokens).toContainEqual({ type: "text", content: "Bad", droppedHref: "javascript:alert(1)" });
    expect(tokens).toContainEqual({ type: "text", content: "Sneaky", droppedHref: "/\\evil.example.com" });
  });
});

describe("raw HTML", () => {
  it("is parsed as plain text", () => {
    expect(parseChatMarkdown("<script>alert('x')</script>")).toEqual([
      { type: "paragraph", tokens: [text("<script>alert('x')</script>")] },
    ]);
  });

  it("is escaped when rendered, in text and in code", () => {
    const html = render('<script>alert("x")</script>\n\n<img src=x onerror=alert(1)>\n\n```html\n<b>bold</b>\n```');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });
});

describe("ChatMarkdown rendering", () => {
  it("renders headings as bold paragraphs, never as h-tags", () => {
    const html = render("# Title\n\nBody");
    expect(html).not.toMatch(/<h[1-6]/);
    expect(html).toContain('<p class="whitespace-pre-wrap font-semibold">Title</p>');
  });

  it("renders code blocks that scroll inside the bubble, with the language label", () => {
    const html = render("```ts\nconst answer = 42;\n```");
    expect(html).toMatch(/<pre [^>]*class="[^"]*overflow-x-auto[^"]*"><code>const answer = 42;<\/code><\/pre>/);
    expect(html).toContain(">ts</p>");
  });

  it("makes code blocks keyboard-scrollable, named regions", () => {
    expect(render("```ts\nconst answer = 42;\n```")).toMatch(/<pre tabindex="0" role="region" aria-label="ts"/);
    expect(render("```\nplain\n```")).toMatch(/<pre tabindex="0" role="region" aria-label="Code"/);
  });

  it("renders page links in the current locale, allowed external links in a new tab, rejected links as text", () => {
    const html = render(
      "[About](/about), [Docs](https://docs.example.com/guide), [Evil](//evil.example.com) and [Gone](/blog)"
    );
    expect(html).toContain('href="/en/about"');
    expect(html).toMatch(/<a [^>]*href="https:\/\/docs\.example\.com\/guide"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    expect(html).toContain('<span class="sr-only"> (opens in a new tab)</span>');
    // Rejected by the parser (unsafe) or by the resolver (unknown page): label only.
    expect(html).not.toContain("evil.example.com");
    expect(html).toContain(", Evil and ");
    expect(html).toContain("<span>Gone</span>");
    expect(html).not.toContain('href="/blog"');
  });

  it("renders external links that are not in the allow-list as their label", () => {
    const html = render(
      [
        "[Unknown](https://unknown.example.net/page)",
        "[Lookalike](https://github.com.evil.example/example)",
        "[Creds](http://localhost:3000@evil.example/about)",
        "[NoSlashes](https:evil.example)",
        "[Bcc](mailto:hello@example.com?bcc=spy@evil.example)",
      ].join(" ")
    );
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("unknown.example.net");
    for (const label of ["Unknown", "Lookalike", "Creds", "NoSlashes", "Bcc"]) {
      expect(html).toContain(`<span>${label}</span>`);
    }
  });

  it("renders no external links at all without an allow-list", () => {
    const html = render("[Docs](https://docs.example.com/guide) [Mail](mailto:hello@example.com)", [], []);
    expect(html).not.toContain("<a ");
    expect(html).toContain("<span>Docs</span>");
    expect(html).toContain("<span>Mail</span>");
  });

  it("renders ordered lists with their start number", () => {
    expect(render("4. Four\n5. Five")).toContain('<ol start="4"');
  });
});

describe("flattenChatMarkdownTokens", () => {
  it("returns every leaf token, including links nested in emphasis, but not code blocks", () => {
    const tokens = flattenChatMarkdownTokens(
      parseChatMarkdown("**[About](/about)**\n\n- *[Resume](/resume)*\n\n```\n[Not](/a-link)\n```")
    );
    expect(tokens.filter((token) => token.type === "link").map((token) => token.content)).toEqual(["About", "Resume"]);
  });
});

describe("isSafeMarkdownHref", () => {
  it("accepts http(s), mailto and relative references", () => {
    for (const href of ["https://docs.example.com", "http://docs.example.com", "mailto:hello@example.com", "/about", "./x", "#top"]) {
      expect(isSafeMarkdownHref(href), href).toBe(true);
    }
  });

  it("rejects other schemes, protocol-relative URLs, backslashes and embedded whitespace", () => {
    for (const href of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "vbscript:x", "//evil.example.com", "/\\evil.example.com", "\\\\evil.example.com", "java\tscript:alert(1)", "/a b", ""]) {
      expect(isSafeMarkdownHref(href), href).toBe(false);
    }
  });
});

describe("resolveChatHref", () => {
  const asset = "/resume.pdf";

  it("resolves site pages to the current locale", () => {
    expect(resolveChatHref("/about", "en")).toEqual({ href: "/en/about", kind: "page", newTab: false });
    expect(resolveChatHref("/en/projects/", "en")).toEqual({ href: "/en/projects", kind: "page", newTab: false });
    expect(resolveChatHref("/", "en")).toEqual({ href: "/en", kind: "page", newTab: false });
    expect(resolveChatHref(" /contact ", "en")).toEqual({ href: "/en/contact", kind: "page", newTab: false });
  });

  it("returns null for unknown or deep site paths", () => {
    expect(resolveChatHref("/blog", "en")).toBeNull();
    expect(resolveChatHref("/en/projects/csv-validator", "en")).toBeNull();
    expect(resolveChatHref("/EN/about", "en")).toBeNull();
  });

  it("rejects protocol-relative and backslash tricks", () => {
    expect(resolveChatHref("//evil.example.com", "en")).toBeNull();
    expect(resolveChatHref("/\\evil.example.com", "en")).toBeNull();
    expect(resolveChatHref("\\\\evil.example.com", "en")).toBeNull();
    expect(resolveChatHref("https:\\\\evil.example.com", "en")).toBeNull();
  });

  it("rejects script and data URLs", () => {
    expect(resolveChatHref("javascript:alert(1)", "en")).toBeNull();
    expect(resolveChatHref(" JavaScript:alert(1)", "en")).toBeNull();
    expect(resolveChatHref("data:text/html,<b>x</b>", "en")).toBeNull();
  });

  it("allows mailto and external https links from the allow-list, opened in a new tab", () => {
    expect(resolveChatHref("mailto:hello@example.com", "en", [], EXTERNAL)).toEqual({
      href: "mailto:hello@example.com",
      kind: "external",
      newTab: true,
    });
    expect(resolveChatHref("https://docs.example.com/guide", "en", [], EXTERNAL)).toEqual({
      href: "https://docs.example.com/guide",
      kind: "external",
      newTab: true,
    });
  });

  it("compares external links in normalized form and renders the parsed URL", () => {
    expect(resolveChatHref("HTTPS://GitHub.com/example/", "en", [], EXTERNAL)).toEqual({
      href: "https://github.com/example/",
      kind: "external",
      newTab: true,
    });
    expect(resolveChatHref("mailto:Hello@Example.com", "en", [], EXTERNAL)).toMatchObject({ kind: "external" });
  });

  it("accepts the URLs and email addresses written in the content", () => {
    // Only the fields getAllowedExternalHrefs walks; not a complete profile.
    const allowed = getAllowedExternalHrefs({
      contact: {
        email: "owner@example.com",
        social: [{ platform: "github", label: "GitHub", href: "https://github.com/owner/" }],
      },
      about: { bio: ["Notes at https://notes.example.com/post."] },
    } as unknown as Profile);
    expect(resolveChatHref("mailto:owner@example.com", "en", [], allowed)).toMatchObject({ kind: "external" });
    expect(resolveChatHref("https://github.com/owner", "en", [], allowed)).toMatchObject({ kind: "external" });
    expect(resolveChatHref("https://notes.example.com/post", "en", [], allowed)).toMatchObject({ kind: "external" });
    expect(resolveChatHref("https://github.com/someone-else", "en", [], allowed)).toBeNull();
  });

  it("rejects external links that are not in the allow-list", () => {
    // No allow-list: no external links at all.
    for (const href of ["https://docs.example.com/guide", "mailto:hello@example.com"]) {
      expect(resolveChatHref(href, "en"), href).toBeNull();
    }
    for (const href of [
      "https://unknown.example.net",
      "https://docs.example.com/other",
      "https://docs.example.com/guide?ref=chat",
      "https://docs.example.com/guide#top",
      "https://docs.example.com.evil.example/guide",
      "https://github.com/example-evil",
      "http://localhost:3000@evil.example",
      "https://docs.example.com@evil.example/guide",
      "https://user:pass@docs.example.com/guide",
      "https:evil.example",
      "https:docs.example.com/guide",
      "http:/docs.example.com/guide",
      "mailto:hello@example.com?bcc=spy@evil.example",
      "mailto:hello@example.com,spy@evil.example",
      "mailto:spy@evil.example",
    ]) {
      expect(resolveChatHref(href, "en", [], EXTERNAL), href).toBeNull();
    }
  });

  it("allows an asset path only when it is in allowedAssetPaths", () => {
    expect(resolveChatHref(asset, "en")).toBeNull();
    expect(resolveChatHref(asset, "en", [asset])).toEqual({ href: asset, kind: "asset", newTab: true });
    // Files are not localized.
    expect(resolveChatHref(`/en${asset}`, "en", [asset])).toEqual({ href: asset, kind: "asset", newTab: true });
    expect(resolveChatHref("/other.pdf", "en", [asset])).toBeNull();
  });

  it("rejects a query or hash on site paths", () => {
    expect(resolveChatHref("/about?tab=1", "en")).toBeNull();
    expect(resolveChatHref("/en/about#bio", "en")).toBeNull();
    expect(resolveChatHref(`${asset}?v=2`, "en", [asset])).toBeNull();
  });

  it("rejects references relative to the current page", () => {
    expect(resolveChatHref("#projects", "en")).toBeNull();
    expect(resolveChatHref("?tab=1", "en")).toBeNull();
    expect(resolveChatHref("./about", "en")).toBeNull();
    expect(resolveChatHref("../about", "en")).toBeNull();
    expect(resolveChatHref("about", "en")).toBeNull();
  });

  it("treats absolute URLs on this site like site paths", () => {
    expect(resolveChatHref(`${SITE_URL}/about`, "en")).toEqual({ href: "/en/about", kind: "page", newTab: false });
    expect(resolveChatHref(`${SITE_URL}/about#bio`, "en")).toBeNull();
    expect(resolveChatHref(`${SITE_URL}/blog`, "en")).toBeNull();
    expect(resolveChatHref(`${SITE_URL}${asset}`, "en", [asset])).toEqual({ href: asset, kind: "asset", newTab: true });
  });
});

describe("links with parentheses in the target", () => {
  it("keeps balanced parentheses inside the URL", () => {
    const [block] = parseChatMarkdown("See [Foo](https://example.com/wiki/Foo_(bar)) now");
    const link = flattenChatMarkdownTokens([block]).find((token) => token.type === "link");
    expect(link).toMatchObject({ type: "link", href: "https://example.com/wiki/Foo_(bar)" });
  });

  it("drops an unsafe target with parentheses without leaving stray characters", () => {
    const [block] = parseChatMarkdown("Try [this](javascript:alert(1)) please");
    const text = flattenChatMarkdownTokens([block])
      .map((token) => ("content" in token ? token.content : ""))
      .join("");
    expect(text).toBe("Try this please");
  });
});
