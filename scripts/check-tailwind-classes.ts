#!/usr/bin/env tsx
/**
 * Guards Tailwind class strings against opacity modifiers that compile to nothing.
 *
 * Tailwind only accepts a color alpha modifier that exists in `theme.opacity`
 * (multiples of 5 by default) or is written in brackets (`bg-ink/[0.97]`). Anything
 * else, such as `bg-ink/97`, is dropped silently: no CSS rule and no warning, so lint,
 * type-check and build all pass while the element renders without that color.
 *
 *   pnpm tailwind:check
 *
 * Exit 0 = every modifier compiles; 1 = at least one is dropped; 2 = crash or
 * incomplete scan.
 *
 * Scope and known blind spots:
 *   - Only string and template literals in the `content` globs of tailwind.config.ts
 *     are parsed, via the TypeScript AST. Comments are not AST nodes, so a class
 *     quoted in a comment is ignored.
 *   - Classes assembled at runtime (`bg-${color}/${alpha}`) cannot be checked.
 *     Tailwind cannot see them either.
 *   - `.mdx` files and CSS `@apply` rules are not scanned.
 *   - A `prefix` in the Tailwind config would put every utility behind that prefix
 *     and the allow-list below would stop matching.
 *   - Only the alpha modifier is validated. A malformed utility or an unknown color
 *     name is not reported.
 */
import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";
import resolveConfig from "tailwindcss/resolveConfig";

import tailwindConfig from "../tailwind.config";

/** Color utilities that take an alpha modifier. An allow-list on purpose: its failure
 *  mode is a missed finding, never a wall of noise. Many valid classes contain a slash
 *  (`w-1/2`, `aspect-[4/3]`, `group-hover/item:` …). */
const COLOR_UTILITY =
  /^(bg|text|border(-[trblxyse])?|divide(-[xy])?|ring(-offset)?|outline|decoration|shadow|placeholder|caret|accent|fill|stroke|from|via|to)-/;

/** A bracketed value that is a length/number rather than a color — `text-[13px]/6`
 *  is a font-size with a line-height, not a color with an alpha. */
const LENGTH_VALUE = /^\[-?[\d.]+(px|rem|em|ex|ch|lh|rlh|vw|vh|vi|vb|vmin|vmax|dvh|dvw|svh|svw|lvh|lvw|cqw|cqh|cqi|cqb|cqmin|cqmax|%|pt|pc|in|cm|mm|q)?\]$/;

/** Index of the last `char` that is not inside `[]`. */
function lastIndexOutsideBrackets(token: string, char: string): number {
  let depth = 0;
  let found = -1;
  for (let i = 0; i < token.length; i += 1) {
    const c = token[i];
    if (c === "[") depth += 1;
    else if (c === "]") depth = Math.max(0, depth - 1);
    else if (c === char && depth === 0) found = i;
  }
  return found;
}

type Finding = { file: string; line: number; column: number; token: string; modifier: string };

const PARSED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

async function walk(dir: string, failures: string[]): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    // Never swallow this. A directory that cannot be read means files went
    // unscanned, and reporting success over unscanned code is the precise
    // failure mode this guard exists to eliminate.
    failures.push(`${dir} — ${(err as Error).message}`);
    return [];
  }
  const out = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full, failures);
      if (!PARSED_EXTENSIONS.has(path.extname(entry.name))) return [];
      if (entry.name.endsWith(".d.ts")) return [];
      return [full];
    }),
  );
  return out.flat();
}

function inspectToken(
  raw: string,
  opacityKeys: Set<string>,
  fontSizeKeys: Set<string>,
): string | null {
  let token = raw;

  // Peel variants: everything up to the last `:` outside brackets (`md:`,
  // `max-md:`, `group-hover/resize-corner:`, `[&>p]:`).
  const colon = lastIndexOutsideBrackets(token, ":");
  if (colon !== -1) token = token.slice(colon + 1);

  // Strip the important modifier and a negative prefix *after* the peel — the `!`
  // sits on the utility, not the token (`md:!bg-black/97`).
  token = token.replace(/^!/, "").replace(/^-/, "");

  const slash = lastIndexOutsideBrackets(token, "/");
  if (slash === -1) return null;

  const utility = token.slice(0, slash);
  const modifier = token.slice(slash + 1);
  if (!modifier || !COLOR_UTILITY.test(utility)) return null;

  // `text-<fontSize>/<lineHeight>` is a size shorthand, not a color alpha —
  // both the named scale (`text-sm/6`) and an arbitrary length (`text-[13px]/6`).
  if (utility.startsWith("text-")) {
    const value = utility.slice("text-".length);
    if (fontSizeKeys.has(value) || LENGTH_VALUE.test(value)) return null;
  }

  // A bracketed alpha is always valid.
  if (modifier.startsWith("[")) return null;

  return opacityKeys.has(modifier) ? null : modifier;
}

