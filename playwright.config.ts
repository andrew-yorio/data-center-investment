import { defineConfig } from "@playwright/test";

// Expects `npm run dev:api` (port 8788) and scripts/localdb/up.sh to be running.
export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8788",
    channel: "chrome",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  reporter: [["list"]],
});
