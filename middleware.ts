import { NextRequest, NextResponse } from "next/server";

// ------- Config -------
const MAX_TOUCHES = 10;
const CLICK_IDS = [
  "gclid","wbraid","gbraid","msclkid","fbclid","ttclid","uetmsclkid",
  "li_fat_id","twclid"
] as const;

const SEARCH_ENGINES = [
  /(^|\.)google\./i, /(^|\.)bing\./i, /(^|\.)yahoo\./i, /(^|\.)duckduckgo\./i,
  /(^|\.)baidu\./i, /(^|\.)yandex\./i, /(^|\.)ecosia\./i, /(^|\.)ask\./i
];

const ASSET_EXTS = [
  ".js",".css",".map",".ico",".png",".jpg",".jpeg",".gif",".webp",".svg",".avif",
  ".woff",".woff2",".ttf",".otf",".eot",".txt",".xml",".json"
];
const IGNORE_PATH_PREFIXES = ["/_next/","/assets/","/static/"];
const VISIT_PAGE_LIMIT = 20;
const STEP_CAP_MS = 30 * 60 * 1000; // per-step cap 30 min

// ------- Helpers -------
const nowIso = () => new Date().toISOString();
const newId  = () => (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) as string;

function toB64Url(obj: any): string {
  const json = typeof obj === "string" ? obj : JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = ""; for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromB64Url<T=any>(s: string): T | null {
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
function readCookieJson<T=any>(req: NextRequest, name: string): T | null {
  const raw = req.cookies.get(name)?.value; if (!raw) return null;
  const b64 = fromB64Url<T>(raw); if (b64) return b64;
  let s = raw; for (let i=0;i<3;i++){ try { return JSON.parse(s); } catch {} try { s = decodeURIComponent(s); } catch { break; } }
  return null;
}
function readConsent(req: NextRequest) {
  const c = readCookieJson<any>(req, "consent_state") || {};
  const g = (k:string) => c?.[k] === "granted" || c?.[k] === true;
  return {
    analytics: g("analytics_storage"),
    ads: g("ad_storage") || g("ad_user_data") || g("ad_personalization"),
  };
}
function clampStepDeltaMs(prevISO?: string, nowISO?: string) {
  if (!prevISO || !nowISO) return 0;
  const prev = new Date(prevISO).getTime();
  const now  = new Date(nowISO).getTime();
  if (!Number.isFinite(prev) || !Number.isFinite(now) || now <= prev) return 0;
  return Math.min(now - prev, STEP_CAP_MS);
}
function isTrackablePath(pathname: string): boolean {
  if (IGNORE_PATH_PREFIXES.some(p => pathname.startsWith(p))) return false;
  if (ASSET_EXTS.some(ext => pathname.endsWith(ext))) return false;
  if (pathname === "/consent-shim.js") return false; // specifically ignore
  return true;
}
function platformFromClickId(url: URL): string | undefined {
  if (url.searchParams.get("gclid") || url.searchParams.get("gbraid") || url.searchParams.get("wbraid")) return "google";
  if (url.searchParams.get("msclkid") || url.searchParams.get("uetmsclkid")) return "bing";
  if (url.searchParams.get("fbclid")) return "facebook";
  if (url.searchParams.get("ttclid")) return "tiktok";
  if (url.searchParams.get("li_fat_id")) return "linkedin";
  if (url.searchParams.get("twclid")) return "twitter";
  return undefined;
}
function classify(url: URL, referrer: string | null, selfHost: string) {
  const qp = url.searchParams;
  const clickIdPresent =
    qp.has("gclid") || qp.has("gbraid") || qp.has("wbraid") ||
    qp.has("msclkid") || qp.has("uetmsclkid") ||
    qp.has("fbclid") || qp.has("ttclid") ||
    qp.has("li_fat_id") || qp.has("twclid");

  if (clickIdPresent) {
    return { ch: "paid", src: platformFromClickId(url) || "ad_platform", med: "cpc" };
  }

  const ref = referrer ? new URL(referrer) : null;
  const isSelf = ref && ref.hostname.replace(/^www\./, "") === selfHost.replace(/^www\./, "");
  if (!ref || isSelf) return { ch: "direct", src: "(direct)", med: "(none)" };

  const host = ref.hostname.replace(/^www\./, "").toLowerCase();
  const isSearch = SEARCH_ENGINES.some(rx => rx.test(ref.hostname));
  if (isSearch) {
    const engine = host.split(".")[0];
    return { ch: "organic", src: engine, med: "organic" };
  }
  if (host.includes("facebook.com")) return { ch: "organic", src: "facebook", med: "social" };
  if (host.includes("twitter.com") || host.includes("x.com")) return { ch: "organic", src: "twitter", med: "social" };
  if (host.includes("linkedin.com")) return { ch: "organic", src: "linkedin", med: "social" };
  if (host.includes("tiktok.com")) return { ch: "organic", src: "tiktok", med: "social" };

  return { ch: "referral", src: host, med: "referral" };
}

// ------- Middleware -------
export function middleware(req: NextRequest) {
  try {
    if (req.method !== "GET") return NextResponse.next();

    const url = new URL(req.url);
    const res = NextResponse.next();
    const selfHost = url.hostname.replace(/^www\./,"");

    // --- Session cookies
    const existingSession = readCookieJson<any>(req, "_digify_session") || {};
    const THIRTY_MIN = 30 * 60 * 1000;
    const now = Date.now();

    let sid: string = existingSession?.sid;
    let startedAt: string = existingSession?.startedAt;
    let lastAt: string = existingSession?.lastAt;

    const lastAtMs = lastAt ? new Date(lastAt).getTime() : NaN;
    const stale = !lastAt || Number.isNaN(lastAtMs) || now - lastAtMs > THIRTY_MIN;

    if (!sid || stale) { sid = newId(); startedAt = nowIso(); }
    lastAt = nowIso();

    res.cookies.set("_digify_session", toB64Url({ sid, startedAt, lastAt }), {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 30*60
    });
    res.cookies.set("_digify_sid", sid, {
      httpOnly: false, secure: true, sameSite: "lax", path: "/", maxAge: 30*60
    });

    // --- Attribution (all touches)
    const consent = readConsent(req);
    const persist = !!(consent.analytics || consent.ads);

    const existing = readCookieJson<any>(req, "_digify") || {};
    const touches: any[] = Array.isArray(existing.touches) ? existing.touches.slice() : [];

    const isDocument = req.headers.get("sec-fetch-dest") === "document";
    const isNavigate = req.headers.get("sec-fetch-mode") === "navigate" || req.headers.get("sec-fetch-user") === "?1";
    const isPrefetch = req.headers.get("purpose") === "prefetch" || req.headers.get("x-middleware-prefetch") === "1";

    if (isDocument && isNavigate && !isPrefetch && isTrackablePath(url.pathname)) {
      const base = classify(url, req.headers.get("referer"), selfHost);

      // ---- Visit accumulators (time + sequential pages)
      if (existing._visit_bound_sid !== sid) {
        existing._visit_bound_sid = sid;
        existing.visit_total_ms = 0;
        existing.visit_last_ts = undefined;
        existing.visit_pages = [];
      }

      const thisTsISO = nowIso();
      if (existing.visit_last_ts) {
        const stepMs = clampStepDeltaMs(existing.visit_last_ts, thisTsISO);
        existing.visit_total_ms = Math.min((existing.visit_total_ms || 0) + stepMs, 24 * 60 * 60 * 1000);
      }
      existing.visit_last_ts = thisTsISO;

      const pages: string[] = Array.isArray(existing.visit_pages) ? existing.visit_pages : [];
      if (pages[pages.length - 1] !== url.pathname) {
        pages.push(url.pathname);
        if (pages.length > VISIT_PAGE_LIMIT) pages.shift();
      }
      existing.visit_pages = pages;

      // Build touch (no query in lp)
      const touch: any = {
        ts: thisTsISO,
        lp: url.pathname,
        src: base.src,
        med: base.med,
        ch: base.ch,
        total_time_sec: Math.floor((existing.visit_total_ms || 0) / 1000),
        page_paths: existing.visit_pages, // sequential, allows revisits
      };

      // UTMs as metadata
      const utm_source   = url.searchParams.get("utm_source");
      const utm_medium   = url.searchParams.get("utm_medium");
      const utm_campaign = url.searchParams.get("utm_campaign");
      const utm_term     = url.searchParams.get("utm_term");
      const utm_content  = url.searchParams.get("utm_content");
      if (utm_source)   touch.utm_src  = utm_source;
      if (utm_medium)   touch.utm_med  = utm_medium;
      if (utm_campaign) touch.utm_cmp  = utm_campaign;
      if (utm_term)     touch.utm_term = utm_term;
      if (utm_content)  touch.utm_cnt  = utm_content;

      // Click IDs
      for (const k of CLICK_IDS) {
        const v = url.searchParams.get(k);
        if (v) touch[k] = v;
      }

      // De-dupe immediate redirects (<=2s, same attrs)
      const last = touches[touches.length - 1];
      const within2s = last ? (new Date(touch.ts).getTime() - new Date(last.ts).getTime()) < 2000 : false;
      const sameAttrs = last && last.lp === touch.lp && last.src === touch.src && last.med === touch.med && last.ch === touch.ch;

      if (!(sameAttrs && within2s)) {
        touches.push(touch);
        while (touches.length > MAX_TOUCHES) touches.shift();
      } else {
        last.total_time_sec = touch.total_time_sec;
        last.page_paths = touch.page_paths;
      }
    }

    const digify = {
      visitor_id: existing.visitor_id || newId(),
      touches,
      // internal visit state for SPA beacons
      _visit_bound_sid: existing._visit_bound_sid,
      visit_last_ts: existing.visit_last_ts,
      visit_total_ms: existing.visit_total_ms,
      visit_pages: existing.visit_pages,
    };

    res.cookies.set("_digify", toB64Url(digify), {
      httpOnly: false, secure: true, sameSite: "lax", path: "/",
      ...(persist ? { maxAge: 365*24*60*60 } : {})
    });

    res.headers.set("x-dfy-visitor", digify.visitor_id);
    res.headers.set("x-dfy-session", sid);

    return res;
  } catch (err) {
    console.error("[digify middleware] error:", err);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
