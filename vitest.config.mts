import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Unit and integration tests. They never call a real AI provider: the LLM is
 * mocked by stubbing `fetch`. Model answer quality is evaluated separately with
 * `pnpm eval` (see scripts/eval/).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
