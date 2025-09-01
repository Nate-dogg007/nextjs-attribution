"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function DigifyRouteTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const payload = JSON.stringify({ pathname, ts: new Date().toISOString() });
    const url = "/api/digify/track";

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true })
        .catch(() => {});
    }
  }, [pathname]);

  return null;
}
