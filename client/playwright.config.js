
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.spec.js",
    fullyParallel: false,
    retries: 0,
    reporter: "list",
    use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.PROD_E2E_BASE_URL ??
            "http://127.0.0.1:5174",
        trace: "retain-on-failure",
        screenshot: "only-on-failure"
    },
    outputDir: "./test-results",
    timeout: 30000,
    expect: {
        timeout: 10000
    }
});
