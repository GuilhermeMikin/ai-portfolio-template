import type { NextConfig } from "next";

import { DEFAULT_LOCALE } from "./src/shared/config/site";
import { SITE_PAGES } from "./src/shared/config/site-links";

// Dev only: extra hosts (e.g. a LAN or Tailscale IP) allowed to open `next dev` from another
// device. Set DEV_ALLOWED_ORIGINS in .env.local as comma-separated hostnames or IPs, without
// scheme or port; it does nothing in production.
const allowedDevOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Baseline security headers for every route. There is no Content-Security-Policy: Next.js
// inline scripts would need per-request nonces (see the Next.js CSP guide to add one).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  poweredByHeader: false,
  // Page paths typed without a locale (`/about`) go to the default locale. The root
  // `/` is handled by src/app/page.tsx, which also honors the saved language choice.
  async redirects() {
    return SITE_PAGES.filter((page) => page !== "").map((page) => ({
      source: `/${page}`,
      destination: `/${DEFAULT_LOCALE}/${page}`,
      permanent: false,
    }));
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
