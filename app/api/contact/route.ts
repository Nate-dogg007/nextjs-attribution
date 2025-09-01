import { NextResponse } from "next/server";
import { Resend } from "resend";

function sanitizeAttrib(attrib: any) {
  let touches: any[] = [];
  try {
    const parsed = attrib?.touches_json ? JSON.parse(attrib.touches_json) : [];
    if (Array.isArray(parsed)) touches = parsed.slice(-10);
  } catch {}
  return {
    digify_visitor_id: attrib?.digify_visitor_id || null,
    touches_json: JSON.stringify(touches),
    latest_channel: attrib?.latest_channel || null,
    latest_source: attrib?.latest_source || null,
    latest_medium: attrib?.latest_medium || null,
    latest_total_time_sec:
      attrib?.latest_total_time_sec != null ? Number(attrib.latest_total_time_sec) : null,
  };
}

export async function POST(req: Request) {
  try {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL;
    const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL;

    const body = await req.json();
    const { name, email, message, company, phone, attrib } = body || {};

    if (!name || !email || !message) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const safeAttrib = attrib ? sanitizeAttrib(attrib) : null;

    if (!RESEND_API_KEY || !CONTACT_TO_EMAIL || !CONTACT_FROM_EMAIL) {
      return NextResponse.json({
        ok: true,
        delivered: false,
        reason: "Email not configured",
        attrib: safeAttrib,
      });
    }

    const resend = new Resend(RESEND_API_KEY);

    const attribHtml = safeAttrib
      ? `
        <h3>Attribution</h3>
        <p><strong>Visitor ID:</strong> ${safeAttrib.digify_visitor_id || "-"}</p>
        <p><strong>Latest:</strong> ${[
          safeAttrib.latest_channel,
          safeAttrib.latest_source,
          safeAttrib.latest_medium,
        ].filter(Boolean).join(" / ") || "-"}</p>
        <p><strong>Latest time on site (sec):</strong> ${safeAttrib.latest_total_time_sec ?? "-"}</p>
        <pre style="white-space:pre-wrap;background:#f6f8fa;padding:8px;border-radius:6px;">${safeAttrib.touches_json}</pre>
      `
      : "";

    const { data, error } = await resend.emails.send({
      from: CONTACT_FROM_EMAIL,
      to: CONTACT_TO_EMAIL,
      replyTo: email,
      subject: `New contact form message from ${name}`,
      html: `
        <h2>New contact form message</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        ${company ? `<p><strong>Company:</strong> ${company}</p>` : ""}
        ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ""}
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${message}</p>
        ${attribHtml}
      `,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: "Failed to send email", details: error }, { status: 500 });
    }

    // (Later) forward safeAttrib + lead fields to Twenty CRM here

    return NextResponse.json({ ok: true, delivered: true, emailId: data?.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
