/**
 * Strict parsing of server environment variables.
 *
 * A value that cannot be parsed never changes behavior silently: the default (or the
 * nearest allowed bound) is used and a warning naming the variable is logged once per
 * process. The raw value is never logged: a secret pasted into the wrong variable must
 * not end up in the logs.
 *
 * Server-only.
 */

export type Env = Record<string, string | undefined>;

/** The trimmed value, or undefined when the variable is unset or blank. */
export function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

const warnedVariables = new Set<string>();

/** Logs, once per process and variable, that a value was ignored and what is used instead. */
export function warnInvalidEnv(name: string, problem: string, using: string | number) {
  const key = `${name}:${problem}`;
  if (warnedVariables.has(key)) {
    return;
  }

  warnedVariables.add(key);
  console.warn(JSON.stringify({ scope: "config", event: "invalid_env", variable: name, problem, using }));
}

/** Forgets which warnings were logged. For tests. */
export function resetEnvWarnings() {
  warnedVariables.clear();
}

/**
 * A whole number in `[min, max]`. Only plain digits are accepted ("12", not "12abc",
 * "1e3" or "-1"). Below `min` → `fallback`; above `max` → `max`.
 */
export function parseIntegerEnv(
  env: Env,
  name: string,
  fallback: number,
  { min = 1, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {}
): number {
  const raw = readEnv(env, name);
  if (raw === undefined) {
    return fallback;
  }

  if (!/^\d+$/.test(raw)) {
    warnInvalidEnv(name, "not_a_whole_number", fallback);
    return fallback;
  }

  const value = Number(raw);
  if (value < min) {
    warnInvalidEnv(name, "below_minimum", fallback);
    return fallback;
  }

  if (value > max) {
    warnInvalidEnv(name, "above_maximum", max);
    return max;
  }

  return value;
}

/** A decimal number such as "0.3" or "1", within `[min, max]`; otherwise `fallback`. */
export function parseDecimalEnv(
  env: Env,
  name: string,
  fallback: number,
  { min, max }: { min: number; max: number }
): number {
  const raw = readEnv(env, name);
  if (raw === undefined) {
    return fallback;
  }

  const value = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || value < min || value > max) {
    warnInvalidEnv(name, "not_a_number_in_range", fallback);
    return fallback;
  }

  return value;
}

/** true/false (also 1/0, yes/no, on/off); anything else → `fallback`. */
export function parseBooleanEnv(env: Env, name: string, fallback: boolean): boolean {
  const raw = readEnv(env, name)?.toLowerCase();
  if (raw === undefined) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }

  warnInvalidEnv(name, "not_a_boolean", String(fallback));
  return fallback;
}

/** One of `allowed` (case-insensitive); unset → `fallback`; anything else → `fallback` and a warning. */
export function parseChoiceEnv<T extends string>(env: Env, name: string, allowed: readonly T[], fallback: T): T {
  const raw = readEnv(env, name)?.toLowerCase();
  if (raw === undefined) {
    return fallback;
  }

  const match = allowed.find((choice) => choice === raw);
  if (!match) {
    warnInvalidEnv(name, "unknown_value", fallback || "default");
    return fallback;
  }

  return match;
}
