import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";
import "./index.css";

// Prevent unhandled errors from causing white screen
window.addEventListener("error", (e) => {
  console.error("[Global Error]", e.error);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[Unhandled Promise]", e.reason);
});

// Register PWA service worker only on web (avoid native WebView routing/cache issues)
if (!Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
  import("virtual:pwa-register")
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch((err) => console.warn("[PWA] Service worker registration skipped:", err));
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
} else {
  console.error("[Fatal] #root element not found");
}

