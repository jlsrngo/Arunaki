import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export async function sendDesktopNotification(title: string, body: string): Promise<boolean> {
  // 1. Try Tauri v2 native desktop notifications first (Windows WinRT toast)
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

  // 2. Fallback to HTML5 Notification API if running in browser
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
