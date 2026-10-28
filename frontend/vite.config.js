import process from "node:process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const publicEnv = loadEnv(mode, process.cwd(), "VITE_");
  const serverEnv = loadEnv(mode, process.cwd(), "MANTA_");
  const apiTarget = (publicEnv.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
  // This key is read only by Vite's local server proxy and is never exposed to the client bundle.
  const serverApiKey = process.env.MANTA_API_KEY || serverEnv.MANTA_API_KEY;

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
