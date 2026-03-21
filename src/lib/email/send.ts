// ══════════════════════════════════════════════
// Email sender utility — uses Resend REST API
// ══════════════════════════════════════════════
// No SDK needed — just fetch() to api.resend.com
// Env: RESEND_API_KEY, RESEND_FROM (optional)

const RESEND_URL = "https://api.resend.com/emails";

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail({ to, subject, html, from }: SendEmailParams): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping email");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const sender = from || process.env.RESEND_FROM || "NitroSales <alertas@nitrosales.com>";
  const recipients = Array.isArray(to) ? to : [to];

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: recipients,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[email] Resend error:", res.status, err);
      return { ok: false, error: `Resend ${res.status}: ${err}` };
    }

    const data = await res.json();
    return { ok: true, id: data.id };
  } catch (error: any) {
    console.error("[email] Send failed:", error.message);
    return { ok: false, error: error.message };
  }
}
