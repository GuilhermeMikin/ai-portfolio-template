import { ImageResponse } from "next/og";

import { getProfile } from "@/content";
import { DEFAULT_LOCALE, SITE_URL, SUPPORTED_LOCALES, coerceLocale } from "@/shared/config/site";
import { BRAND_COLORS, OG_IMAGE_SIZE, getOgImageAlt } from "@/shared/utils/seo";

// The metadata from src/shared/utils/seo.ts links this image (served at /<locale>/opengraph-image)
// with a localized alt text; these exports describe it to Next.js.
export const alt = getOgImageAlt(getProfile(DEFAULT_LOCALE));
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

/** Prerenders one image per locale at build time. */
export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

/** Smaller type for longer names, so most fit on one or two lines. */
function getNameFontSize(name: string) {
  if (name.length <= 20) return 84;
  if (name.length <= 32) return 72;
  return 60;
}

/** Social card: name, headline and site host on the monochrome palette, using the default font. */
export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = coerceLocale((await params).locale);
  if (!locale) {
    return new Response("Not Found", { status: 404 });
  }

  const { person } = getProfile(locale);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: 40,
          backgroundColor: BRAND_COLORS.canvas,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flexGrow: 1,
            padding: "56px 64px",
            border: `2px solid ${BRAND_COLORS.line}`,
            borderRadius: 32,
            backgroundColor: BRAND_COLORS.surface,
            color: BRAND_COLORS.ink,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "block",
                lineClamp: 2,
                fontSize: getNameFontSize(person.name),
                lineHeight: 1.1,
                letterSpacing: -1.5,
              }}
            >
              {person.name}
            </div>
            <div
              style={{
                display: "block",
                lineClamp: 3,
                marginTop: 28,
                fontSize: 36,
                lineHeight: 1.35,
                color: BRAND_COLORS.muted,
              }}
            >
              {person.headline}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", fontSize: 26, color: BRAND_COLORS.muted }}>
            <div style={{ width: 40, height: 4, marginRight: 20, backgroundColor: BRAND_COLORS.ink }} />
            {new URL(SITE_URL).host}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
