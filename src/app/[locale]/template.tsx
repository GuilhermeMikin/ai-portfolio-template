"use client";

import { useEffect } from "react";

/**
 * A short fade when moving between pages on the client (a CSS animation, see
 * `animate-page-in` in tailwind.config.ts). The first page load is static, so the
 * server HTML never ships hidden, and visitors who prefer reduced motion get none.
 */
let hasMountedOnce = false;

export default function Template({ children }: Readonly<{ children: React.ReactNode }>) {
  const animateEnter = hasMountedOnce;

  useEffect(() => {
    hasMountedOnce = true;
  }, []);

  return <div className={animateEnter ? "motion-safe:animate-page-in" : undefined}>{children}</div>;
}
