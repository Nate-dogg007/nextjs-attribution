# Digify – Next.js Attribution (Privacy-first)

Multi-touch attribution for Next.js (App Router).  
Tracks per-visit **channel/source/medium**, **UTMs & click IDs**, **sequential pages**, and **time on site** — stored in a single `_digify` cookie (base64url JSON).  
Session cookies are essential; cross-day persistence is enabled **only after consent**.

**CRM payload**: `visitor_id` + `touches_json` (+ optional `latest_*` convenience fields).

---

## 📦 Included files (already in this repo)

These files are already provided, you don’t need to copy them into your README:

- `/middleware.ts`
- `/components/DigifyRouteTracker.tsx`
- `/app/api/digify/track/route.ts`
- `/hooks/useDigifyAttribution.ts`

You only need to add small snippets into:

- `app/layout.tsx`
- `app/contact/ContactPageClient.tsx` (your form)
- `app/api/contact/route.ts`

---

## 1) Mount the Route Tracker in `app/layout.tsx`

Add the tracker so SPA navigation + time-on-site get captured between full page loads.

```tsx
// app/layout.tsx
import DigifyRouteTracker from "@/components/DigifyRouteTracker";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>{/* keep your existing <Script> tags, consent, GTM, etc. */}</head>
      <body>
        {/* Digify: track SPA route changes + time-on-site */}
        <DigifyRouteTracker />

        {/* your existing layout */}
        <div className="flex min-h-screen flex-col">
          <main className="flex-grow">{children}</main>
        </div>
      </body>
    </html>
  );
}

```

Mount once inside <body>.

## 2) Beacon Endpoint (already included)

Keep this file as-is:

```
app/api/digify/track/route.ts
```
It receives beacons from DigifyRouteTracker and updates _digify with:

time on site for the visit

sequential page paths visited this session

3) Use Attribution in your Contact Form (client)

In your client form (e.g. app/contact/ContactPageClient.tsx), import the hook and include attrib in your POST body.


It receives beacons from DigifyRouteTracker and updates `_digify` with:

- time on site for the visit  
- sequential page paths  

---

## 3) Use Attribution in Your Contact Form

In your form component (e.g. `app/contact/ContactPageClient.tsx`):

```tsx
// app/contact/ContactPageClient.tsx
import { useDigifyAttribution } from "@/hooks/useDigifyAttribution";

export default function ContactPageClient() {
  const attrib = useDigifyAttribution(); // { digify_visitor_id, touches_json, latest_* }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // ...your validation...
    await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, email, message, company, phone,
        attrib, // 👈 include attribution
      }),
    });
  }

  return (/* your form */);
}
```

## 4) Sanitize on the Server

In `app/api/contact/route.ts` add a sanitiser for the attribution object:

```
// app/api/contact/route.ts
import { NextResponse } from "next/server";

function sanitizeAttrib(attrib: any) {
  let touches: any[] = [];
  try {
    const parsed = attrib?.touches_json ? JSON.parse(attrib.touches_json) : [];
    if (Array.isArray(parsed)) touches = parsed.slice(-10); // cap at 10
  } catch {}
  return {
    digify_visitor_id: attrib?.digify_visitor_id ?? null,
    touches_json: JSON.stringify(touches),
    latest_channel: attrib?.latest_channel ?? null,
    latest_source: attrib?.latest_source ?? null,
    latest_medium: attrib?.latest_medium ?? null,
    latest_total_time_sec:
      attrib?.latest_total_time_sec != null ? Number(attrib.latest_total_time_sec) : null,
  };
}

export async function POST(req: Request) {
  const { name, email, message, company, phone, attrib } = await req.json();
  const safeAttrib = attrib ? sanitizeAttrib(attrib) : null;

  // include safeAttrib in your admin email, logs, or CRM push
  return NextResponse.json({ ok: true, delivered: true });
}
```

---

## 5) How It Works

### `middleware.ts`
- Sets `_digify_session` (HttpOnly, essential) and `_digify_sid` (JS mirror).  
- Classifies each real document navigation into a **touch**.  
- Adds **UTMs (metadata)** + **click IDs** (`gclid` / `fbclid` / etc).  
- Tracks **sequential pages** and **time on site**.  
- Writes `_digify` cookie (base64url JSON).  
- If **no consent** → session-only.  
- With **consent** → persists 1 year.  

### `DigifyRouteTracker.tsx` + `api/digify/track/route.ts`
- Handles **SPA route changes**.  
- Sends tiny beacons so **time and page paths** update without a full reload.  

### `useDigifyAttribution`
- Reads `_digify` on the client.  
- Returns a lean object for **form POSTs**.  

### `app/api/contact/route.ts`
- Sanitizes attribution data.  
- Forwards attribution alongside leads to your **CRM**.  

---

## 6) GDPR / Consent

- **Essential cookies**: `_digify_session`, `_digify_sid` → required for session continuity.  
- **Attribution cookie**: `_digify` → session-only until analytics/ads consent is granted.  
- Once granted, `_digify` persists for **1 year**.  
- No raw **PII** is stored in `_digify`.  

---

## 7) Quick Testing

Decode `_digify` in your browser console:

```js
function decodeB64Url(s){
  s = s.replace(/-/g,"+").replace(/_/g,"/");
  s += "=".repeat((4-(s.length%4))%4);
  return JSON.parse(atob(s));
}
const v = document.cookie.split("; ").find(c=>c.startsWith("_digify="))?.split("=")[1];
console.log(decodeB64Url(v));
```

Example output:

```
{
  "visitor_id": "1ff166f4-b674-46d5-9951-8939719191ce",
  "touches": [
    {
      "ts": "2025-09-01T19:55:05.535Z",
      "lp": "/",
      "src": "google",
      "med": "cpc",
      "ch": "paid",
      "gclid": "test",
      "total_time_sec": 31,
      "page_paths": ["/", "/contact", "/work/tracking-attribution", "/"]
    }
  ]
}
```

---

## 8) Fields to Send to CRM

**At minimum:**
- `digify_visitor_id`
- `touches_json`

**Optional convenience fields:**
- `latest_channel`
- `latest_source`
- `latest_medium`
- `latest_total_time_sec`

---

## 9) Troubleshooting

- **No pages recorded** → ensure `<DigifyRouteTracker />` is mounted in `app/layout.tsx`.  
- **Only first page shows** → check the Network tab for `POST /api/digify/track`.  
- **Not persisting across days** → verify `consent_state` cookie is being set by your CMP.  
- **Large cookie size** → reduce `MAX_TOUCHES` or `VISIT_PAGE_LIMIT` in `middleware.ts`.  

---

## ✅ Summary

- Built for **Next.js 13+ App Router**  
- No external analytics SDKs required  
- Works with **GTM**, **Cookiebot**, and **Consent Mode**  
- Ready to connect to your **CRM**  

---


