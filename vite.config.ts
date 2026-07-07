import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // Fallback values in case .env is missing
  const supabaseUrl = env.VITE_SUPABASE_URL || "https://tuddxnujcluwsuxifnfq.supabase.co";
  const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1ZGR4bnVqY2x1d3N1eGlmbmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzI3MDksImV4cCI6MjA4Njg0ODcwOX0.65tPR7C1ymuggQutDzap3Ck1yc0Zy_k0p6bUicJgOnU";
  const supabaseProjectId = env.VITE_SUPABASE_PROJECT_ID || "tuddxnujcluwsuxifnfq";

  return {
    base: "/",
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabaseKey),
      'import.meta.env.VITE_SUPABASE_PROJECT_ID': JSON.stringify(supabaseProjectId),
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        workbox: {
          navigateFallbackDenylist: [/^\/~oauth/],
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"],
          globIgnores: ["**/firebase-messaging-sw.js"],
        },
        includeAssets: ["favicon.ico", "og-image.png"],
        manifest: {
          name: "WhatsZak",
          short_name: "WhatsZak",
          description: "Pate papo Famila",
          theme_color: "#25D366",
          background_color: "#ffffff",
          display: "standalone",
          orientation: "portrait",
          start_url: ".",
          icons: [
            {
              src: "pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
    ].filter(Boolean),
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
