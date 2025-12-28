import type { PluginOption } from "vite";

export const columnScanDevPlugin = (): PluginOption => ({
  name: "column-scan-dev-endpoint",
  configureServer(server) {
    server.middlewares.use("/api/column-scan", async (req, res, next) => {
      if (!req.url?.startsWith("/api/column-scan")) {
        return next();
      }
      try {
        // Avoid pre-bundling this handler; it's only needed in dev.
        const module = await import(/* @vite-ignore */ "./api/column-scan");
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
