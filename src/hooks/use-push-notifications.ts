import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isNativePlatform, registerNativePush, setupNativePushListeners } from "@/lib/capacitor-push";
import { useNotificationSound } from "@/hooks/use-notifications";
import { toast } from "sonner";

export function usePushNotifications(userId: string | undefined) {
  const registeredRef = useRef(false);
  const playSound = useNotificationSound();
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId || registeredRef.current) return;
    registeredRef.current = true;

    if (isNativePlatform()) {
      // ===== NATIVE (Android/iOS via Capacitor) =====
      console.log("[Push] Native platform detected, using Capacitor Push");
      
      registerNativePush(userId).then((token) => {
        if (token) {
          console.log("[Push] Native token registered successfully");
        } else {
          console.warn("[Push] Native token not obtained");
        }
      }).catch((err) => {
        console.error("[Push] Native registration error:", err);
      });

      // Set up native push listeners
      const cleanup = setupNativePushListeners(
        (title, body, _data) => {
          try { playSound(); } catch (_e) { /* ignore */ }
          toast(title, { description: body });
        },
        (data) => {
          const chatId = data?.chat_id;
          if (chatId) {
            try { navigate(`/chat/${chatId}`); } catch (_e) { /* ignore */ }
          }
        }
      );

      return cleanup;
    } else {
      // ===== WEB (PWA via Firebase) =====
      console.log("[Push] Web platform detected, using Firebase FCM");
      
      const register = async () => {
        try {
          const { requestFCMToken } = await import("@/lib/firebase");
          const token = await requestFCMToken();
          if (!token) {
            console.warn("FCM token not available");
            return;
          }
          console.log("FCM token obtained, saving...");
          const { error } = await supabase.from("push_tokens" as any).upsert(
            { user_id: userId, token, platform: "web" } as any,
            { onConflict: "user_id,token" }
          );
          if (error) {
            console.error("Failed to save push token:", error);
            const { error: insertError } = await supabase.from("push_tokens" as any).insert(
              { user_id: userId, token, platform: "web" } as any
            );
            if (insertError && !insertError.message?.includes("duplicate")) {
              console.error("Push token insert also failed:", insertError);
            }
          }
          console.log("FCM token registered successfully");
        } catch (err) {
          console.error("Push registration failed:", err);
        }
      };

      register();
    }
  }, [userId]);

  // Handle foreground messages (web only)
  useEffect(() => {
    if (isNativePlatform()) return;

    let unsubscribe = () => {};
    
    import("@/lib/firebase").then(({ onForegroundMessage }) => {
      unsubscribe = onForegroundMessage((payload: any) => {
        const title = payload.data?.title || payload.notification?.title;
        const body = payload.data?.body || payload.notification?.body;
        if (!title) return;

        if (document.hidden) {
          try { playSound(); } catch (_e) { /* ignore */ }
          if ("Notification" in window && Notification.permission === "granted") {
            const chatId = payload.data?.chat_id;
            const notification = new Notification(title, {
              body: body || "",
              icon: "/pwa-192x192.png",
              badge: "/pwa-192x192.png",
              tag: "whatzak-push",
              renotify: true,
              data: payload.data || {},
            } as NotificationOptions);
            notification.onclick = () => {
              window.focus();
              if (chatId) {
                window.location.href = `/chat/${chatId}`;
              }
              notification.close();
            };
          }
        } else {
          try { playSound(); } catch (_e) { /* ignore */ }
          toast(title, { description: body });
        }
      });
    }).catch((err) => {
      console.error("[Push] Failed to load firebase module:", err);
    });

    return () => unsubscribe();
  }, [playSound]);
}
