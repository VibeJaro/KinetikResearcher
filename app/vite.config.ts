import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(async ({ command }) => {
  const plugins = [react()];

  if (command === "serve") {
    const { columnScanDevPlugin } = await import("./vite.columnScanDevPlugin");
    plugins.push(columnScanDevPlugin());
  }

  return {
    plugins,
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/tests/setup.ts"
    }
  };
});
