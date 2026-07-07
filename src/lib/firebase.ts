import { Capacitor } from "@capacitor/core";

const firebaseConfig = {
  apiKey: "AIzaSyCKoERRZMNZ3JdwGqvrade0LzWLWpRSofw",
  authDomain: "whatszak-c58a7.firebaseapp.com",
  projectId: "whatszak-c58a7",
  storageBucket: "whatszak-c58a7.firebasestorage.app",
  messagingSenderId: "416618641889",
  appId: "1:416618641889:web:aee7d3b2511ac3f9787aa0",
};

const VAPID_KEY = "BCuwb5y06JvR8b515EvKrIzEz8RwR2NzfPNjBVZNYTNYLuJ3bQpUckFSd8WQ_KAo3b5EzWUcXzP0EWaP5u48gRw";

let firebaseApp: any = null;
let messaging: any = null;

async function getMessagingInstance(): Promise<any> {
  // Firebase Messaging (web) is not supported on native platforms
  if (Capacitor.isNativePlatform()) return null;
  
  if (messaging) return messaging;
  try {
    const { initializeApp } = await import("firebase/app");
    const { getMessaging } = await import("firebase/messaging");
    if (!firebaseApp) {
      firebaseApp = initializeApp(firebaseConfig);
    }
    messaging = getMessaging(firebaseApp);
    return messaging;
  } catch {
    console.warn("Firebase Messaging not supported in this browser");
    return null;
  }
}

export async function requestFCMToken(): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) return null;
    
    const m = await getMessagingInstance();
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
    const { getToken } = await import("firebase/messaging");
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
  if (Capacitor.isNativePlatform()) return () => {};
  
  // Use dynamic import to avoid loading firebase/messaging on native
  let unsubscribe = () => {};
  getMessagingInstance().then((m) => {
    if (!m) return;
    import("firebase/messaging").then(({ onMessage }) => {
      unsubscribe = onMessage(m, callback);
    });
  });
  return () => unsubscribe();
}
