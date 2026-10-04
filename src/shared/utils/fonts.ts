import { Inter } from "next/font/google";

/**
 * Inter, self-hosted by next/font at build time and exposed as `--font-sans`
 * (Tailwind `font-sans`). Put `inter.variable` on <html>.
 */
export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});
