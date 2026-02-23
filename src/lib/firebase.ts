import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyC6OnsbYZXkLJml9BAspouq_BuQcbZsYjk",
  authDomain: "whatszak.firebaseapp.com",
  projectId: "whatszak",
  storageBucket: "whatszak.firebasestorage.app",
  messagingSenderId: "518347482386",
  appId: "1:518347482386:web:570beff4e627cad9d03fcb",
  measurementId: "G-E4B4YCXCTZ",
};

const VAPID_KEY = "BNbyVrS0vnO5_K6aHn3jgEkSzVu8dvNW0PMSLu9VB6FwLpbJLmAbYilmlToF0DU4c2OkMEQbTjcY36HLExY5F_I";

const app = initializeApp(firebaseConfig);

let messaging: Messaging | null = null;

function getMessagingInstance(): Messaging | null {
  if (messaging) return messaging;
  try {
    messaging = getMessaging(app);
    return messaging;
  } catch {
    console.warn("Firebase Messaging not supported in this browser");
    return null;
  }
}

export async function requestFCMToken(): Promise<string | null> {
  try {
    const m = getMessagingInstance();
    if (!m) return null;

    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return null;
    }

    // Register or get existing Firebase messaging SW (respect base URL)
    const base = import.meta.env.BASE_URL || "/";
    const swPath = `${base}firebase-messaging-sw.js`.replace("//", "/");
    let registration = await navigator.serviceWorker.getRegistration(swPath);
    if (!registration) {
      console.log("[FCM] Registering new service worker at:", swPath);
      registration = await navigator.serviceWorker.register(swPath);
    }

    // Wait for the SW to be active before requesting token
    if (registration.installing || registration.waiting) {
      await new Promise<void>((resolve) => {
        const sw = registration!.installing || registration!.waiting;
        if (!sw) { resolve(); return; }
        sw.addEventListener("statechange", () => {
          if (sw.state === "activated") resolve();
        });
        // Fallback timeout
        setTimeout(resolve, 5000);
      });
    }

    console.log("[FCM] SW active, requesting token...");
    const token = await getToken(m, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    return token;
  } catch (err) {
    console.error("Failed to get FCM token:", err);
    return null;
  }
}

export function onForegroundMessage(callback: (payload: any) => void) {
  const m = getMessagingInstance();
  if (!m) return () => {};
  return onMessage(m, callback);
}
