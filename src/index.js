import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Debug: surface the actual reason behind "[object Object]" overlay errors
window.addEventListener("unhandledrejection", (e) => {
  console.error("🔴 Unhandled rejection:", e.reason);
  if (e.reason && typeof e.reason === "object") {
    try { console.error("Reason JSON:", JSON.stringify(e.reason, null, 2)); } catch {}
    console.error("Stack:", e.reason.stack || "(no stack)");
  }
});
window.addEventListener("error", (e) => {
  console.error("🔴 Window error:", e.message, "at", e.filename + ":" + e.lineno, "error:", e.error);
});

// Register push notification service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
