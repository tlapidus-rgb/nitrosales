import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({
  test: { include: ["scripts/validation/*.integration.ts"], maxWorkers: 1, testTimeout: 30000, hookTimeout: 30000 },
  resolve: { alias: { "@": path.resolve(__dirname,"src") } },
});
