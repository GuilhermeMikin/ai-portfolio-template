import { afterEach, describe, expect, it, vi } from "vitest";

import OpenGraphImage, { generateStaticParams, size as ogSize } from "@/app/[locale]/opengraph-image";
import AppleIcon, { size as appleIconSize } from "@/app/apple-icon";
import Icon, { size as iconSize } from "@/app/icon";
import { getContent, type LocaleContent } from "@/content";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/shared/config/site";

// Lets a test render with other names without touching src/content.
const override = vi.hoisted(() => ({ content: null as LocaleContent | null }));

vi.mock("@/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/content")>();
  const getContent = (locale: Locale) => override.content ?? actual.getContent(locale);
  return {
    ...actual,
    getContent,
    getProfile: (locale: Locale) => getContent(locale).profile,
    getMessages: (locale: Locale) => getContent(locale).messages,
  };
});

afterEach(() => {
  override.content = null;
});

function usePerson(name: string, headline: string) {
  const content = structuredClone(getContent(DEFAULT_LOCALE));
  content.profile.person.name = name;
  content.profile.person.headline = headline;
  override.content = content;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Reads the PNG and returns its pixel size (from the IHDR chunk). */
async function readPng(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  const bytes = Buffer.from(await response.arrayBuffer());
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const ogImage = (locale: string) => OpenGraphImage({ params: Promise.resolve({ locale }) });

describe("generated images", () => {
  it("renders the Open Graph image for every locale at 1200×630", async () => {
    expect(ogSize).toEqual({ width: 1200, height: 630 });
    expect(generateStaticParams()).toEqual(SUPPORTED_LOCALES.map((locale) => ({ locale })));

    for (const locale of SUPPORTED_LOCALES) {
      expect(await readPng(await ogImage(locale))).toEqual(ogSize);
    }
  });

  it("answers 404 for an unknown locale instead of rendering", async () => {
    const response = await ogImage("not-a-locale");

    expect(response.status).toBe(404);
  });

  it("renders the icons at their declared sizes", async () => {
    expect(await readPng(Icon())).toEqual(iconSize);
    expect(await readPng(AppleIcon())).toEqual(appleIconSize);
  });

  it("copes with long and single-word names", async () => {
    usePerson(
      "Maria Fernanda de Albuquerque Cavalcanti Rodrigues",
      "Staff engineer focused on distributed systems, developer platforms, observability and applied machine learning, mentoring teams across three continents and many time zones"
    );
    expect(await readPng(await ogImage(DEFAULT_LOCALE))).toEqual(ogSize);
    const longNameIcon = Buffer.from(await Icon().arrayBuffer());

    usePerson("Prince", "Musician");
    expect(await readPng(await ogImage(DEFAULT_LOCALE))).toEqual(ogSize);
    expect(await readPng(AppleIcon())).toEqual(appleIconSize);
    // The monogram follows the name: "P" here, "MR" above.
    expect(Buffer.from(await Icon().arrayBuffer()).equals(longNameIcon)).toBe(false);
  });
});
