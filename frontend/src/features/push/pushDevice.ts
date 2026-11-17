import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { ApiError, apiRequest } from "@/lib/api";
import { PUSH_CHANNEL_ID, pushSupported } from "./pushRules";

/**
 * This phone's side of push notifications: asking permission, getting the Firebase token and telling the server about
 * it (and, when the person signs out or switches it off, taking it back). Nothing here runs unless the build has a
 * Firebase file (app.config.ts sets `extra.pushEnabled`), and the notifications module is loaded only then.
 *
 * The switch is per account on this phone (`lenadena.push.on.<user id>`): signing in as someone else never turns it on
 * for them. The token last registered is kept so sign-out can remove exactly that one.
 */

/** Whether this build can receive pushes at all. False in Expo Go, on iOS and on web, so the Settings card is hidden. */
export const PUSH_AVAILABLE = pushSupported({
  platform: Platform.OS,
  enabledInBuild: (Constants.expoConfig?.extra as { pushEnabled?: unknown } | undefined)?.pushEnabled,
});

const tokenKey = "lenadena.push.token";
const preferenceKey = (userId: string) => `lenadena.push.on.${userId}`;

type Notifications = typeof import("expo-notifications");
const loadNotifications = (): Promise<Notifications> => import("expo-notifications");

export async function isPushOn(userId: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(preferenceKey(userId))) === "1";
  } catch {
    return false;
  }
}

async function ensureChannel(notifications: Notifications) {
  await notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: "Reminders from friends",
    description: "Reminders to settle up, and invitations to groups.",
    importance: notifications.AndroidImportance.HIGH,
  });
}

/** Gets this phone's current token and gives it to the server. The server keeps one row per token, so repeating is harmless. */
async function registerCurrentToken(notifications: Notifications): Promise<void> {
  const device = await notifications.getDevicePushTokenAsync();
  const token = typeof device.data === "string" ? device.data : "";
  if (!token) throw new Error("This phone didn't give a notification token.");
  await apiRequest("/v1/me/push-token", { method: "POST", body: { token, platform: "android" } });
  await SecureStore.setItemAsync(tokenKey, token);
}

export type EnablePushResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "denied" | "server" | "error"; error?: unknown };

/** Switch on: asks the phone for permission, then registers it. Only called from the person's own tap in Settings. */
export async function enablePush(userId: string): Promise<EnablePushResult> {
  if (!PUSH_AVAILABLE) return { ok: false, reason: "unavailable" };
  try {
    const notifications = await loadNotifications();
    await ensureChannel(notifications);
    let { status } = await notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await notifications.requestPermissionsAsync());
    if (status !== "granted") return { ok: false, reason: "denied" };
    await registerCurrentToken(notifications);
    await SecureStore.setItemAsync(preferenceKey(userId), "1");
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.code === "push_unavailable") return { ok: false, reason: "server", error };
    return { ok: false, reason: "error", error };
  }
}

/** Switch off: the server forgets this phone, the token is retired, and the switch stays off until the person turns it on. */
export async function disablePush(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(preferenceKey(userId)).catch(() => undefined);
  await forgetThisDevice();
  try {
    // A new token will be made if the switch is ever turned on again, so an old one cannot be reused.
    await (await loadNotifications()).unregisterForNotificationsAsync();
  } catch {
    // Not fatal: the server no longer has the token either way.
  }
}

/** Takes this phone's token off the signed-in account. Called before signing out, while the session still works. */
export async function forgetThisDevice(): Promise<void> {
  let token: string | null = null;
  try {
    token = await SecureStore.getItemAsync(tokenKey);
  } catch {
    return;
  }
  if (!token) return;
  try {
    await apiRequest("/v1/me/push-token/remove", { method: "POST", body: { token } });
  } catch {
    // Offline: the server also drops tokens Firebase reports as dead, and the next account to sign in here takes this token over.
  }
  await SecureStore.deleteItemAsync(tokenKey).catch(() => undefined);
}

/**
 * On sign-in and app start, for an account that switched it on: makes sure the server has this phone's current token
 * (Firebase rotates tokens now and then). Quiet: it never asks for permission and never shows an error.
 */
export async function syncPush(userId: string): Promise<void> {
  if (!PUSH_AVAILABLE || !(await isPushOn(userId))) return;
  try {
    const notifications = await loadNotifications();
    if ((await notifications.getPermissionsAsync()).status !== "granted") return;
    await ensureChannel(notifications);
    await registerCurrentToken(notifications);
  } catch {
    // Try again next time the app starts.
  }
}

/** For the Settings text: permission was refused in the phone's own settings, so the switch cannot work until it is allowed there. */
export async function pushPermissionDenied(): Promise<boolean> {
  if (!PUSH_AVAILABLE) return false;
  try {
    const { status, canAskAgain } = await (await loadNotifications()).getPermissionsAsync();
    return status === "denied" && !canAskAgain;
  } catch {
    return false;
  }
}
