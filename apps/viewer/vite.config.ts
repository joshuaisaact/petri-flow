import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react({
      babel: { plugins: [["babel-plugin-react-compiler"]] },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@workflows": path.resolve(__dirname, "../../workflows"),
      "@comparisons": path.resolve(__dirname, "../../comparisons"),
    },
  },
  server: {
    proxy: {
      "/definitions": "http://localhost:3000",
      "/workflows": "http://localhost:3000",
    },
  },
});
