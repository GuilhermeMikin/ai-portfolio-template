/**
 * Cheap first filter for obvious prompt-injection attempts.
 *
 * This is a heuristic, NOT the security boundary. The real boundary is that nothing
 * secret is ever in the model's context, the assistant has no tools and takes no
 * actions, its output is rendered safely (restricted markdown, allow-listed links), and
 * every request is size- and rate-limited. Keep these patterns narrow: a false positive
 * blocks a genuine visitor, while a missed attempt still meets the rules in the prompt.
 */

export type PromptInjectionSignal =
  | "ignore_instructions"
  | "system_override"
  | "prompt_leak"
  | "role_override";

const PROMPT_INJECTION_PATTERNS: Array<{ signal: PromptInjectionSignal; pattern: RegExp }> = [
  // "Ignore all previous instructions", "disregard your rules", "forget the above prompt".
  {
    signal: "ignore_instructions",
    pattern:
      /\b(?:ignore|disregard|forget|override|bypass)\b[^.?!\n]{0,24}?\b(?:all|previous|prior|above|earlier|preceding|your|these|those|system|original|initial|developer)\b[^.?!\n]{0,24}?\b(?:instructions?|rules|prompts?|guidelines|directives|guardrails)\b/i,
  },
  // The same in Portuguese, Spanish, French and German.
  {
    signal: "ignore_instructions",
    pattern:
      /\b(?:ignor[ea]|ignorez|ignoriere|esque[cç]a|olvida|oublie|oubliez|vergiss)\b[^.?!\n]{0,40}?(?:\binstru(?:[cç][oõ]es|cciones)\b|\b(?:tes|vos|les)\s+(?:instructions|r[eè]gles)\b|\b(?:anweisungen|regras|reglas|regeln)\b)/i,
  },
  // Fake role headers at the start of a line ("system: …", "### developer prompt:").
  {
    signal: "system_override",
    pattern: /(?:^|\n)\s*(?:#{1,6}\s*)?(?:system|developer)(?:\s+(?:prompt|message))?\s*:/i,
  },
  // Chat-template control markers.
  {
    signal: "system_override",
    pattern: /<\|(?:im_start|im_end|system|endoftext)\|>|\[\/?(?:system|inst)\]|<<\/?sys>>/i,
  },
  // "Reveal your system prompt", "print your hidden instructions".
  {
    signal: "prompt_leak",
    pattern:
      /\b(?:reveal|print|show|display|output|repeat|dump|leak|expose|recite)\b[^.?!\n]{0,30}?(?:\byour\s+(?:(?:hidden|secret|initial|original|system)\s+)?(?:prompt|instructions|rules)\b|\bsystem\s+(?:prompt|message)\b|\b(?:hidden|secret)\s+(?:prompt|instructions|rules)\b)/i,
  },
  // "Repeat everything above".
  {
    signal: "prompt_leak",
    pattern:
      /\b(?:repeat|print|output|reveal)\b[^.?!\n]{0,20}?\b(?:everything|all|the\s+(?:text|words|content))\s+(?:above|before\s+this)\b/i,
  },
  // "You are now …", "from now on you are …", "pretend to be …", "act as if you were …".
  {
    signal: "role_override",
    pattern:
      /\byou\s+are\s+now\b|\bfrom\s+now\s+on,?\s+you\s+(?:are|will|must|act)\b|(?:^|[.!?]\s*|\b(?:now|please|you|to)\s+)pretend\s+(?:to\s+be|you\s+are|you're)\b|\bact\s+as\s+if\s+you\b|\bi\s+want\s+you\s+to\s+act\s+as\b|\brole-?play\s+as\b|\b(?:enter|enable|activate)\s+(?:developer|dan|god|jailbreak)\s+mode\b/i,
  },
  // The same in Portuguese, Spanish, French and German. No `\b` after accented letters:
  // JavaScript word boundaries only know ASCII letters.
  {
    signal: "role_override",
    pattern:
      /\bagora\s+voc[eê]\s+é(?=\s|$)|\bahora\s+eres\b|\b(?:tu\s+es|vous\s+[eê]tes)\s+(?:maintenant|d[eé]sormais)\b|\bdu\s+bist\s+(?:jetzt|nun|ab\s+jetzt)\b|\bab\s+jetzt\s+bist\s+du\b/i,
  },
];

export function detectPromptInjection(message: string): PromptInjectionSignal | null {
  for (const rule of PROMPT_INJECTION_PATTERNS) {
    if (rule.pattern.test(message)) {
      return rule.signal;
    }
  }

  return null;
}
