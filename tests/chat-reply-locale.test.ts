import { afterEach, describe, expect, it, vi } from "vitest";

import { detectBaseLanguage } from "@/lib/ai/reply-locale";
import type { Locale } from "@/shared/config/site";

/**
 * Loads reply-locale.ts against a given list of supported locales, so these tests do not
 * depend on the languages this site happens to ship.
 */
async function withLocales(locales: string[]) {
  vi.resetModules();
  vi.doMock("@/shared/config/site", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/shared/config/site")>();
    return {
      ...actual,
      SUPPORTED_LOCALES: locales,
      localeForBaseLanguage: (base: string) =>
        locales.find((locale) => locale.split("-")[0] === base.toLowerCase()) ?? null,
    };
  });
  return import("@/lib/ai/reply-locale");
}

afterEach(() => {
  vi.doUnmock("@/shared/config/site");
  vi.resetModules();
});

describe("detectBaseLanguage", () => {
  it.each([
    ["Obrigado! Você pode me falar dos projetos?", "pt"],
    ["¡Hola! ¿Qué proyectos tiene?", "es"],
    ["Bonjour, quels sont ses projets ?", "fr"],
    ["Danke! Welche Projekte hat Robin?", "de"],
    ["Thanks! What has Robin built?", "en"],
  ])("detects %j as %s", (message, base) => {
    expect(detectBaseLanguage(message)).toBe(base);
  });

  it("returns null for weak signals and prefers the page language on ties", () => {
    expect(detectBaseLanguage("Kubernetes")).toBeNull();
    expect(detectBaseLanguage("ok")).toBeNull();
    // "merci" and "danke" weigh the same.
    expect(detectBaseLanguage("merci danke", "de")).toBe("de");
    expect(detectBaseLanguage("merci danke", "en")).toBeNull();
  });
});

describe("inferChatReplyLocale", () => {
  const en = "en" as Locale;
  const ptBr = "pt-br" as Locale;

  it("keeps the page locale when only one locale is supported", async () => {
    const { inferChatReplyLocale } = await withLocales(["en"]);
    expect(inferChatReplyLocale("Obrigado! Você pode me ajudar?", en)).toBe("en");
  });

  it("switches to another supported locale when the visitor clearly writes in it", async () => {
    const { inferChatReplyLocale } = await withLocales(["en", "pt-br"]);

    expect(inferChatReplyLocale("Obrigado! Você pode me ajudar?", en)).toBe("pt-br");
    expect(inferChatReplyLocale("Thanks! What has Robin built?", ptBr)).toBe("en");
    // Weak signals and unsupported languages keep the page locale.
    expect(inferChatReplyLocale("Kubernetes", ptBr)).toBe("pt-br");
    expect(inferChatReplyLocale("Danke! Welche Projekte hat Robin?", en)).toBe("en");
  });
});
