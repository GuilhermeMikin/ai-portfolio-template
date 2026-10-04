import { describe, expect, it } from "vitest";

import { formatPrintableHref } from "@/shared/utils/content";

describe("formatPrintableHref", () => {
  it.each([
    ["https://www.example.com/in/ada-example/", "example.com/in/ada-example"],
    ["https://github.com/ada-example", "github.com/ada-example"],
    ["http://example.com", "example.com"],
    ["HTTPS://WWW.Example.com///", "Example.com"],
    ["  https://example.com/a?b=1#c  ", "example.com/a?b=1#c"],
    ["https://wwwexample.com/", "wwwexample.com"],
    ["mailto:ada@example.com", "ada@example.com"],
  ])("%j → %j", (href, expected) => {
    expect(formatPrintableHref(href)).toBe(expected);
  });

  it.each(["/resume.pdf", "example.com", "ftp://example.com", "javascript:alert(1)", "https://", "https:///", ""])(
    "returns null for %j",
    (href) => {
      expect(formatPrintableHref(href)).toBeNull();
    }
  );
});
