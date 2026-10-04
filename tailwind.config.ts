import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

/** Theme colors live as CSS variables in src/app/globals.css (light and dark). */
const token = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  // Colors switch through the tokens; `dark:` is only needed for things like icons.
  darkMode: ["selector", '[data-theme="dark"]'],
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
        scrim: token("scrim"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
      },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow-color) / 0.04), 0 1px 3px rgb(var(--shadow-color) / 0.06)",
        raised: "0 16px 40px -16px rgb(var(--shadow-color) / 0.22)",
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
