import { ImageResponse } from "next/og";

import { getProfile } from "@/content";
import { DEFAULT_LOCALE } from "@/shared/config/site";
import { BRAND_COLORS, ICON_SIZE, getMonogram } from "@/shared/utils/seo";

export const size = ICON_SIZE;
export const contentType = "image/png";

/** Favicon (served at /icon): the owner's initials in white on a graphite rounded square. */
export default function Icon() {
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
          borderRadius: size.width * 0.22,
          backgroundColor: BRAND_COLORS.strong,
          color: BRAND_COLORS.onStrong,
          // Sized so two wide letters ("WW") still fit; the stroke keeps the default
          // (regular-weight) font legible at 16 px.
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
