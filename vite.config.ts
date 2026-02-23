import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // Fallback values in case .env is missing
  const supabaseUrl = env.VITE_SUPABASE_URL || "https://mvarmtaypdbwolgakndm.supabase.co";
  const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12YXJtdGF5cGRid29sZ2FrbmRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzM3NDQsImV4cCI6MjA4Njg0OTc0NH0.ROEnjLFXXiiUoPHLOK9a71a45VM201BHePG_-lZqFQw";
  const supabaseProjectId = env.VITE_SUPABASE_PROJECT_ID || "mvarmtaypdbwolgakndm";

  return {
    base: process.env.GITHUB_PAGES === "true" ? "/family-connect/" : "/",
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
      mode === "development" && componentTagger(),
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
