#!/usr/bin/env tsx
/**
 * Model-quality evaluation of the AI assistant: `pnpm eval`.
 *
 * NOT a software test and not part of `pnpm test` (which never calls a model). It sends
 * real questions to a RUNNING site whose chat is live (CHAT_MODE=live, or unset with a
 * real LLM_API_KEY), so every case is a paid model request that also counts against the
 * site's rate limits. Answers vary between runs and models: use it to compare prompts
 * and models before you ship, not as a build gate.
 *
 * The cases in scripts/eval/queries.json are written for the bundled example profile
 * (Jordan Rivera). When you replace the content, rewrite them: questions your profile
 * answers, questions it doesn't, and the keywords you expect. A case can check:
 *   any / all          keywords the answer must contain (case-insensitive)
 *   forbid             regular expressions the answer must not match (invented numbers…)
 *   language           the language of the answer, from common words ("en" or "pt")
 *   status, errorCode  a request-level JSON error instead of an answer
 * Every answer is also checked for link hygiene with the chat UI's own Markdown parser
 * and link guard (`parseChatMarkdown` + `resolveChatHref`), so a failure means a visitor
 * would see a broken or dropped link: each Markdown link must resolve to a page of this
 * site for the request locale (SITE_PAGES), a site file such as the résumé PDF, or an
 * external URL or email address written in the profile. Bare URLs in the text (which the
 * chat shows as plain text) must also be ones written in the profile.
 */
import fs from "node:fs";
import path from "node:path";
import util from "node:util";

import { getAllowedExternalHrefs, getProfile, getSiteAssetPaths } from "@/content";
import type { ChatErrorResponse, ChatStreamEvent } from "@/lib/ai/types";
import {
  flattenChatMarkdownTokens,
  parseChatMarkdown,
  resolveChatHref,
} from "@/shared/components/ChatMarkdown/markdown";
import { DEFAULT_LOCALE, coerceLocale, type Locale } from "@/shared/config/site";

const HELP = `Usage: pnpm eval [options]

Model-quality evaluation of the AI assistant. This is NOT a unit test and is not
part of \`pnpm test\`: it sends the questions in scripts/eval/queries.json to a
RUNNING site and checks the answers (grounding, no invented facts, declining
actions, the prompt-injection guard, reply language and link hygiene).

Before you run it:
  - Start the site with the live chat (CHAT_MODE=live or unset, and a real
    LLM_API_KEY), for example with \`pnpm dev\` in another terminal.
  - Every case is a real model request: a run costs tokens and counts against
    the site's rate limits. The runner pauses between requests and waits when
    it is rate-limited.
  - The cases are written for the bundled example profile (Jordan Rivera).
    Adapt them when you replace the content.

Options:
  --base-url <url>  Site to evaluate. Default: CHAT_EVAL_BASE_URL (environment,
                    .env.local or .env), otherwise http://127.0.0.1:3000
  --only <ids>      Run only these case ids (comma-separated)
  --delay <ms>      Pause between requests (default: 2000)
  --verbose, -v     Print every answer in full
  --help, -h        Show this help

Exit codes: 0 = every case passed, 1 = at least one case failed,
            2 = setup problem (site unreachable, chat off or in demo mode,
                invalid options or queries.json).`;

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_DELAY_MS = 2_000;
const REQUEST_TIMEOUT_MS = 60_000;
/** Short 429s are worth waiting for; daily or per-conversation quotas are not. */
const RETRYABLE_CODES = new Set(["rate_limited", "token_budget_exceeded"]);
const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 65_000;

