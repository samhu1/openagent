import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import babelPluginDataAi from "./scripts/babel-plugin-data-ai.js";
import path from "path";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [babelPluginDataAi],
      },
    }),
    tailwindcss(),
  ],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
  },
  server: {
    port: 5173,
  },
});
