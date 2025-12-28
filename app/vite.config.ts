import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const columnScanDevPlugin = () => ({
  name: "column-scan-dev-endpoint",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/api/column-scan", async (req, res, next) => {
      if (!req.url?.startsWith("/api/column-scan")) {
        return next();
      }
      res.statusCode = 501;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ok: false,
          error:
            "Column scan serverless function is only available in deployed/Vercel runtime. Use `npm run build` + deploy or run the Vercel function locally to exercise the real handler.",
          requestId: "dev"
        })
      );
    });
  }
});

const plugins = [react()];
if (process.env.NODE_ENV !== "production") {
  plugins.push(columnScanDevPlugin());
}

export default defineConfig({
  plugins,
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/tests/setup.ts"
  }
});
