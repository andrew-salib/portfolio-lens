import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "frontend",
  base: process.env.PAGES_BASE_PATH || "/",
  publicDir: "../public",
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  define: {
    "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(process.env.API_URL || ""),
    "process.env.NEXT_PUBLIC_STATIC_HOST": JSON.stringify("true"),
  },
  plugins: [react()],
  build: { outDir: "../dist-pages", emptyOutDir: true },
});
