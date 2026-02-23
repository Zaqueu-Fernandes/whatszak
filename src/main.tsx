import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Prevent unhandled errors from causing white screen
window.addEventListener("error", (e) => {
  console.error("[Global Error]", e.error);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[Unhandled Promise]", e.reason);
});

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
} else {
  console.error("[Fatal] #root element not found");
}
