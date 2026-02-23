import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { requestFCMToken, onForegroundMessage } from "@/lib/firebase";
import { isNativePlatform, registerNativePush, setupNativePushListeners } from "@/lib/capacitor-push";
import { useNotificationSound } from "@/hooks/use-notifications";
import { toast } from "sonner";

export function usePushNotifications(userId: string | undefined) {
  const registeredRef = useRef(false);
  const playSound = useNotificationSound();
  const navigateRef = useRef<ReturnType<typeof useNavigate> | null>(null);

  // We need navigate but this hook might be used outside Router context
  // So we try to get it safely
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    navigateRef.current = useNavigate();
  } catch {
    // Not inside Router - that's ok
  }

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
      });

      // Set up native push listeners
      const cleanup = setupNativePushListeners(
        // Foreground notification
        (title, body, data) => {
          playSound();
          toast(title, { description: body });
        },
        // Notification tap (background/closed)
        (data) => {
          const chatId = data?.chat_id;
          if (chatId && navigateRef.current) {
            navigateRef.current(`/chat/${chatId}`);
          }
        }
      );

      return cleanup;
    } else {
      // ===== WEB (PWA via Firebase) =====
      console.log("[Push] Web platform detected, using Firebase FCM");
      
      const register = async () => {
        try {
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

  // Handle foreground messages (web only - native handled by setupNativePushListeners)
  useEffect(() => {
    if (isNativePlatform()) return; // Native handles this differently

    const unsub = onForegroundMessage((payload: any) => {
      const title = payload.data?.title || payload.notification?.title;
      const body = payload.data?.body || payload.notification?.body;
      if (!title) return;

      if (document.hidden) {
        playSound();
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
        playSound();
        toast(title, { description: body });
      }
    });
    return unsub;
  }, [playSound]);
}
