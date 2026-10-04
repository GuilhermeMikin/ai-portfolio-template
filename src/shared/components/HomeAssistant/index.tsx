"use client";

import { ArrowUp, MessageCircleOff } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import { formatMessage } from "@/content/format";
import { useChatWidget } from "@/shared/components/ChatWidget";

export type HomeAssistantProps = {
  /** `profile.assistant.suggestedQuestions` (at most three are shown). */
  suggestedQuestions: string[];
};

const MAX_SUGGESTIONS = 3;

const CARD_CLASS_NAME = "rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6";

/**
 * The assistant's featured entry point on the home page: a compact card with a question
 * field and suggested questions. Sending opens the chat panel (the floating launcher opens
 * the same panel from any page).
 */
export function HomeAssistant({ suggestedQuestions }: HomeAssistantProps) {
  const { mode, copy, messageValues, maxMessageLength, askQuestion } = useChatWidget();
  const [draft, setDraft] = useState("");
  const sendRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const inputId = useId();
  const suggestionsLabelId = useId();

  if (mode === "off") {
    return (
      <section aria-labelledby={titleId} className={CARD_CLASS_NAME}>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-subtle text-muted">
            <MessageCircleOff className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {copy.home.disabledTitle}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              {formatMessage(copy.home.disabledMessage, messageValues)}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const suggestions = suggestedQuestions
    .map((question) => question.trim())
    .filter(Boolean)
    .slice(0, MAX_SUGGESTIONS);
  const canSend = draft.trim().length > 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Focus comes back to the send button (not the field), so closing the panel on a
    // phone does not bring the keyboard back up. The button uses aria-disabled to stay focusable.
    if (canSend && askQuestion(draft, { returnFocusTo: sendRef.current })) {
      setDraft("");
    }
  };

  return (
    <section aria-labelledby={titleId} className={CARD_CLASS_NAME}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold tracking-tight text-ink">
          {formatMessage(copy.home.title, messageValues)}
        </h2>
        {mode === "demo" ? (
          <span className="mt-0.5 shrink-0 rounded-full border border-line bg-subtle px-2 py-0.5 text-[11px] font-semibold leading-4 text-muted">
            {copy.demoBadge}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm leading-6 text-muted">{copy.home.description}</p>
      {mode === "demo" ? <p className="mt-2 text-xs leading-5 text-muted">{copy.demoNotice}</p> : null}

      <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {formatMessage(copy.home.inputLabel, messageValues)}
        </label>
        <input
          id={inputId}
          type="text"
          name="question"
          value={draft}
          maxLength={maxMessageLength}
          placeholder={formatMessage(copy.home.placeholder, messageValues)}
          autoComplete="off"
          enterKeyHint="send"
          onChange={(event) => setDraft(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-xl border border-field bg-surface px-3.5 text-base text-ink transition-colors placeholder:text-muted hover:border-ink/70 focus:border-ink md:text-sm"
        />
        <button
          ref={sendRef}
          type="submit"
          aria-label={copy.send}
          title={copy.send}
          aria-disabled={!canSend}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-strong text-on-strong transition-colors hover:bg-strong/90 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        >
          <ArrowUp aria-hidden="true" className="size-5" />
        </button>
      </form>

      {suggestions.length > 0 ? (
        <div className="mt-4">
          <p id={suggestionsLabelId} className="text-xs font-medium text-muted">
            {copy.home.suggestionsLabel}
          </p>
          <ul aria-labelledby={suggestionsLabelId} className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((question, index) => (
              <li key={`${index}-${question}`} className="min-w-0">
                <button
                  type="button"
                  onClick={(event) => askQuestion(question, { returnFocusTo: event.currentTarget })}
                  className="rounded-full border border-line bg-subtle px-3 py-1.5 text-left text-sm text-ink transition-colors hover:border-ink/30 hover:bg-surface"
                >
                  {question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
