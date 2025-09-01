# Digify – Next.js Attribution (Privacy-first)

Multi-touch attribution for Next.js (App Router).  
Tracks per-visit **channel/source/medium**, **UTMs & click IDs**, **sequential pages**, and **time on site** — stored in a single `_digify` cookie (base64url JSON).  
Session cookies are essential; cross-day persistence is enabled **only after consent**.

**CRM payload**: `visitor_id` + `touches_json` (+ optional `latest_*` convenience fields).

---

## 📦 Included files (already in this repo)

You don’t need to copy their contents here — keep them as-is:

/middleware.ts
/components/DigifyRouteTracker.tsx
/app/api/digify/track/route.ts
/hooks/useDigifyAttribution.ts

You will paste **small snippets** into:

app/layout.tsx
app/contact/ContactPageClient.tsx (or your form component)
app/api/contact/route.ts


---

## 1) Mount the Route Tracker in `app/layout.tsx`

Add the tracker so SPA navigation + time-on-site get captured between full page loads.

```tsx
// app/layout.tsx
import DigifyRouteTracker from "@/components/DigifyRouteTracker";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>// keep your existing <Script> tags, consent, GTM, etc.</head>
      <body>
        // Digify: track SPA route changes + time-on-site
        <DigifyRouteTracker />

        // your existing layout
        <div className="flex min-h-screen flex-col">
          // <Header />
          <main className="flex-grow">{children}</main>
          // <Footer />
        </div>
      </body>
    </html>
  );
}


Mount once inside <body>.
