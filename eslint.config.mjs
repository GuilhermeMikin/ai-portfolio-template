import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  // ESLint always skips node_modules/ and .git/, and eslint-config-next already ignores
  // .next/, out/, build/ and next-env.d.ts. Add the generated output it doesn't cover.
  {
    ignores: ["coverage/**"],
  },
];

export default eslintConfig;
