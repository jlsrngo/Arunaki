import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { apiFetch } from "./api";

export async function sendDesktopNotification(title: string, body: string): Promise<boolean> {
  // 1. Trigger Windows 10/11 Native WinRT Toast Notification via Engine (works in portable .exe too)
  try {
    const res = await apiFetch("/api/desktop/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    if (res.ok) {
      return true;
    }
  } catch (err) {
    console.debug("[notifications] Engine desktop notify fallback", err);
  }

  // 2. Fallback to Tauri v2 native desktop notifications
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
      return true;
    }
  } catch (err) {
    console.debug("[notifications] Tauri native notification fallback", err);
  }

  // 3. Fallback to HTML5 Notification API if running in browser
  if (typeof window !== "undefined" && "Notification" in window) {
    try {
      if (Notification.permission === "granted") {
        new Notification(title, { body });
        return true;
      }
      if (Notification.permission !== "denied") {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          new Notification(title, { body });
          return true;
        }
      }
    } catch (err) {
      console.debug("[notifications] HTML5 notification fallback failed", err);
    }
  }

  return false;
}
