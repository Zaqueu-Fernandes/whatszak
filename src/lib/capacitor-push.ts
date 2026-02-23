import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true if we're running inside a native Capacitor shell (Android/iOS).
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Register for native push notifications on Android/iOS via Capacitor.
 * Saves the FCM token to the push_tokens table.
 * Returns the token or null.
 */
export async function registerNativePush(userId: string): Promise<string | null> {
  if (!isNativePlatform()) return null;

  try {
    // Request permission
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === "prompt") {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== "granted") {
      console.warn("[NativePush] Permission not granted:", permStatus.receive);
      return null;
    }

    // Register with the OS
    await PushNotifications.register();

    // Wait for registration token
    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn("[NativePush] Token timeout");
        resolve(null);
      }, 10000);

      PushNotifications.addListener("registration", async (token) => {
        clearTimeout(timeout);
        console.log("[NativePush] Token received:", token.value.substring(0, 20) + "...");

        // Save token to push_tokens table
        const { error } = await supabase.from("push_tokens" as any).upsert(
          { user_id: userId, token: token.value, platform: "android" } as any,
          { onConflict: "user_id,token" }
        );
        if (error) {
          console.error("[NativePush] Failed to save token:", error);
          // Fallback: try insert
          await supabase.from("push_tokens" as any).insert(
            { user_id: userId, token: token.value, platform: "android" } as any
          ).then(({ error: e2 }) => {
            if (e2 && !e2.message?.includes("duplicate")) {
              console.error("[NativePush] Insert also failed:", e2);
            }
          });
        }
        resolve(token.value);
      });

      PushNotifications.addListener("registrationError", (err) => {
        clearTimeout(timeout);
        console.error("[NativePush] Registration error:", err);
        resolve(null);
      });
    });
  } catch (err) {
    console.error("[NativePush] Error:", err);
    return null;
  }
}

/**
 * Set up listeners for incoming push notifications on native platforms.
 * - Foreground: show in-app handler
 * - Tap: navigate to chat
 */
export function setupNativePushListeners(
  onForegroundNotification: (title: string, body: string, data: any) => void,
  onNotificationTap: (data: any) => void
) {
  if (!isNativePlatform()) return () => {};

  // Notification received while app is in foreground
  const fgListener = PushNotifications.addListener(
    "pushNotificationReceived",
    (notification) => {
      console.log("[NativePush] Foreground notification:", JSON.stringify(notification));
      const title = notification.title || notification.data?.title || "";
      const body = notification.body || notification.data?.body || "";
      onForegroundNotification(title, body, notification.data || {});
    }
  );

  // Notification tapped (app was in background/closed)
  const tapListener = PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action) => {
      console.log("[NativePush] Notification tapped:", JSON.stringify(action));
      const data = action.notification.data || {};
      onNotificationTap(data);
    }
  );

  return () => {
    fgListener.then((l) => l.remove());
    tapListener.then((l) => l.remove());
  };
}
