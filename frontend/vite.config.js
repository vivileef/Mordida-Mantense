import process from "node:process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const publicEnv = loadEnv(mode, process.cwd(), "VITE_");
  const configuredTarget = publicEnv.VITE_API_BASE_URL || "";
  const apiTarget = (configuredTarget.startsWith("http://localhost:")
    ? configuredTarget.replace("http://localhost:", "http://127.0.0.1:")
    : configuredTarget.startsWith("http://") || configuredTarget.startsWith("https://")
    ? configuredTarget
    : "http://127.0.0.1:8080").replace(/\/$/, "");
  // This key stays in the local Vite server process; it is never sent to Vite's client bundle.
  const serverApiKey = process.env.MANTA_API_KEY;

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
          configure(proxy) {
            if (!serverApiKey) return;
            proxy.on("proxyReq", (proxyRequest) => {
              proxyRequest.setHeader("x-api-key", serverApiKey);
            });
          },
        },
      },
    },
  };
});
