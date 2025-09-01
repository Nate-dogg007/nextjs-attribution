"use client";

type Digify = {
  visitor_id?: string;
  touches?: any[];
  visit_total_ms?: number;
};

function fromB64Url<T=any>(s?: string | null): T | null {
  if (!s) return null;
  try {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const b64 = s.replace(/-/g,"+").replace(/_/g,"/")+pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch { return null; }
}

export function useDigifyAttribution() {
  // read _digify cookie
  const cookieVal = typeof document !== "undefined"
    ? document.cookie.split("; ").find(c => c.startsWith("_digify="))?.split("=")[1]
    : undefined;
  const digify = fromB64Url<Digify>(cookieVal) || {};

  const out: Record<string,string> = {};
  if (digify.visitor_id) out["digify_visitor_id"] = digify.visitor_id;

  const touches = Array.isArray(digify.touches) ? digify.touches : [];
  if (touches.length) {
    out["touches_json"] = JSON.stringify(touches.slice(-10)); // cap
    const last = touches[touches.length - 1] || {};
    if (last.ch) out["latest_channel"] = String(last.ch);
    if (last.src) out["latest_source"]  = String(last.src);
    if (last.med) out["latest_medium"]  = String(last.med);
    if (typeof last.total_time_sec === "number") out["latest_total_time_sec"] = String(last.total_time_sec);
  }

  return out;
}
