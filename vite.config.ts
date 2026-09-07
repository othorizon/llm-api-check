import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    sourcemap: false,
    target: "es2022",
    chunkSizeWarningLimit: 700,
    // Keep the SSR bundle self-contained so the prerender script can import it; split vendors on the client for caching.
    rollupOptions: isSsrBuild ? { output: { format: "es" } } : { output: { manualChunks: { react: ["react", "react-dom", "react-router"], radix: ["radix-ui"], icons: ["lucide-react"] } } },
  },
  ssr: { noExternal: true },
  server: { port: 5173, host: true },
  preview: { port: 4173 },
}));
