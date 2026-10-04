import { ImageResponse } from "next/og";

import { getProfile } from "@/content";
import { DEFAULT_LOCALE } from "@/shared/config/site";
import { APPLE_ICON_SIZE, BRAND_COLORS, getMonogram } from "@/shared/utils/seo";

export const size = APPLE_ICON_SIZE;
export const contentType = "image/png";

/**
 * Home-screen icon (served at /apple-icon): the owner's initials in white on graphite.
 * Full-bleed on purpose: iOS rounds the corners itself and fills transparent areas with black.
 */
export default function AppleIcon() {
  const monogram = getMonogram(getProfile(DEFAULT_LOCALE).person.name);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          backgroundColor: BRAND_COLORS.strong,
          color: BRAND_COLORS.onStrong,
          // Same proportions as src/app/icon.tsx.
          fontSize: size.width * (Array.from(monogram).length > 1 ? 0.42 : 0.52),
          letterSpacing: size.width * -0.01,
          WebkitTextStroke: `${size.width * 0.02}px ${BRAND_COLORS.onStrong}`,
        }}
      >
        {monogram}
      </div>
    ),
    { ...size }
  );
}
