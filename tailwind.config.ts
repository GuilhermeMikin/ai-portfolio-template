import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

/** Theme colors live as CSS variables in src/app/globals.css (`:root`). */
const token = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        subtle: token("subtle"),
        ink: token("ink"),
        muted: token("muted"),
        line: token("line"),
        field: token("field"),
        strong: token("strong"),
        "on-strong": token("on-strong"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
      },
      boxShadow: {
        card: "0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.06)",
        raised: "0 16px 40px -16px rgb(16 24 40 / 0.22)",
      },
      keyframes: {
        "page-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "page-in": "page-in 200ms ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
