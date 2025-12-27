import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const columnScanDevPlugin = () => ({
  name: "column-scan-dev-endpoint",
  configureServer(server) {
    server.middlewares.use("/api/column-scan", async (req, res, next) => {
      if (!req.url?.startsWith("/api/column-scan")) {
        return next();
      }
      try {
        const module = await import("./api/column-scan");
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

export default defineConfig({
  plugins: [react(), columnScanDevPlugin()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/tests/setup.ts"
  }
});
