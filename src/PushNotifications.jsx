import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY || "";
const STORAGE_KEY = "gh_push_subscribed";

// Convert a base64 VAPID key to a Uint8Array for the push API
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function usePushSubscription() {
  const { displayName, role } = useAuth();
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && !!VAPID_PUBLIC_KEY;
    setSupported(ok);
    if (localStorage.getItem(STORAGE_KEY) === "true") setSubscribed(true);
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported || loading) return false;
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setLoading(false);
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const subJson = sub.toJSON();

      // Save to Supabase
      const sb = getSupabase();
      if (sb) {
        await sb.from("push_subscriptions").upsert({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          worker_name: displayName || null,
          role: role || null,
        }, { onConflict: "endpoint" });
      }

      localStorage.setItem(STORAGE_KEY, "true");
      setSubscribed(true);
      setLoading(false);
      return true;
    } catch (err) {
      console.error("Push subscribe error:", err);
      setLoading(false);
      return false;
    }
  }, [supported, loading, displayName, role]);

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        const sb = getSupabase();
        if (sb) await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
      }
      localStorage.removeItem(STORAGE_KEY);
      setSubscribed(false);
    } catch (err) {
      console.error("Push unsubscribe error:", err);
    }
  }, []);

  return { supported, subscribed, subscribe, unsubscribe, loading };
}

// ── Banner Component ─────────────────────────────────────────────────────────
export function NotificationBanner() {
  const { supported, subscribed, subscribe, loading } = usePushSubscription();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("gh_push_banner_dismissed") === "true") setDismissed(true);
  }, []);

  if (!supported || subscribed || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem("gh_push_banner_dismissed", "true");
  };

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "#f0f7ec", border: "1px solid #c8e6b8",
      borderRadius: 8, padding: "8px 12px", margin: "0 0 10px 0",
      fontFamily: "'DM Sans','Segoe UI',sans-serif", fontSize: 13,
    }}>
      <span style={{ fontSize: 18 }}>&#128276;</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: "#1e2d1a" }}>Enable notifications</div>
        <div style={{ color: "#7a8c74", fontSize: 12 }}>
          Get alerts for new tasks and deliveries.
          {isIOS && " On iOS, add this app to your Home Screen first."}
        </div>
      </div>
      <button
        onClick={subscribe}
        disabled={loading}
        style={{
          background: "#7fb069", color: "#fff", border: "none",
          borderRadius: 6, padding: "6px 14px", fontWeight: 600,
          fontSize: 13, cursor: loading ? "wait" : "pointer",
          fontFamily: "'DM Sans',sans-serif",
        }}
      >
        {loading ? "..." : "Enable"}
      </button>
      <button
        onClick={dismiss}
        style={{
          background: "none", border: "none", color: "#7a8c74",
          fontSize: 18, cursor: "pointer", padding: "0 2px",
          lineHeight: 1,
        }}
        title="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}
