import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/items": "http://localhost:3001",
      "/movements": "http://localhost:3001",
      "/stock-v2": "http://localhost:3001",
      "/orders": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});