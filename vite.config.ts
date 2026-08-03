import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
   base: './',

  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "events": path.resolve(__dirname, "./node_modules/events/events.js"),
      "process": path.resolve(__dirname, "./node_modules/process/browser.js"),
      "stream": path.resolve(__dirname, "./node_modules/stream-browserify/index.js"),
    },
  },
}));
