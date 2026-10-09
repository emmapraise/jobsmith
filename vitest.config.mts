import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // server-only throws outside a React Server environment; stub it for unit tests.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/setup/global.ts"],
    // Integration tests run against a separate database and a throwaway storage dir.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://localhost:5432/jobsmith_test",
      AUTH_SECRET: "test-secret-test-secret-test-secret",
      STORAGE_DRIVER: "local",
    },
    fileParallelism: false,
  },
});