async function main() {
  const resolved = resolveConfig(tailwindConfig);
  const opacityKeys = new Set(Object.keys(resolved.theme.opacity ?? {}));
  const fontSizeKeys = new Set(Object.keys(resolved.theme.fontSize ?? {}));

  if (opacityKeys.size === 0) {
    console.error("✗ Could not resolve theme.opacity from tailwind.config.ts.");
    process.exit(2);
  }

  // Derive the scan set from the config's own `content`, so the guard tracks it:
  // take each non-node_modules glob's fixed prefix as a root and walk it. A pattern
  // with no `*` is a literal path, not a prefix — slicing at -1 would silently
  // produce a directory that does not exist.
  const patterns = (tailwindConfig.content as readonly string[]).filter(
    (pattern) => !pattern.includes("node_modules"),
  );
  const roots = [
    ...new Set(
      patterns.map((pattern) => {
        const star = pattern.indexOf("*");
        return path.resolve(process.cwd(), star === -1 ? pattern : pattern.slice(0, star));
      }),
    ),
  ]
    // Drop roots nested inside another root, or the same file would be scanned twice.
    .filter((root, _i, all) => !all.some((other) => other !== root && root.startsWith(other + path.sep)));

  const readFailures: string[] = [];
  const files = [
    ...new Set((await Promise.all(roots.map((root) => walk(root, readFailures)))).flat()),
  ].sort();

  // Scanning nothing must never look like success — that is the exact silent
  // failure mode this guard exists to eliminate.
  if (files.length === 0) {
    console.error(
      `✗ No files to scan. Roots derived from tailwind.config.ts content: ${roots.join(", ") || "(none)"}`,
    );
    process.exit(2);
  }

  const findings: Finding[] = [];

  for (const file of files) {
    const source = ts.sys.readFile(file);
    if (source === undefined) {
      readFailures.push(`${path.relative(process.cwd(), file)} — could not be read`);
      continue;
    }
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const visit = (node: ts.Node) => {
      const isLiteral =
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node);

      if (isLiteral) {
        const text = (node as ts.LiteralLikeNode).text;
        // Offset each token inside the literal so the report is jump-to-able rather
        // than pointing at the opening quote. Only safe when the literal's cooked
        // text sits verbatim in the source (no escapes shifting the offsets).
        const bodyStart = node.getStart(sf) + 1;
        const verbatim = sf.text.slice(bodyStart, bodyStart + text.length) === text;
        for (const match of text.matchAll(/\S+/g)) {
          const raw = match[0];
          const modifier = inspectToken(raw, opacityKeys, fontSizeKeys);
          if (modifier === null) continue;
          const pos = sf.getLineAndCharacterOfPosition(
            verbatim ? bodyStart + (match.index ?? 0) : node.getStart(sf),
          );
          findings.push({
            file: path.relative(process.cwd(), file),
            line: pos.line + 1,
            column: pos.character + 1,
            token: raw,
            modifier,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  // A partial scan is not a pass. Report it before any verdict about findings:
  // "✓ clean" over files nobody read is exactly the lie this script exists to stop.
  if (readFailures.length > 0) {
    console.error(`✗ ${readFailures.length} path(s) could not be read, so the scan is incomplete:`);
    for (const failure of readFailures) console.error(`  ${failure}`);
    process.exit(2);
  }

  if (findings.length === 0) {
    console.log(`✓ ${files.length} files scanned — every alpha modifier is on the scale.`);
    process.exit(0);
  }

  console.error(
    `✗ ${findings.length} class${findings.length === 1 ? "" : "es"} with an alpha modifier that Tailwind drops silently:\n`,
  );
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}:${f.column}`);
    console.error(`    ${f.token}  —  /${f.modifier} is not on the opacity scale, so no rule is emitted`);
  }
  const numeric = [...opacityKeys].filter((k) => /^\d+$/.test(k)).sort((a, b) => +a - +b);
  console.error(
    `\n  Valid modifiers: ${numeric.join(", ")} — or bracket it (e.g. /[0.94]) to opt out of the scale.`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("✗ check-tailwind-classes crashed:", err);
  process.exit(2);
});
