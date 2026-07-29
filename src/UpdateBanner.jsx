// UpdateBanner — ends the "hard refresh Safari" era. The running app knows its own
// bundle fingerprint (the hash in its <script src="/static/js/main.<hash>.js">); we
// poll the site's tiny index.html with cache bypassed and compare. When production
// points at a newer bundle:
//   · phone was away >20 min and nobody's mid-typing → reload seamlessly (morning
//     pickup on the floor just IS the new version)
//   · otherwise → a green "tap to update" banner; one tap reloads
// Floor-code sessions live in localStorage (12h), so a reload never logs anyone out.
// Dev server has no hashed main.js → the whole thing disables itself.
import { useEffect, useState } from "react";

const runningHash = () => {
  const s = document.querySelector('script[src*="/static/js/main."]');
  const m = s && s.src.match(/main\.([a-f0-9]+)\.js/);
  return m ? m[1] : null;
};

async function liveHash() {
  try {
    const r = await fetch("/?v=" + Date.now(), { cache: "no-store" });
    const m = (await r.text()).match(/main\.([a-f0-9]+)\.js/);
    return m ? m[1] : null;
  } catch { return null; }   // offline — try again next tick
}

export default function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const mine = runningHash();
    if (!mine) return;
    let hiddenAt = 0;
    const check = async (autoReload) => {
      const live = await liveHash();
      if (!live || live === mine) return;
      const typing = /input|textarea|select/i.test(document.activeElement?.tagName || "");
      if (autoReload && !typing) { window.location.reload(); return; }
      setStale(true);
    };
    const iv = setInterval(() => check(false), 5 * 60 * 1000);
    const onVis = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      const awayMs = hiddenAt ? Date.now() - hiddenAt : 0;
      check(awayMs > 20 * 60 * 1000);   // long time away → silent refresh
    };
    document.addEventListener("visibilitychange", onVis);
    check(false);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  if (!stale) return null;
  return (
    <button onClick={() => window.location.reload()}
      style={{ position: "fixed", left: "50%", bottom: 18, transform: "translateX(-50%)", zIndex: 99999,
        display: "flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 999,
        border: "none", background: "#1e2d1a", color: "#c8e6b8", fontSize: 14, fontWeight: 800,
        fontFamily: "'DM Sans','Segoe UI',sans-serif", cursor: "pointer",
        boxShadow: "0 8px 28px rgba(20,30,16,.45)" }}>
      🔄 A new version is ready — tap to update
    </button>
  );
}
