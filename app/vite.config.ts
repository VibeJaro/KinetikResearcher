import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

export default defineConfig(({ mode }) => {
  const baseConfig = {
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/tests/setup.ts"
    }
  };

  if (isTest || mode === "test") {
    return {
      ...baseConfig,
      plugins: [react()]
    };
  }

  const columnScanDevPlugin = () => ({
    name: "column-scan-dev-endpoint",
    configureServer(server) {
      server.middlewares.use("/api/column-scan", async (req, res, next) => {
        if (!req.url?.startsWith("/api/column-scan")) {
          return next();
        }
        try {
          const handlerPath = "./api/column-scan";
          const module = await import(/* @vite-ignore */ handlerPath);
          if (typeof module.default === "function") {
            await module.default(req, res);
            return;
          }
        } catch (error) {
          // surface the error in dev for visibility
          console.error("[column-scan] dev handler error", error);
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              ok: false,
              error: "Dev handler error",
              requestId: "dev"
            })
          );
          return;
        }
        next();
      });
    }
  });

  return {
    ...baseConfig,
    plugins: [react(), columnScanDevPlugin()]
  };
});
