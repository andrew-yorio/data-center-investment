import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { BRAND_NAME, CONTACT_EMAIL } from "./shared/brand.ts";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // Keeps the brand in one place: shared/brand.ts also feeds the static HTML shells.
      name: "brand-html",
      transformIndexHtml: (html) => html.replaceAll("%BRAND_NAME%", BRAND_NAME).replaceAll("%CONTACT_EMAIL%", CONTACT_EMAIL),
    },
  ],
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        privacy: resolve(import.meta.dirname, "privacy.html"),
      },
    },
  },
  server: {
    // `npm run dev` serves the frontend only; run `npm run pages:dev` for the API.
    proxy: { "/api": "http://localhost:8788" },
  },
});
