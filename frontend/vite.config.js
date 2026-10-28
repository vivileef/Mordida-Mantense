import react from "@vitejs/plugin-react";
import process from "node:process";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const publicEnv = loadEnv(mode, process.cwd(), "VITE_");
  const serverEnv = loadEnv(mode, process.cwd(), "");

  const apiTarget = (
    publicEnv.VITE_API_BASE_URL || "https://mo-0cc1a19f32244c86ad2fc33562bddc2f.ecs.us-east-2.on.aws"
  ).replace(/\/+$/, "");

  // La clave se utiliza únicamente en el servidor local de Vite.
  const configuredKey = process.env.MANTA_API_KEY || serverEnv.MANTA_API_KEY;
  const serverApiKey = configuredKey?.trim();
  const keyIsExample = /^(clave-local|changeme|your[_-].*|example.*|<.*>)$/i.test(serverApiKey || "");
  const usableApiKey = serverApiKey && !keyIsExample ? serverApiKey : "";
  if (usableApiKey) {
    console.log("[Vite] Credencial privada disponible para el proxy API.");
  } else {
    console.warn(
      "[Vite] Falta MANTA_API_KEY válida: el modo API REAL no podrá consultar /estado si el backend exige autenticación. Configúrala en la sesión de PowerShell antes de npm run dev.",
    );
  }

  return {
    plugins: [react()],

    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),

          configure(proxy) {
            proxy.on("proxyReq", (proxyRequest) => {
              // Nunca aceptar una clave arbitraria enviada por el navegador.
              proxyRequest.removeHeader("x-api-key");
              if (!usableApiKey) return;
              proxyRequest.setHeader("x-api-key", usableApiKey);
              console.log("[Vite] Encabezado x-api-key preparado:", true);
            });
          },
        },
      },
    },
  };
});
