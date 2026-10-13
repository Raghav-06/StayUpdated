import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    setupFiles: ["test/setup.js"],
    globalSetup: ["test/globalSetup.js"],
    // The DB tests share one test database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
