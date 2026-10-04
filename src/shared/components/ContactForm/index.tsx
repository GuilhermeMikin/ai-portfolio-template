"use client";

import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";

import type { SiteMessages } from "@/content";
import { BUTTON_PRIMARY, cx } from "@/shared/utils/styles";

type ContactFormCopy = SiteMessages["contact"]["form"];

type ContactFormProps = {
  copy: ContactFormCopy;
};

type Status = "idle" | "sending" | "success" | "error" | "rateLimited";

/** Field limits enforced by POST /api/contact. */
const LIMITS = { name: 120, email: 200, message: 4000 } as const;

/** `border-field` keeps the control's outline at 3:1 contrast or better (WCAG 1.4.11). */
const FIELD_CLASS =
  "w-full min-w-0 rounded-xl border border-field bg-surface px-4 py-2.5 text-base text-ink placeholder:text-muted transition-colors hover:border-muted focus:border-ink sm:text-sm";

function readField(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function Field({
  id,
  label,
  requiredLabel,
  children,
}: {
  id: string;
  label: string;
  /** Visible "Required" marker; the control itself carries `required` for assistive tech. */
  requiredLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm font-medium text-ink">
        {label}
        {requiredLabel ? (
          <span aria-hidden="true" className="text-xs font-normal text-muted">
            {requiredLabel}
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

/**
 * Contact form. Sends JSON to POST /api/contact; only rendered when the server has
 * an email provider configured (see `isContactFormEnabled`).
 */
export function ContactForm({ copy }: ContactFormProps) {
  const id = useId();
  const [status, setStatus] = useState<Status>("idle");
  const isSending = status === "sending";
  // Synchronous guard against double submits (state updates land on the next render).
  const sendingRef = useRef(false);

  const statusMessage =
    status === "success"
      ? copy.success
      : status === "error"
        ? copy.error
        : status === "rateLimited"
          ? copy.rateLimited
          : "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingRef.current) {
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const reason = readField(data, "reason");
    const honeypot = readField(data, "extra_field");
    const payload = {
      name: readField(data, "name"),
      email: readField(data, "email"),
      message: readField(data, "message"),
      ...(reason ? { reason } : {}),
      ...(honeypot ? { extra_field: honeypot } : {}),
    };

    sendingRef.current = true;
    setStatus("sending");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        form.reset();
        setStatus("success");
        return;
      }

      const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
      setStatus(body?.error?.code === "rate_limited" ? "rateLimited" : "error");
    } catch {
      setStatus("error");
    } finally {
      sendingRef.current = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={isSending} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${id}-name`} label={copy.name} requiredLabel={copy.required}>
          <input
            id={`${id}-name`}
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={LIMITS.name}
            className={FIELD_CLASS}
          />
        </Field>
        <Field id={`${id}-email`} label={copy.email} requiredLabel={copy.required}>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={LIMITS.email}
            className={FIELD_CLASS}
          />
        </Field>
      </div>

      <Field id={`${id}-reason`} label={copy.reason}>
        <select id={`${id}-reason`} name="reason" defaultValue="" className={FIELD_CLASS}>
          <option value="">{copy.reasonPlaceholder}</option>
          {copy.reasons.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </select>
      </Field>

      <Field id={`${id}-message`} label={copy.message} requiredLabel={copy.required}>
        <textarea
          id={`${id}-message`}
          name="message"
          required
          rows={6}
          maxLength={LIMITS.message}
          placeholder={copy.messagePlaceholder}
          className={cx(FIELD_CLASS, "min-h-36 resize-y")}
        />
      </Field>

      {/* Honeypot: hidden from people and assistive tech; bots that fill it are ignored by the API. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-extra`}>Leave this field empty</label>
        <input id={`${id}-extra`} name="extra_field" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* `aria-disabled` instead of `disabled`, so keyboard focus stays on the button while sending. */}
        <button
          type="submit"
          aria-disabled={isSending || undefined}
          className={cx(BUTTON_PRIMARY, "aria-disabled:cursor-wait aria-disabled:opacity-70")}
        >
          {isSending ? copy.sending : copy.submit}
        </button>
        <p role="status" aria-live="polite" className="text-sm font-medium text-ink">
          {statusMessage}
        </p>
      </div>
    </form>
  );
}
