import process from "node:process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendTarget =
  process.env.VITE_PROXY_TARGET || "http://localhost:8080";

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      "/health": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/auth": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },

  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
  },
});