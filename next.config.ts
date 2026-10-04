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

// A static Content-Security-Policy that keeps every page prerendered. Scripts and styles
// may only come from this site; inline ones stay allowed because Next.js inlines its
// bootstrap code (a strict nonce-based policy would make every page dynamic; see the
// Next.js CSP guide). Production only: `next dev` needs eval for fast refresh.
// Adding a third-party script, font or API? Add its origin to the matching directive.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Baseline security headers for every route.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }]
    : []),
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
