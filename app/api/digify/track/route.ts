import { NextRequest, NextResponse } from "next/server";

const VISIT_PAGE_LIMIT = 20;
const STEP_CAP_MS = 30 * 60 * 1000;

const nowIso = () => new Date().toISOString();
const toB64Url = (obj: any) => {
  const json = typeof obj === "string" ? obj : JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = ""; for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
const fromB64Url = <T=any,>(s?: string | null): T | null => {
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
};
const clampStepDeltaMs = (prevISO?: string, nowISO?: string) => {
  if (!prevISO || !nowISO) return 0;
  const prev = new Date(prevISO).getTime();
  const now  = new Date(nowISO).getTime();
  if (!Number.isFinite(prev) || !Number.isFinite(now) || now <= prev) return 0;
  return Math.min(now - prev, STEP_CAP_MS);
};

export async function POST(req: NextRequest) {
  try {
    const { pathname, ts } = await req.json().catch(() => ({}));
    if (!pathname || typeof pathname !== "string") {
      return NextResponse.json({ ok: false, error: "missing pathname" }, { status: 400 });
    }

    const digifyRaw = req.cookies.get("_digify")?.value ?? null;
    const sessionId = req.cookies.get("_digify_sid")?.value ?? null;
    const digify = fromB64Url<any>(digifyRaw) || {};

    // reset if session changed
    if (digify._visit_bound_sid !== sessionId) {
      digify._visit_bound_sid = sessionId;
      digify.visit_total_ms = 0;
      digify.visit_last_ts = undefined;
      digify.visit_pages = [];
    }

    const thisTsISO = ts || nowIso();
    if (digify.visit_last_ts) {
      const stepMs = clampStepDeltaMs(digify.visit_last_ts, thisTsISO);
      digify.visit_total_ms = Math.min((digify.visit_total_ms || 0) + stepMs, 24 * 60 * 60 * 1000);
    }
    digify.visit_last_ts = thisTsISO;

    // sequential pages (allow repeats, bounded)
    const pages: string[] = Array.isArray(digify.visit_pages) ? digify.visit_pages : [];
    if (pages[pages.length - 1] !== pathname) {
      pages.push(pathname);
      if (pages.length > VISIT_PAGE_LIMIT) pages.shift();
    }
    digify.visit_pages = pages;

    // mirror onto last touch so forms see it
    if (Array.isArray(digify.touches) && digify.touches.length) {
      const t = digify.touches[digify.touches.length - 1];
      t.total_time_sec = Math.floor((digify.visit_total_ms || 0) / 1000);
      t.page_paths = digify.visit_pages;
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set("_digify", toB64Url(digify), {
      httpOnly: false, secure: true, sameSite: "lax", path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
}