/** Errors that would fail every remaining case the same way: stop and explain. */
const SETUP_ERRORS: Record<string, string> = {
  chat_disabled: "The chat is off. Start the site with CHAT_MODE=live (or unset) and a real LLM_API_KEY.",
  guard_unavailable:
    "The rate-limit store is unavailable. Check UPSTASH_REDIS_REST_URL/TOKEN, or set CHAT_RATE_LIMIT_STORE=memory for a local run.",
  daily_limit_reached:
    "The site's daily chat limit is used up (CHAT_DAILY_REQUEST_LIMIT). Raise it for a local run or try again after midnight UTC.",
  ip_daily_limit_reached:
    "This IP's daily chat limit is used up (CHAT_IP_DAILY_REQUEST_LIMIT, default 50). Raise it for a local run or try again after midnight UTC.",
};

/** Common words that tell reply languages apart. Add a list to evaluate another language. */
const LANGUAGE_MARKERS: Record<string, string[]> = {
  en: [
    "the", "and", "with", "is", "are", "was", "has", "have", "for", "of", "to", "in", "on", "at",
    "from", "uses", "which", "this", "that", "also", "you", "can", "it",
  ],
  pt: [
    "o", "e", "de", "em", "um", "uma", "os", "da", "na", "ao", "com", "para", "por", "que", "mas",
    "ou", "não", "é", "são", "está", "tem", "foi", "você", "também", "pelo", "pela", "dele", "seu",
    "sua", "ele", "isso", "mais", "como", "sobre", "muito", "usa", "trabalha", "principalmente",
    "atualmente", "projetos", "experiência", "tecnologias", "ferramentas", "linguagens",
  ],
};

type EvalCase = {
  id: string;
  description?: string;
  /** Request locale; defaults to DEFAULT_LOCALE. */
  locale?: string;
  message: string;
  expect: {
    status?: number;
    errorCode?: string;
    any?: string[];
    all?: string[];
    forbid?: string[];
    language?: string;
  };
};

type Reply = {
  status: number;
  /** The answer: every `chunk` delta joined. */
  text: string;
  finishReason?: string;
  errorCode?: string;
  errorMessage?: string;
  retryAfterMs?: number;
  /** Protocol problems (malformed frames, missing start/done, unexpected body…). */
  problems: string[];
};

class SetupError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Reads one variable from .env.local or .env (like `next dev`) without loading the others. */
function readEnvFile(name: string): string | undefined {
  for (const file of [".env.local", ".env"]) {
    try {
      const value = util.parseEnv(fs.readFileSync(path.join(process.cwd(), file), "utf8"))[name]?.trim();
      if (value) return value;
    } catch {
      // No such file, or a Node.js version without util.parseEnv.
    }
  }
  return undefined;
}

function readArgs() {
  try {
    return util.parseArgs({
      // `pnpm eval -- --only x` passes the separator through.
      args: process.argv.slice(2).filter((arg) => arg !== "--"),
      options: {
        "base-url": { type: "string" },
        only: { type: "string" },
        delay: { type: "string" },
        verbose: { type: "boolean", short: "v" },
        help: { type: "boolean", short: "h" },
      },
    }).values;
  } catch (error) {
    throw new SetupError(`${errorText(error)}\nRun pnpm eval --help for the options.`);
  }
}

function parseOptions() {
  const values = readArgs();
  const baseUrl = (
    values["base-url"] ||
    process.env.CHAT_EVAL_BASE_URL?.trim() ||
    readEnvFile("CHAT_EVAL_BASE_URL") ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  if (!URL.canParse(baseUrl)) throw new SetupError(`Invalid base URL: ${baseUrl}`);

  const delayMs = values.delay === undefined ? DEFAULT_DELAY_MS : Number(values.delay);
  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw new SetupError(`--delay must be a whole number of milliseconds, got "${values.delay}".`);
  }

  const only = values.only?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
  return { baseUrl, delayMs, only, verbose: Boolean(values.verbose), help: Boolean(values.help) };
}

