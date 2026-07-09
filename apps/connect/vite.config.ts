import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { fileURLToPath } from "node:url";
import {
  connectPublicConfigPath,
  connectPublicConfigSchema,
} from "@ai-assistants/connect-api-contracts/public-config";

const root = fileURLToPath(new URL(".", import.meta.url));
const outDir = fileURLToPath(new URL("../../dist/apps/connect", import.meta.url));

function connectConfigFromViteEnv(env: NodeJS.ProcessEnv) {
  const config = connectPublicConfigSchema.parse({
    backendUrl: env.BACKEND_PUBLIC_URL,
    supabaseUrl: env.SUPABASE_PUBLIC_URL,
    supabaseAnonKey: env.SUPABASE_ANON_KEY,
  });
  const hmrHost = env.VITE_CONNECT_HMR_HOST?.trim() || undefined;
  return { config, hmrHost };
}

export default defineConfig(({ command }) => {
  const connectEnv = command === "serve" ? connectConfigFromViteEnv(process.env) : undefined;
  return {
    root,
    plugins: [
      {
        name: "connect-public-config",
        configureServer(server) {
          const connectPublicConfig =
            connectEnv?.config ?? connectConfigFromViteEnv(process.env).config;
          server.middlewares.use((req, res, next) => {
            const url = new URL(req.url ?? "/", "http://localhost");
            if (url.pathname !== connectPublicConfigPath) {
              next();
              return;
            }
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify(connectPublicConfig));
          });
        },
      },
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
    ],
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("/react/") || id.includes("/react-dom/")) return "react";
            if (id.includes("/@supabase/")) return "supabase";
            if (id.includes("/@tanstack/")) return "tanstack";
            if (id.includes("/lucide-react/")) return "icons";
            return undefined;
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: connectEnv
        ? {
            "/oauth": {
              target: connectEnv.config.backendUrl,
              changeOrigin: true,
            },
          }
        : undefined,
      hmr: connectEnv?.hmrHost
        ? {
            clientPort: 443,
            host: connectEnv.hmrHost,
            protocol: "wss",
          }
        : undefined,
    },
  };
});
