import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const local = "/opt/pw-browsers/chromium";
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(local) ? local : undefined);

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    launchOptions: { executablePath, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] },
  },
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