function loadCases(only: string[]): EvalCase[] {
  const file = path.join(process.cwd(), "scripts", "eval", "queries.json");
  let cases: EvalCase[];
  try {
    cases = JSON.parse(fs.readFileSync(file, "utf8")) as EvalCase[];
  } catch (error) {
    throw new SetupError(`Could not read scripts/eval/queries.json: ${errorText(error)}`);
  }
  if (!Array.isArray(cases)) throw new SetupError("scripts/eval/queries.json must contain an array of cases.");

  const ids = new Set<string>();
  for (const testCase of cases) {
    const label = `queries.json case "${String(testCase?.id)}"`;
    if (typeof testCase?.id !== "string" || ids.has(testCase.id)) throw new SetupError(`${label}: needs a unique id.`);
    ids.add(testCase.id);
    if (typeof testCase.message !== "string" || typeof testCase.expect !== "object" || !testCase.expect) {
      throw new SetupError(`${label}: needs a "message" and an "expect" object.`);
    }
    if (testCase.locale !== undefined && !coerceLocale(testCase.locale)) {
      throw new SetupError(`${label}: locale "${testCase.locale}" is not in SUPPORTED_LOCALES.`);
    }
    const { language, forbid = [] } = testCase.expect;
    if (language !== undefined && !LANGUAGE_MARKERS[language]) {
      throw new SetupError(`${label}: no word list for language "${language}" (known: ${Object.keys(LANGUAGE_MARKERS).join(", ")}).`);
    }
    for (const pattern of forbid) {
      try {
        new RegExp(pattern, "i");
      } catch {
        throw new SetupError(`${label}: invalid regular expression ${pattern}`);
      }
    }
  }

  const unknown = only.filter((id) => !ids.has(id));
  if (unknown.length > 0) {
    throw new SetupError(`Unknown case id: ${unknown.join(", ")}. Available: ${[...ids].join(", ")}`);
  }
  return only.length > 0 ? cases.filter((testCase) => only.includes(testCase.id)) : cases;
}

/** Parses a POST /api/chat response: an event stream, or a JSON error. */
async function readReply(response: Response): Promise<Reply> {
  const reply: Reply = { status: response.status, text: "", problems: [] };
  const body = await response.text();

  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    try {
      const { error } = JSON.parse(body) as Partial<ChatErrorResponse>;
      if (typeof error?.code === "string") {
        const retryAfterSeconds = Number(response.headers.get("retry-after"));
        reply.errorCode = error.code;
        reply.errorMessage = error.message;
        reply.retryAfterMs = error.retryAfterMs ?? (retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : undefined);
        return reply;
      }
    } catch {
      // Not JSON: reported below.
    }
    reply.problems.push(`HTTP ${response.status} with neither an event stream nor a JSON error`);
    return reply;
  }

  // Frames are `data: <json>` lines separated by a blank line.
  const events: ChatStreamEvent[] = [];
  for (const frame of body.split(/\r?\n\r?\n/)) {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");
    if (!data) continue;
    try {
      events.push(JSON.parse(data) as ChatStreamEvent);
    } catch {
      reply.problems.push("the stream has a frame that is not JSON");
    }
  }

  for (const event of events) {
    if (event.type === "chunk") reply.text += event.delta;
    if (event.type === "done") reply.finishReason = event.finishReason;
    if (event.type === "error") {
      reply.errorCode = event.code;
      reply.errorMessage = event.message;
    }
  }
  if (events[0]?.type !== "start") reply.problems.push("the stream does not begin with a start event");
  if (events[events.length - 1]?.type !== "done") reply.problems.push("the stream does not end with a done event");
  return reply;
}

