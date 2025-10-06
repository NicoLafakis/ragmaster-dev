import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3050,
    proxy: {
      "/api": {
        target: "http://localhost:3000", // updated from 3001 to match backend
        changeOrigin: true,
        secure: false,
      },
    },
  },
  base: "./", // Use relative paths for assets
});
