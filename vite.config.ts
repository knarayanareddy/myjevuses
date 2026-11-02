import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages project sites are served from /<repo>/, so the deploy build
  // passes --base=/myjevuses/. The default keeps local dev at /.
  base: process.env.VITE_BASE ?? "/",
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: false,
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 4173,
  },
  build: {
    outDir: "dist",
  },
});
