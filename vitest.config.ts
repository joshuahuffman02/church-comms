import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The engine works in date-only (church-local midnight) terms and the tests
// assert via toISOString() (UTC) slices. Pin the runner timezone to UTC so the
// date-only round-trips are deterministic on any machine (the plan's tests and
// implementation are written assuming a UTC runner).
process.env.TZ = "UTC";

export default defineConfig({
  // Mirror the tsconfig `@/*` path alias so tests can import modules (like the
  // export builders) that reference app code via `@/...`.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
