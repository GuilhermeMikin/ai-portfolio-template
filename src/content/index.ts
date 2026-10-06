/**
 * Single entry point for the portfolio content. The pages and the AI assistant both
 * read from here, so in each language what visitors see and what the assistant knows come
 * from the same data. Translations are separate files and must be kept in step by hand.
 *
 * Server-side only by convention: pass the pieces a client component needs as props
 * instead of importing this module from a "use client" file.
 *
 * Adding a language: create `src/content/<locale>/` (copy `en/`), register it below and
 * add the code to SUPPORTED_LOCALES in `src/shared/config/site.ts`. TypeScript then
 * reports any locale that is missing here.
 */
import { DEFAULT_LOCALE, type Locale } from "@/shared/config/site";

import enChat from "./en/chat.json";
import enMessages from "./en/messages.json";
import { profile as enProfile } from "./en/profile";
import ptBrChat from "./pt-br/chat.json";
import ptBrMessages from "./pt-br/messages.json";
import { profile as ptBrProfile } from "./pt-br/profile";
import type { Profile } from "./schema";

export type SiteMessages = typeof enMessages;
export type ChatMessages = typeof enChat;
export type Messages = SiteMessages & { chat: ChatMessages };

export type LocaleContent = {
  profile: Profile;
  messages: Messages;
};

export const contentByLocale: Record<Locale, LocaleContent> = {
  en: { profile: enProfile, messages: { ...enMessages, chat: enChat } },
  "pt-br": { profile: ptBrProfile, messages: { ...ptBrMessages, chat: ptBrChat } },
};

export function getContent(locale: Locale): LocaleContent {
  return contentByLocale[locale] ?? contentByLocale[DEFAULT_LOCALE];
}

export function getProfile(locale: Locale): Profile {
  return getContent(locale).profile;
}

export function getMessages(locale: Locale): Messages {
  return getContent(locale).messages;
}

export type { Profile } from "./schema";
export * from "./format";
