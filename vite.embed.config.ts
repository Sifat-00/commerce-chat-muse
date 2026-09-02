// Standalone build for the embeddable chat widget.
// Produces a single self-contained IIFE script at public/embed/aria-chat-widget.js
// (React + styles bundled in) that any site can load with one <script> tag.
//
// Run: bun run build:embed
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths({ projects: ["./tsconfig.json"] })],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "public/embed",
    emptyOutDir: false,
    cssCodeSplit: false,
    target: "es2020",
    lib: {
      entry: fileURLToPath(new URL("./src/embed/index.tsx", import.meta.url)),
      name: "AriaChat",
      formats: ["iife"],
      fileName: () => "aria-chat-widget.js",
    },
  },
});
