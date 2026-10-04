import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatMessage, getMessages } from "@/content";
import type { ChatClientConfig, ChatMode } from "@/lib/ai/config";
import { ChatWidgetRoot, type ChatWidgetRootProps } from "@/shared/components/ChatWidget";
import { HomeAssistant } from "@/shared/components/HomeAssistant";

const navigation = vi.hoisted(() => ({ pathname: "/en" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const copy = getMessages("en").chat;

/** React's escaping of text and attribute values in server-rendered HTML. */
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

function renderPage(mode: ChatMode, suggestedQuestions: string[] = []) {
  const config: ChatClientConfig = {
    mode,
    historyMode: "client",
    markdownEnabled: true,
    maxTranscriptMessages: 20,
    maxMessageLength: 500,
  };

  const props: ChatWidgetRootProps = {
    locale: "en",
    copy,
    config,
    assistantName: "Alex's AI assistant",
    ownerName: "Alex Example",
    ownerFirstName: "Alex",
    allowedAssetPaths: [],
    allowedExternalHrefs: [],
    children: createElement(HomeAssistant, { suggestedQuestions }),
  };

  return renderToStaticMarkup(createElement(ChatWidgetRoot, props));
}

/** The opening tag of the floating launcher, if rendered. */
function launcherTag(html: string) {
  return html.match(/<button[^>]*aria-haspopup="dialog"[^>]*>/)?.[0];
}

beforeEach(() => {
  navigation.pathname = "/en";
});

describe("chat UI on first render", () => {
  it("never opens the panel or focuses anything on load", () => {
    for (const mode of ["live", "demo", "off"] as const) {
      const html = renderPage(mode, ["What has Alex built?"]);
      expect(html, mode).not.toContain('role="dialog"');
      expect(html, mode).not.toContain("autofocus");
      expect(html, mode).not.toContain("autoFocus");
    }
  });

  it("hides the launcher on the home page, where the assistant card is the entry point", () => {
    expect(launcherTag(renderPage("live"))).toMatch(/class="hidden /);
  });

  it("shows the launcher on other pages", () => {
    navigation.pathname = "/en/about";
    const tag = launcherTag(renderPage("live"));
    expect(tag).toMatch(/class="inline-flex /);
    expect(tag).toContain(`aria-label="${escapeHtml(copy.launcherLabel)}"`);
  });

  it("renders no launcher and a disabled card when chat is off", () => {
    navigation.pathname = "/en/about";
    const html = renderPage("off", ["What has Alex built?"]);
    expect(launcherTag(html)).toBeUndefined();
    expect(html).toContain(escapeHtml(copy.home.disabledTitle));
    expect(html).toContain("You can still browse Alex&#x27;s projects");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("What has Alex built?");
  });

  it("labels demo mode on the card and offers at most three suggestions", () => {
    const html = renderPage("demo", ["One?", "Two?", "Three?", "Four?"]);
    expect(html).toContain(`>${escapeHtml(copy.demoBadge)}</span>`);
    expect(html).toContain(escapeHtml(copy.demoNotice));
    expect(html).toContain("Ask Alex&#x27;s AI assistant");
    expect(html).toContain(`placeholder="${escapeHtml(formatMessage(copy.home.placeholder, { firstName: "Alex" }))}"`);
    expect(html).toContain('maxLength="500"');
    expect(html).toContain(">Three?</button>");
    expect(html).not.toContain("Four?");
  });

  it("shows no demo label in live mode", () => {
    const html = renderPage("live", ["One?"]);
    expect(html).not.toContain(escapeHtml(copy.demoNotice));
    expect(html).toContain(">One?</button>");
  });

  it("gives the question field a 3:1 border (the field token), darker on hover and focus", () => {
    const input = renderPage("live").match(/<input[^>]*>/)?.[0] ?? "";
    expect(input).toMatch(/class="[^"]*\bborder-field\b/);
    expect(input).not.toMatch(/\bborder-line\b/);
    expect(input).toMatch(/\bhover:border-ink\/70\b/);
    expect(input).toMatch(/\bfocus:border-ink\b/);
  });
});
