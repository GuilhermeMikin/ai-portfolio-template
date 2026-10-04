import { SUPPORTED_LOCALES, localeForBaseLanguage, type Locale } from "@/shared/config/site";

/** Matches any of the words as whole words (Unicode-aware, unlike `\b`). */
function words(list: string[]) {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.join("|")})(?![\\p{L}\\p{N}])`, "u");
}

/**
 * Cheap language signals per base language. Weights: 3 = very distinctive, 2 =
 * distinctive, 1 = weak hint. Only used for fixed replies (the model already answers in
 * the visitor's language), so a wrong guess only changes canned text.
 */
const LANGUAGE_SIGNALS: Record<string, Array<[RegExp, number]>> = {
  en: [
    [words(["thanks", "thank you", "hello", "please"]), 2],
    [words(["what", "which", "who", "how", "where", "does", "has", "have", "the", "with", "about"]), 1],
  ],
  pt: [
    [words(["não", "nao", "obrigad[oa]", "você", "voce", "também", "tambem", "valeu", "tudo bem"]), 3],
    [words(["olá", "oi", "bom dia", "boa tarde", "boa noite", "projetos", "experiência", "trabalho", "currículo"]), 2],
    [words(["qual", "quais", "como", "onde", "quem", "pode", "sobre"]), 1],
  ],
  es: [
    [words(["gracias", "hola", "usted", "buenos días", "buenas tardes"]), 3],
    [/[¿¡]/, 2],
    [words(["qué", "cómo", "dónde", "quién", "proyectos", "experiencia", "trabajo", "puedes", "eres"]), 2],
    [words(["cual", "cuál", "sobre", "tiene"]), 1],
  ],
  fr: [
    [words(["merci", "bonjour", "bonsoir", "est-ce que", "s'il vous plaît", "s'il te plaît"]), 3],
    [words(["vous", "projets", "expérience", "travail", "c'est", "quels?", "quelles?", "pouvez", "peux"]), 2],
    [words(["le", "la", "les", "des", "une", "sur", "avec"]), 1],
  ],
  de: [
    [words(["danke", "bitte", "guten tag", "wie geht", "hallo"]), 3],
    [words(["ich", "nicht", "können", "kannst", "projekte", "erfahrung", "arbeit", "welche", "was ist"]), 2],
    [words(["und", "ist", "der", "die", "das", "mit", "über"]), 1],
  ],
};

/**
 * Detects the base language of a message ("en", "pt", …), or null when the signal is
 * weak or ambiguous. `preferred` (usually the page language) wins ties.
 */
export function detectBaseLanguage(message: string, preferred?: string): string | null {
  const text = message.toLowerCase().normalize("NFC");
  const scores = Object.entries(LANGUAGE_SIGNALS).map(([base, signals]) => ({
    base,
    score: signals.reduce((total, [pattern, weight]) => total + (pattern.test(text) ? weight : 0), 0),
  }));

  const best = Math.max(...scores.map((entry) => entry.score));
  if (best < 2) {
    return null;
  }

  const leaders = scores.filter((entry) => entry.score === best).map((entry) => entry.base);
  if (leaders.length === 1) {
    return leaders[0];
  }

  return preferred && leaders.includes(preferred) ? preferred : null;
}

/**
 * Locale for fixed chat replies when the visitor writes in another supported language
 * than the page (e.g. Portuguese on /en). Returns the page locale when only one locale
 * is supported or the signal is weak.
 */
export function inferChatReplyLocale(message: string, uiLocale: Locale): Locale {
  if (SUPPORTED_LOCALES.length < 2) {
    return uiLocale;
  }

  const [uiBase] = uiLocale.split("-");
  const base = detectBaseLanguage(message, uiBase);
  return (base && localeForBaseLanguage(base)) || uiLocale;
}
