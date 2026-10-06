"use client";

import { ArrowUp, CircleAlert, MessageCircle, MoveDiagonal2, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { ChatMessages } from "@/content";
import { formatMessage } from "@/content/format";
import type { ChatClientConfig, ChatMode } from "@/lib/ai/config";
import {
  CHAT_HISTORY_ASSISTANT_MAX_LENGTH,
  CHAT_HISTORY_MAX_MESSAGES,
  type ChatHistoryEntry,
} from "@/lib/ai/types";
import { ChatMarkdown } from "@/shared/components/ChatMarkdown";
import { resolveChatHref } from "@/shared/components/ChatMarkdown/markdown";
import type { Locale } from "@/shared/config/site";

import {
  NETWORK_ERROR_CODE,
  buildChatHistory,
  countCompletedMessages,
  createChatId,
  describeChatFailure,
  readChatStream,
  toChatFailure,
  type ChatAssistantMessage,
  type ChatFailure,
  type ChatMessage,
} from "./chat-client";

const CHAT_ENDPOINT = "/api/chat";
/** Tailwind's `md` breakpoint: a docked panel above it, a full-screen sheet below. */
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
const COMPOSER_MAX_HEIGHT_PX = 160;
const STICK_TO_BOTTOM_THRESHOLD_PX = 96;
const PANEL_MIN_WIDTH_PX = 360;
const PANEL_MIN_HEIGHT_PX = 400;
const PANEL_VIEWPORT_MARGIN_PX = 48;
/** The `<main>` element of the locale layout (focusable with tabIndex={-1}). */
const MAIN_CONTENT_ID = "main-content";
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SOURCE_PILL_CLASS_NAME =
  "rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-ink/30";
const ICON_BUTTON_CLASS_NAME =
  "inline-flex items-center justify-center rounded-xl text-muted transition-colors hover:bg-subtle hover:text-ink";

/**
 * Props are computed on the server (the locale layout) because the content and the chat
 * config are server-only modules; everything passed here reaches the browser.
 */
export type ChatWidgetRootProps = {
  children: React.ReactNode;
  locale: Locale;
  /** `getMessages(locale).chat` */
  copy: ChatMessages;
  /** `getChatClientConfig()` */
  config: ChatClientConfig;
  /** `profile.assistant.name` */
  assistantName: string;
  /** `profile.person.name` */
  ownerName: string;
  /** `getFirstName(profile)` */
  ownerFirstName: string;
  /** `getSiteAssetPaths(profile)`: site files replies may link to. */
  allowedAssetPaths: string[];
  /**
   * `getAllowedExternalHrefs(profile)`: the external URLs and email addresses (normalized)
   * replies may link to. Any other external link in a reply renders as plain text.
   */
  allowedExternalHrefs: string[];
};

export type OpenChatOptions = {
  /** Receives focus again when the panel closes (defaults to the focused element). */
  returnFocusTo?: HTMLElement | null;
};

export type ChatWidgetContextValue = {
  mode: ChatMode;
  copy: ChatMessages;
  locale: Locale;
  maxMessageLength: number;
  assistantName: string;
  ownerName: string;
  ownerFirstName: string;
  /** `{name}`, `{firstName}` and `{assistantName}` for `formatMessage`. */
  messageValues: { name: string; firstName: string; assistantName: string };
  isOpen: boolean;
  isStreaming: boolean;
  isTranscriptCapReached: boolean;
  /** Opens the panel (no-op when chat is off). */
  openChat: (options?: OpenChatOptions) => void;
  closeChat: () => void;
  /**
   * Opens the panel and sends `question`. Focus goes to the dialog, not the composer, so a
   * phone keyboard does not cover the answer. While a reply is still streaming the question
   * is left in the composer instead. Returns false when it was neither sent nor kept.
   */
  askQuestion: (question: string, options?: OpenChatOptions) => boolean;
};

type PanelSize = { width: number; height: number };
type ResizeStart = PanelSize & { x: number; y: number };
/** A link in the chat closed the panel on a phone and is navigating `from` → `to`. */
type PendingNavigation = { from: string; to: string };

const ChatWidgetContext = createContext<ChatWidgetContextValue | null>(null);

export function useChatWidget(): ChatWidgetContextValue {
  const context = useContext(ChatWidgetContext);
  if (!context) {
    throw new Error("useChatWidget must be used inside <ChatWidgetRoot>.");
  }

  return context;
}

function matchesMedia(query: string) {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** Mouse or trackpad: focusing a text field will not pop up an on-screen keyboard. */
function hasFinePointer() {
  return matchesMedia("(pointer: fine)");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampPanelSize({ width, height }: PanelSize): PanelSize {
  const maxWidth = Math.max(PANEL_MIN_WIDTH_PX, window.innerWidth - PANEL_VIEWPORT_MARGIN_PX);
  const maxHeight = Math.max(PANEL_MIN_HEIGHT_PX, window.innerHeight - PANEL_VIEWPORT_MARGIN_PX);
  return {
    width: clamp(width, PANEL_MIN_WIDTH_PX, maxWidth),
    height: clamp(height, PANEL_MIN_HEIGHT_PX, maxHeight),
  };
}

function isEventStream(response: Response) {
  return response.headers.get("content-type")?.includes("text/event-stream") ?? false;
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2 text-muted">
      <span aria-hidden="true" className="flex gap-1">
        <span className="size-1.5 rounded-full bg-muted motion-safe:animate-pulse" />
        <span className="size-1.5 rounded-full bg-muted motion-safe:animate-pulse [animation-delay:200ms]" />
        <span className="size-1.5 rounded-full bg-muted motion-safe:animate-pulse [animation-delay:400ms]" />
      </span>
      {label}
    </span>
  );
}

function RetryButton({
  retryAt,
  label,
  countdownTemplate,
  onRetry,
}: {
  retryAt?: number;
  label: string;
  countdownTemplate: string;
  onRetry: () => void;
}) {
  // `null` until the first tick: disabled, without a number yet.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(retryAt ? null : 0);

  useEffect(() => {
    if (!retryAt) {
      return;
    }

    let intervalId = 0;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setSecondsLeft(seconds);
      if (seconds === 0) {
        window.clearInterval(intervalId);
      }
    };
    const timeoutId = window.setTimeout(tick, 0);
    intervalId = window.setInterval(tick, 1000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [retryAt]);

  const waiting = secondsLeft !== 0;

  return (
    <button
      type="button"
      disabled={waiting}
      onClick={onRetry}
      aria-label={label}
      className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-xs font-medium text-ink transition-colors hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RotateCcw aria-hidden="true" className="size-3.5" />
      {/* Visual only: inside the live log a ticking countdown would be read out every second. */}
      <span aria-hidden="true">
        {secondsLeft ? formatMessage(countdownTemplate, { seconds: secondsLeft }) : label}
      </span>
    </button>
  );
}

type ChatMessageItemProps = {
  message: ChatMessage;
  copy: ChatMessages;
  locale: Locale;
  assistantName: string;
  allowedAssetPaths: readonly string[];
  allowedExternalHrefs: readonly string[];
  markdownEnabled: boolean;
  /** Receives the page path when a link in the message starts a client-side navigation. */
  onNavigate: (href: string) => void;
  /** Only the latest reply can be retried. */
  onRetry?: (reply: ChatAssistantMessage) => void;
};

/** Memoized: while a reply streams, only its own bubble re-renders. */
const ChatMessageItem = memo(function ChatMessageItem({
  message,
  copy,
  locale,
  assistantName,
  allowedAssetPaths,
  allowedExternalHrefs,
  markdownEnabled,
  onNavigate,
  onRetry,
}: ChatMessageItemProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="min-w-0 max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-strong px-4 py-2.5 text-sm leading-6 text-on-strong">
          <span className="sr-only">{copy.userLabel}: </span>
          {message.text}
        </p>
      </div>
    );
  }

  const sourceLinks: { href: string; label: string; newTab: boolean }[] = [];
  for (const source of message.sources ?? []) {
    const resolved = resolveChatHref(source.href, locale, allowedAssetPaths, allowedExternalHrefs);
    if (resolved && !sourceLinks.some((link) => link.href === resolved.href)) {
      sourceLinks.push({ href: resolved.href, label: source.label, newTab: resolved.newTab });
    }
  }

  const { error } = message;

  return (
    <div className="flex justify-start">
      <div className="min-w-0 max-w-[92%] rounded-2xl rounded-bl-md bg-subtle px-4 py-3 text-sm leading-6 text-ink">
        <span className="sr-only">{assistantName}: </span>
        {message.status === "streaming" && !message.text ? <TypingIndicator label={copy.typing} /> : null}

        {message.text ? (
          markdownEnabled ? (
            <ChatMarkdown
              text={message.text}
              locale={locale}
              allowedAssetPaths={allowedAssetPaths}
              allowedExternalHrefs={allowedExternalHrefs}
              onNavigate={onNavigate}
              newTabLabel={copy.opensInNewTab}
              codeBlockLabel={copy.codeBlock}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          )
        ) : null}

        {message.status === "error" && error ? (
          <div className={message.text ? "mt-3 border-t border-line pt-3" : undefined}>
            <p className="flex gap-2">
              <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted" />
              <span>{error.message}</span>
            </p>
            {onRetry && error.retryable ? (
              <RetryButton
                retryAt={error.retryAt}
                label={copy.retry}
                countdownTemplate={copy.retryIn}
                onRetry={() => onRetry(message)}
              />
            ) : null}
          </div>
        ) : null}

        {sourceLinks.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-xs font-medium text-muted">{copy.sourcesLabel}</span>
            {sourceLinks.map((link) =>
              link.newTab ? (
                <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className={SOURCE_PILL_CLASS_NAME}>
                  {link.label}
                  <span className="sr-only"> {copy.opensInNewTab}</span>
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  onNavigate={() => onNavigate(link.href)}
                  className={SOURCE_PILL_CLASS_NAME}
                >
                  {link.label}
                </Link>
              )
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
});

/**
 * Chat state and UI for the whole site: the floating launcher, the conversation panel
 * (a modal dialog) and the context `HomeAssistant` uses to ask questions. The transcript
 * lives here, in the locale layout, so it survives client-side navigation.
 */
export function ChatWidgetRoot({
  children,
  locale,
  copy,
  config,
  assistantName,
  ownerName,
  ownerFirstName,
  allowedAssetPaths,
  allowedExternalHrefs,
}: ChatWidgetRootProps) {
  const { mode, historyMode, markdownEnabled, maxTranscriptMessages, maxMessageLength } = config;
  const enabled = mode !== "off";
  const errorCopy = copy.errors;
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [serverCapReached, setServerCapReached] = useState(false);
  const [panelSize, setPanelSize] = useState<PanelSize | null>(null);

  const titleId = useId();
  const subtitleId = useId();
  const inputId = useId();
  const counterId = useId();
  const statusId = useId();

  const dialogRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const openFocusRef = useRef<"composer" | "dialog">("dialog");
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(true);
  const wasOpenRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const resizeStartRef = useRef<ResizeStart | null>(null);
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);

  const historyEnabled = historyMode === "client";
  const isTranscriptCapReached =
    serverCapReached || (historyEnabled && countCompletedMessages(messages) >= maxTranscriptMessages);
  const isLauncherHidden = isOpen;
  const messageValues = useMemo(
    () => ({ name: ownerName, firstName: ownerFirstName, assistantName }),
    [assistantName, ownerFirstName, ownerName]
  );

  const runRequest = useCallback(
    async (assistantId: string, question: string, history: ChatHistoryEntry[] | undefined) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      const updateReply = (update: (reply: ChatAssistantMessage) => ChatAssistantMessage) => {
        if (controller.signal.aborted) {
          return;
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId && message.role === "assistant" ? update(message) : message
          )
        );
      };

      const fail = (failure: ChatFailure) => {
        if (controller.signal.aborted) {
          return;
        }
        const view = describeChatFailure(failure, errorCopy, maxMessageLength);
        if (view.transcriptCapReached) {
          setServerCapReached(true);
        }
        const retryAt = view.retryAfterMs ? Date.now() + view.retryAfterMs : undefined;
        updateReply((reply) => ({
          ...reply,
          status: "error",
          error: { message: view.message, retryable: view.retryable, retryAt },
        }));
      };

      try {
        conversationIdRef.current ??= createChatId("conv");
        const response = await fetch(CHAT_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({
            locale,
            message: question,
            conversationId: conversationIdRef.current,
            ...(history ? { messages: history } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body || !isEventStream(response)) {
          fail(toChatFailure(response.status, await readJsonBody(response), response.headers.get("Retry-After")));
          return;
        }

        let finished = false;
        await readChatStream(response.body, (frame) => {
          if (finished) {
            return;
          }
          switch (frame.type) {
            case "chunk":
              updateReply((reply) => ({ ...reply, text: reply.text + frame.delta }));
              break;
            case "sources":
              updateReply((reply) => ({ ...reply, sources: frame.items }));
              break;
            case "error":
              finished = true;
              fail(frame);
              break;
            case "done":
              finished = true;
              updateReply((reply) =>
                reply.text.trim()
                  ? { ...reply, status: "done" }
                  : { ...reply, status: "error", error: { message: errorCopy.generic, retryable: true } }
              );
              break;
          }
        });

        // The connection closed before the server said it was done.
        if (!finished) {
          fail({ code: NETWORK_ERROR_CODE, retryable: true });
        }
      } catch {
        fail({ code: NETWORK_ERROR_CODE, retryable: true });
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsStreaming(false);
        }
      }
    },
    [errorCopy, locale, maxMessageLength]
  );

  /** Sends a new question, or re-sends the question of the failed reply `retryId`. */
  const sendQuestion = useCallback(
    (text: string, retryId?: string) => {
      const question = text.trim().slice(0, maxMessageLength);
      if (!enabled || !question || abortRef.current || isTranscriptCapReached) {
        return false;
      }

      const history = historyEnabled
        ? buildChatHistory(messages, {
            maxMessages: CHAT_HISTORY_MAX_MESSAGES,
            maxUserLength: maxMessageLength,
            maxAssistantLength: CHAT_HISTORY_ASSISTANT_MAX_LENGTH,
          })
        : undefined;
      const assistantId = retryId ?? createChatId("ast");
      stickToBottomRef.current = true;

      if (retryId) {
        setMessages((current) =>
          current.map((message) =>
            message.id === retryId && message.role === "assistant"
              ? { ...message, text: "", status: "streaming", sources: undefined, error: undefined }
              : message
          )
        );
      } else {
        setMessages((current) => [
          ...current,
          { id: createChatId("usr"), role: "user", text: question },
          { id: assistantId, role: "assistant", text: "", status: "streaming", question },
        ]);
      }

      void runRequest(assistantId, question, history);
      return true;
    },
    [enabled, historyEnabled, isTranscriptCapReached, maxMessageLength, messages, runRequest]
  );

  const openChat = useCallback(
    (options: OpenChatOptions = {}) => {
      if (!enabled) {
        return;
      }
      const active = document.activeElement;
      returnFocusRef.current = options.returnFocusTo ?? (active instanceof HTMLElement ? active : null);
      // On touch devices the keyboard would cover the panel, so focus the dialog instead.
      openFocusRef.current = hasFinePointer() ? "composer" : "dialog";
      stickToBottomRef.current = true;
      setIsOpen(true);
    },
    [enabled]
  );

  const closeChat = useCallback((restoreFocus = true) => {
    restoreFocusRef.current = restoreFocus;
    resizeStartRef.current = null;
    setIsOpen(false);
  }, []);

  const askQuestion = useCallback(
    (text: string, options: OpenChatOptions = {}) => {
      const question = text.trim();
      if (!enabled || !question) {
        return false;
      }

      returnFocusRef.current = options.returnFocusTo ?? null;
      openFocusRef.current = "dialog";
      stickToBottomRef.current = true;
      setIsOpen(true);

      if (isTranscriptCapReached) {
        return false;
      }
      if (abortRef.current) {
        setDraft(question.slice(0, maxMessageLength));
        return true;
      }
      return sendQuestion(question);
    },
    [enabled, isTranscriptCapReached, maxMessageLength, sendQuestion]
  );

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    conversationIdRef.current = null;
    stickToBottomRef.current = true;
    setMessages([]);
    setDraft("");
    setIsStreaming(false);
    setServerCapReached(false);
    (hasFinePointer() ? composerRef.current : dialogRef.current)?.focus({ preventScroll: true });
  }, []);

  const handleRetry = useCallback(
    (reply: ChatAssistantMessage) => {
      // The Retry button disappears with the error: keep focus inside the dialog.
      dialogRef.current?.focus({ preventScroll: true });
      sendQuestion(reply.question, reply.id);
    },
    [sendQuestion]
  );

  // Below `md` the panel covers the page, so following a link closes it (the transcript
  // stays) and focus moves to the main content of the page it opens (see the effect below).
  const handleNavigate = useCallback(
    (href: string) => {
      if (!matchesMedia(DESKTOP_MEDIA_QUERY)) {
        pendingNavigationRef.current = { from: pathname, to: href };
        closeChat(false);
      }
    },
    [closeChat, pathname]
  );

  const submitDraft = () => {
    if (sendQuestion(draft)) {
      setDraft("");
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitDraft();
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // Enter that confirms an IME candidate must not send (Safari reports it as keyCode 229).
    const isComposing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (event.key === "Enter" && !event.shiftKey && !isComposing) {
      event.preventDefault();
      submitDraft();
    }
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      closeChat();
      return;
    }

    const dialog = dialogRef.current;
    if (event.key !== "Tab" || !dialog) {
      return;
    }

    // Focus trap: Tab and Shift+Tab cycle through the visible controls of the panel.
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.getClientRects().length > 0
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleLogScroll = () => {
    const log = scrollRef.current;
    if (log) {
      stickToBottomRef.current = log.scrollHeight - log.scrollTop - log.clientHeight <= STICK_TO_BOTTOM_THRESHOLD_PX;
    }
  };

  // The resize handle (desktop, mouse only) grows the docked panel up and to the left.
  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panel = dialogRef.current;
    if (event.pointerType !== "mouse" || event.button !== 0 || !panel) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const { width, height } = panel.getBoundingClientRect();
    resizeStartRef.current = { x: event.clientX, y: event.clientY, width, height };
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (start) {
      setPanelSize(
        clampPanelSize({
          width: start.width + start.x - event.clientX,
          height: start.height + start.y - event.clientY,
        })
      );
    }
  };

  const handleResizeEnd = () => {
    resizeStartRef.current = null;
  };

  // Focus moves only when the visitor opens or closes the panel, never on page load.
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      const target = openFocusRef.current === "composer" ? composerRef.current : dialogRef.current;
      target?.focus({ preventScroll: true });
      return;
    }

    if (!wasOpenRef.current) {
      return;
    }
    wasOpenRef.current = false;
    const trigger = returnFocusRef.current;
    returnFocusRef.current = null;
    if (!restoreFocusRef.current) {
      return;
    }
    if (trigger?.isConnected) {
      trigger.focus();
    }
    if (!trigger || document.activeElement !== trigger) {
      launcherRef.current?.focus();
    }
  }, [isOpen]);

  // After a link in the chat closed the panel on a phone, focus the main content once the
  // linked page has rendered (right away for a link to the current page), instead of
  // leaving focus on <body>. Reopening the panel or going elsewhere cancels it.
  useEffect(() => {
    const pending = pendingNavigationRef.current;
    if (!pending) {
      return;
    }
    if (isOpen) {
      pendingNavigationRef.current = null;
      return;
    }
    if (pathname === pending.to) {
      pendingNavigationRef.current = null;
      document.getElementById(MAIN_CONTENT_ID)?.focus({ preventScroll: true });
    } else if (pathname !== pending.from) {
      pendingNavigationRef.current = null;
    }
  }, [isOpen, pathname]);

  // Lock the page behind the panel without shifting it when the scrollbar disappears.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const { body, documentElement } = document;
    const previous = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${Number.parseFloat(getComputedStyle(body).paddingRight) + scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previous.overflow;
      body.style.paddingRight = previous.paddingRight;
    };
  }, [isOpen]);

  // Abort a reply that is still streaming when the widget unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the newest message in view unless the visitor scrolled up to read.
  useLayoutEffect(() => {
    const log = scrollRef.current;
    if (isOpen && log && stickToBottomRef.current) {
      log.scrollTop = log.scrollHeight;
    }
  }, [isOpen, messages]);

  // Grow the composer with its content, up to a few lines.
  useLayoutEffect(() => {
    const composer = composerRef.current;
    if (!composer) {
      return;
    }
    composer.style.height = "auto";
    const contentHeight = composer.scrollHeight + composer.offsetHeight - composer.clientHeight;
    composer.style.height = `${Math.min(contentHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
    composer.style.overflowY = contentHeight > COMPOSER_MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [draft, isOpen]);

  const contextValue = useMemo<ChatWidgetContextValue>(
    () => ({
      mode,
      copy,
      locale,
      maxMessageLength,
      assistantName,
      ownerName,
      ownerFirstName,
      messageValues,
      isOpen,
      isStreaming,
      isTranscriptCapReached,
      openChat,
      closeChat,
      askQuestion,
    }),
    [
      askQuestion,
      assistantName,
      closeChat,
      copy,
      isOpen,
      isStreaming,
      isTranscriptCapReached,
      locale,
      maxMessageLength,
      messageValues,
      mode,
      openChat,
      ownerFirstName,
      ownerName,
    ]
  );

  const canSend = draft.trim().length > 0 && !isStreaming && !isTranscriptCapReached;
  const lastMessage = messages[messages.length - 1];
  const panelStyle = panelSize
    ? ({
        "--chat-panel-width": `${panelSize.width}px`,
        "--chat-panel-height": `${panelSize.height}px`,
      } as CSSProperties)
    : undefined;

  return (
    <ChatWidgetContext.Provider value={contextValue}>
      {children}

      {enabled ? (
        <button
          ref={launcherRef}
          type="button"
          aria-haspopup="dialog"
          aria-label={copy.launcherLabel}
          onClick={(event) => openChat({ returnFocusTo: event.currentTarget })}
          // Bottom-left on phones (the floating links stack sits bottom-right), bottom-right from md.
          className={`${isLauncherHidden ? "hidden" : "inline-flex"} fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-30 h-12 items-center gap-2 rounded-full bg-strong pl-4 pr-5 text-sm font-medium text-on-strong shadow-raised transition-colors hover:bg-strong/90 md:bottom-6 md:left-auto md:right-6 print:hidden`}
        >
          <MessageCircle aria-hidden="true" className="size-5" />
          {copy.launcher}
        </button>
      ) : null}

      {enabled && isOpen ? (
        <div className="fixed inset-0 z-50 print:hidden">
          {/* Mouse-only backdrop (desktop); keyboard users have Escape and the close button. */}
          <div aria-hidden="true" onClick={() => closeChat()} className="absolute inset-0 hidden bg-scrim/20 md:block" />

          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={subtitleId}
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
            style={panelStyle}
            className="absolute inset-0 flex h-dvh flex-col overflow-hidden bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] focus:outline-none md:inset-auto md:bottom-6 md:right-6 md:h-[var(--chat-panel-height,min(80vh,720px))] md:max-h-[calc(100dvh-3rem)] md:w-[var(--chat-panel-width,420px)] md:max-w-[calc(100vw-3rem)] md:rounded-2xl md:border md:border-line md:p-0 md:shadow-raised"
          >
            <div
              aria-hidden="true"
              title={copy.resize}
              onPointerDown={handleResizeStart}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
              className="group absolute left-0 top-0 z-10 hidden size-5 cursor-nwse-resize p-1 text-muted md:block"
            >
              <MoveDiagonal2 className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>

            {/* A div, not <header>: the page already has its banner landmark. */}
            <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 id={titleId} className="truncate text-sm font-semibold text-ink">
                    {assistantName}
                  </h2>
                  <span className="shrink-0 rounded-full border border-line bg-subtle px-2 py-0.5 text-[11px] font-semibold leading-4 text-muted">
                    {mode === "demo" ? copy.demoBadge : copy.aiBadge}
                  </span>
                </div>
                <p id={subtitleId} className="mt-0.5 text-xs leading-5 text-muted">
                  {copy.panelSubtitle}
                </p>
              </div>
              <div className="-mr-2 flex shrink-0 items-center gap-1">
                {messages.length > 0 ? (
                  <button
                    type="button"
                    aria-label={copy.reset}
                    title={copy.reset}
                    onClick={resetConversation}
                    className={`${ICON_BUTTON_CLASS_NAME} size-9`}
                  >
                    <RotateCcw aria-hidden="true" className="size-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={copy.close}
                  title={copy.close}
                  onClick={() => closeChat()}
                  className={`${ICON_BUTTON_CLASS_NAME} size-9`}
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              onScroll={handleLogScroll}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-width:thin] md:px-5"
            >
              <div className="rounded-2xl border border-line p-4">
                <p className="text-sm font-semibold text-ink">{formatMessage(copy.welcomeTitle, messageValues)}</p>
                <p className="mt-1 text-sm leading-6 text-ink">{formatMessage(copy.welcomeMessage, messageValues)}</p>
                {mode === "demo" ? (
                  <p className="mt-3 rounded-xl bg-subtle px-3 py-2 text-xs leading-5 text-ink">{copy.demoNotice}</p>
                ) : null}
                <p className="mt-3 text-xs leading-5 text-muted">{formatMessage(copy.disclaimer, messageValues)}</p>
                {mode === "live" ? <p className="mt-1.5 text-xs leading-5 text-muted">{copy.privacyNotice}</p> : null}
              </div>

              <div role="log" aria-live="polite" aria-busy={isStreaming} className="mt-4 flex flex-col gap-4">
                {messages.map((message) => (
                  <ChatMessageItem
                    key={message.id}
                    message={message}
                    copy={copy}
                    locale={locale}
                    assistantName={assistantName}
                    allowedAssetPaths={allowedAssetPaths}
                    allowedExternalHrefs={allowedExternalHrefs}
                    markdownEnabled={markdownEnabled}
                    onNavigate={handleNavigate}
                    onRetry={message === lastMessage ? handleRetry : undefined}
                  />
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="shrink-0 border-t border-line px-4 pb-3 pt-3 md:px-5">
              <p id={statusId} role="status" className={isTranscriptCapReached ? "mb-2 text-sm leading-6 text-ink" : "sr-only"}>
                {isTranscriptCapReached ? copy.errors.transcriptCap : null}
              </p>
              <div className="flex items-end gap-2">
                <label htmlFor={inputId} className="sr-only">
                  {copy.inputLabel}
                </label>
                <textarea
                  ref={composerRef}
                  id={inputId}
                  name="message"
                  rows={1}
                  value={draft}
                  maxLength={maxMessageLength}
                  placeholder={copy.inputPlaceholder}
                  autoComplete="off"
                  enterKeyHint="send"
                  readOnly={isTranscriptCapReached}
                  aria-disabled={isTranscriptCapReached || undefined}
                  aria-describedby={`${counterId} ${statusId}`}
                  onChange={(event) => setDraft(event.target.value.slice(0, maxMessageLength))}
                  onKeyDown={handleComposerKeyDown}
                  className="min-h-11 flex-1 resize-none rounded-xl border border-field bg-surface px-3.5 py-2.5 text-base leading-6 text-ink transition-colors placeholder:text-muted hover:border-ink/70 focus:border-ink aria-disabled:cursor-not-allowed aria-disabled:bg-subtle aria-disabled:text-muted md:text-sm"
                />
                <button
                  type="submit"
                  aria-label={copy.send}
                  title={copy.send}
                  aria-disabled={!canSend}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-strong text-on-strong transition-colors hover:bg-strong/90 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
                >
                  <ArrowUp aria-hidden="true" className="size-5" />
                </button>
              </div>
              <p id={counterId} className="mt-1.5 text-right text-xs tabular-nums text-muted">
                {formatMessage(copy.characterCount, { count: draft.length, max: maxMessageLength })}
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </ChatWidgetContext.Provider>
  );
}
