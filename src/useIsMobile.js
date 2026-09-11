// Phone-width detection for the planner shell. One breakpoint, matchMedia-driven,
// SSR-safe. Kept in its own file so pages can adopt it without touching shared.js.
import { useEffect, useState } from "react";

export const MOBILE_MAX_WIDTH = 820;

export default function useIsMobile(maxWidth = MOBILE_MAX_WIDTH) {
  const q = `(max-width: ${maxWidth}px)`;
  const read = () => (typeof window !== "undefined" && typeof window.matchMedia === "function") ? window.matchMedia(q).matches : false;
  const [mobile, setMobile] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(q);
    const on = e => setMobile(e.matches);
    setMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener("change", on); else mq.removeListener(on); };
  }, [q]);
  return mobile;
}
