import { defineConfig, devices } from "@playwright/test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { scryptSync } from "node:crypto"
const passwordHash = `scrypt:test:${scryptSync("test-admin-password", "test", 64).toString("hex")}`
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx tsx tests/s3-server.ts",
      port: 19000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100/api/health",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        DATABASE_PATH: join(
          mkdtempSync(join(tmpdir(), "ubike-e2e-")),
          "app.sqlite"
        ),
        APP_URL: "http://127.0.0.1:3100",
        ADMIN_PASSWORD_HASH: passwordHash,
        RATE_LIMIT_SECRET: "test-only-secret",
        S3_ENDPOINT: "http://127.0.0.1:19000",
        S3_REGION: "us-east-1",
        S3_ACCESS_KEY_ID: "test",
        S3_SECRET_ACCESS_KEY: "test",
        S3_PRIVATE_BUCKET: "private",
        S3_PUBLIC_BUCKET: "public",
        ASSET_PUBLIC_BASE_URL: "http://127.0.0.1:19000/public",
        TURNSTILE_SECRET_KEY: "",
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
        TYPESAFE_API_KEY: "",
        OPENROUTER_API_KEY: "",
      },
    },
  ],
})
