import { useEffect, useRef } from "react";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@/features/auth/AuthProvider";
import { PUSH_AVAILABLE, syncPush } from "./pushDevice";
import { targetForNotification } from "./pushRules";

type Notifications = typeof import("expo-notifications");

/**
 * Wires pushes into the running app, and renders nothing: shows a notification that arrives while the app is open,
 * opens the right screen when one is tapped (also when the tap is what launched the app), and keeps this phone's
 * token fresh for an account that switched notifications on. Does nothing in builds without Firebase.
 */
export function PushBridge() {
  const { session, ready } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;
  const handledRef = useRef<string | null>(null);
  const openRef = useRef<(data: unknown) => void>(() => undefined);

  // Where a tap goes. Only for a signed-in person: a signed-out phone lands on the sign-in screen as usual.
  openRef.current = (data) => {
    if (!userId) return;
    const target = targetForNotification(data);
    if (!target) return;
    router.push((target.kind === "invitations" ? "/invitations" : `/group/${target.groupId}`) as Href);
  };

  useEffect(() => {
    if (!PUSH_AVAILABLE) return;
    let cancelled = false;
    let responses: { remove(): void } | undefined;
    let tokens: { remove(): void } | undefined;
    void import("expo-notifications").then((notifications: Notifications) => {
      if (cancelled) return;
      notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
      });
      responses = notifications.addNotificationResponseReceivedListener((response) => {
        handledRef.current = response.notification.request.identifier;
        openRef.current(response.notification.request.content.data);
        notifications.clearLastNotificationResponse();
      });
      tokens = notifications.addPushTokenListener(() => {
        if (userId) void syncPush(userId);
      });
    });
    return () => {
      cancelled = true;
      responses?.remove();
      tokens?.remove();
    };
  }, [userId]);

  // A tap that launched the app: wait until the session is known, then open it once.
  useEffect(() => {
    if (!PUSH_AVAILABLE || !ready || !userId) return;
    void import("expo-notifications").then((notifications: Notifications) => {
      const last = notifications.getLastNotificationResponse();
      const id = last?.notification.request.identifier ?? null;
      if (!last || id === handledRef.current) return;
      handledRef.current = id;
      openRef.current(last.notification.request.content.data);
      notifications.clearLastNotificationResponse();
    });
  }, [ready, userId]);

  useEffect(() => {
    if (userId) void syncPush(userId);
  }, [userId]);

  return null;
}