async function ask(baseUrl: string, locale: Locale, message: string): Promise<Reply> {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, message }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        return { status: 0, text: "", problems: [`no response within ${REQUEST_TIMEOUT_MS / 1000} s`] };
      }
      throw new SetupError(
        `Could not reach ${baseUrl} (${errorText(error)}). Start the site first (pnpm dev, or pnpm build && pnpm start) or pass --base-url.`
      );
    }

    let reply: Reply;
    try {
      reply = await readReply(response);
    } catch (error) {
      return { status: response.status, text: "", problems: [`could not read the response: ${errorText(error)}`] };
    }

    const retryable = response.status === 429 && RETRYABLE_CODES.has(reply.errorCode ?? "");
    if (!retryable || attempt >= MAX_RETRIES) return reply;
    const waitMs = Math.min(Math.max(reply.retryAfterMs ?? 0, 1_000), MAX_RETRY_WAIT_MS);
    console.log(`      rate-limited (${reply.errorCode}); waiting ${Math.ceil(waitMs / 1000)} s`);
    await sleep(waitMs);
  }
}

const BARE_URL = /(?:https?:\/\/|www\.)[^\s<>()[\]"'`]+/gi;
const trimPunctuation = (url: string) => url.replace(/[.,;:!?]+$/, "");

/**
 * Links in an answer that the chat would not render as links, found with the same parser
 * and guard as the UI (code is skipped, as it is never linked). Bare URLs in the text are
 * checked against the same allow-list: they are not clickable, but must not be invented.
 */
function auditLinks(text: string, locale: Locale): string[] {
  const profile = getProfile(locale);
  const assetPaths = getSiteAssetPaths(profile);
  const externalHrefs = getAllowedExternalHrefs(profile);
  const isAllowed = (href: string) => resolveChatHref(href, locale, assetPaths, externalHrefs) !== null;

  const failures: string[] = [];
  for (const token of flattenChatMarkdownTokens(parseChatMarkdown(text))) {
    if (token.type === "code") continue;
    if (token.type === "link" && !isAllowed(token.href)) {
      failures.push(`link the chat shows as plain text (not a site page or a URL from the profile): ${token.href}`);
      continue;
    }
    if (token.type === "text" && token.droppedHref !== undefined) {
      failures.push(`unsafe link target, shown as plain text: ${token.droppedHref}`);
    }
    // Text, and the labels of allowed links.
    for (const match of token.content.matchAll(BARE_URL)) {
      const url = trimPunctuation(match[0]);
      if (!isAllowed(/^www\./i.test(url) ? `https://${url}` : url)) {
        failures.push(`URL that is not in the profile: ${url}`);
      }
    }
  }
  return failures;
}

/** The language with the most distinct marker words (at least three), if it is clear. */
function detectLanguage(text: string): string | null {
  const words = new Set(text.toLowerCase().split(/[^\p{L}]+/u));
  const [best, second] = Object.entries(LANGUAGE_MARKERS)
    .map(([language, markers]) => ({ language, hits: markers.filter((word) => words.has(word)).length }))
    .sort((left, right) => right.hits - left.hits);
  return best && best.hits >= 3 && best.hits > (second?.hits ?? 0) ? best.language : null;
}

function evaluate(testCase: EvalCase, reply: Reply, locale: Locale): string[] {
  const { expect } = testCase;
  const failures = [...reply.problems];

  if (expect.status !== undefined || expect.errorCode !== undefined) {
    const statusOk = expect.status === undefined || reply.status === expect.status;
    const codeOk = expect.errorCode === undefined || reply.errorCode === expect.errorCode;
    if (!statusOk || !codeOk) {
      const wanted = [expect.status && `HTTP ${expect.status}`, expect.errorCode].filter(Boolean).join(" ");
      const got = reply.errorCode ? `HTTP ${reply.status} ${reply.errorCode}` : `HTTP ${reply.status} with an answer`;
      failures.push(`expected ${wanted}, got ${got}`);
    }
    return failures;
  }

  if (reply.errorCode) {
    failures.push(`HTTP ${reply.status} ${reply.errorCode}: ${reply.errorMessage ?? ""}`);
    return failures;
  }

  // Straight quotes and no Markdown emphasis, so "can’t" and "**support** assistant" match.
  const answer = reply.text.replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"');
  const haystack = answer.replace(/[*_`]/g, "").replace(/\s+/g, " ").toLowerCase();

  if (!haystack.trim()) failures.push("empty answer");
  if (expect.any?.length && !expect.any.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
    failures.push(`expected one of: ${expect.any.join(" | ")}`);
  }
  for (const keyword of expect.all ?? []) {
    if (!haystack.includes(keyword.toLowerCase())) failures.push(`expected: ${keyword}`);
  }
  for (const pattern of expect.forbid ?? []) {
    const match = new RegExp(pattern, "i").exec(answer);
    if (match) failures.push(`forbidden text: "${match[0]}"`);
  }
  if (expect.language) {
    const detected = detectLanguage(answer);
    if (detected !== expect.language) {
      failures.push(`expected an answer in "${expect.language}", got ${detected ? `"${detected}"` : "an unclear language"}`);
    }
  }

  failures.push(...auditLinks(reply.text, locale));
  return failures;
}

function indent(text: string) {
  return text.trim().replace(/^/gm, "      | ");
}

async function main(): Promise<number> {
  const options = parseOptions();
  if (options.help) {
    console.log(HELP);
    return 0;
  }

  const cases = loadCases(options.only);
  console.log(
    `Model-quality eval: ${cases.length} case(s) against ${options.baseUrl}/api/chat.\n` +
      "Each case is a real model request and costs tokens.\n"
  );

  const rows: { id: string; result: string; time: string; details: string }[] = [];
  for (const [index, testCase] of cases.entries()) {
    if (index > 0) await sleep(options.delayMs);

    const locale = coerceLocale(testCase.locale) ?? DEFAULT_LOCALE;
    const startedAt = Date.now();
    const reply = await ask(options.baseUrl, locale, testCase.message);
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

    const setupProblem = SETUP_ERRORS[reply.errorCode ?? ""];
    if (setupProblem) throw new SetupError(`${setupProblem} (HTTP ${reply.status} ${reply.errorCode})`);
    if (reply.finishReason === "demo") {
      throw new SetupError("The site answered in demo mode (simulated replies). Restart it with CHAT_MODE=live and a real LLM_API_KEY.");
    }

    const failures = evaluate(testCase, reply, locale);
    const passed = failures.length === 0;
    const kind = reply.finishReason === "static" ? ", fixed reply" : "";
    console.log(`${passed ? "PASS" : "FAIL"}  ${testCase.id}  (${seconds} s${kind})`);
    for (const failure of failures) console.log(`      - ${failure}`);
    if (options.verbose || !passed) {
      const shown = reply.text || reply.errorMessage || "";
      if (shown) console.log(indent(options.verbose || shown.length <= 400 ? shown : `${shown.slice(0, 400)}…`));
    }

    rows.push({ id: testCase.id, result: passed ? "PASS" : "FAIL", time: `${seconds} s`, details: failures.join("; ") || "ok" });
  }

  const header = { id: "Case", result: "Result", time: "Time", details: "Details" };
  const width = (key: "id" | "result" | "time") => Math.max(...[header, ...rows].map((row) => row[key].length));
  const line = (row: typeof header) =>
    `${row.id.padEnd(width("id"))}  ${row.result.padEnd(width("result"))}  ${row.time.padEnd(width("time"))}  ${
      row.details.length > 100 ? `${row.details.slice(0, 99)}…` : row.details
    }`;
  console.log(`\n${line(header)}`);
  rows.forEach((row) => console.log(line(row)));

  const failed = rows.filter((row) => row.result === "FAIL").length;
  console.log(`\n${rows.length - failed} of ${rows.length} case(s) passed.`);
  return failed > 0 ? 1 : 0;
}

main().then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    if (error instanceof SetupError) {
      console.error(`\n✗ ${error.message}`);
    } else {
      console.error("\n✗ The eval crashed:");
      console.error(error);
    }
    process.exitCode = 2;
  }
);
