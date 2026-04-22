// ══════════════════════════════════════════════
// Email sender utility — uses Resend REST API
// ══════════════════════════════════════════════
// No SDK needed — just fetch() to api.resend.com
// Env: RESEND_API_KEY, RESEND_FROM (optional)
//
// S55 BIS+2: CADA intento de envío queda registrado en email_log
// (to, subject, ok/fail, error, resendId, duración). Si la tabla
// no existe aún, el log falla silencioso sin afectar el envío.

const RESEND_URL = "https://api.resend.com/emails";

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  /** Identificador opcional de contexto (ej: "onboarding.activate", "debug.flow") */
  context?: string;
}

async function persistEmailLog(row: {
  toEmail: string;
  fromEmail: string;
  subject: string;
  htmlLength: number;
  ok: boolean;
  resendId?: string | null;
  errorMessage?: string | null;
  httpStatus?: number | null;
  durationMs: number;
  context?: string | null;
}): Promise<void> {
  try {
    const { prisma } = await import("@/lib/db/client");
    const { randomUUID } = await import("crypto");
    await prisma.$executeRawUnsafe(
      `INSERT INTO "email_log" (
        "id","toEmail","fromEmail","subject","htmlLength",
        "ok","resendId","errorMessage","httpStatus","durationMs","context","createdAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      randomUUID(),
      row.toEmail, row.fromEmail, row.subject, row.htmlLength,
      row.ok,
      row.resendId || null,
      row.errorMessage ? row.errorMessage.slice(0, 1000) : null,
      row.httpStatus || null,
      row.durationMs,
      row.context || null
    );
  } catch (err: any) {
    // Silencioso: si tabla no existe (migración pendiente) u otro error,
    // no romper el envío real. Loggear a console solo si es error distinto.
    const msg = String(err?.message || "");
    if (!msg.includes("email_log") && !msg.includes("relation") && !msg.includes("does not exist")) {
      console.warn("[email-log] persist failed:", msg);
    }
  }
}

export async function sendEmail({ to, subject, html, from, context }: SendEmailParams): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const startedAt = Date.now();
  const toEmail = Array.isArray(to) ? to.join(",") : to;
  const htmlLength = html?.length || 0;
  const sender = from || process.env.RESEND_FROM || "NitroSales <team@nitrosales.ai>";

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping email");
    await persistEmailLog({
      toEmail, fromEmail: sender, subject, htmlLength,
      ok: false, errorMessage: "RESEND_API_KEY not configured",
      durationMs: Date.now() - startedAt, context,
    });
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

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
      const errorMsg = `Resend ${res.status}: ${err}`;
      await persistEmailLog({
        toEmail, fromEmail: sender, subject, htmlLength,
        ok: false, errorMessage: errorMsg, httpStatus: res.status,
        durationMs: Date.now() - startedAt, context,
      });
      return { ok: false, error: errorMsg };
    }

    const data = await res.json();
    await persistEmailLog({
      toEmail, fromEmail: sender, subject, htmlLength,
      ok: true, resendId: data.id, httpStatus: res.status,
      durationMs: Date.now() - startedAt, context,
    });
    return { ok: true, id: data.id };
  } catch (error: any) {
    console.error("[email] Send failed:", error.message);
    await persistEmailLog({
      toEmail, fromEmail: sender, subject, htmlLength,
      ok: false, errorMessage: error.message,
      durationMs: Date.now() - startedAt, context,
    });
    return { ok: false, error: error.message };
  }
}
