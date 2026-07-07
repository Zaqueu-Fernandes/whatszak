/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCKoERRZMNZ3JdwGqvrade0LzWLWpRSofw",
  authDomain: "whatszak-c58a7.firebaseapp.com",
  projectId: "whatszak-c58a7",
  storageBucket: "whatszak-c58a7.firebasestorage.app",
  messagingSenderId: "416618641889",
  appId: "1:416618641889:web:aee7d3b2511ac3f9787aa0",
});

const messaging = firebase.messaging();

// Background message handler - fires when the page is NOT loaded at all
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-sw] Background message received:", JSON.stringify(payload));
  // Data-only messages: extract title/body from data
  const title = payload.data?.title || payload.notification?.title;
  const body = payload.data?.body || payload.notification?.body;
  if (title) {
    self.registration.showNotification(title, {
      body: body || "",
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag: "whatzak-push-" + Date.now(), // unique tag to avoid deduplication
      renotify: true,
      requireInteraction: true, // keep notification visible until user interacts
      vibrate: [200, 100, 200, 100, 200], // vibration pattern for mobile
      data: payload.data || {},
    });
  }
});

// Handle notification click - open/focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const chatId = data.chat_id;
  const urlToOpen = chatId ? `/chat/${chatId}` : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // No existing window - open a new one
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// Keep the service worker alive
self.addEventListener("install", (event) => {
  console.log("[firebase-sw] Installing...");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[firebase-sw] Activating...");
  event.waitUntil(self.clients.claim());
});
