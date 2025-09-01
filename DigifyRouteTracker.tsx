// /components/DigifyRouteTracker.tsx
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function DigifyRouteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    navigator.sendBeacon?.(
      "/api/_digify-beacon",
      JSON.stringify({ pathname, ts: Date.now() })
    );
  }, [pathname]);
  return null;
}
