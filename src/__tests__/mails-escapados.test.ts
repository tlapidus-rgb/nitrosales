import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ══════════════════════════════════════════════════════════════════════════
// Mails: lo que carga un cliente (o cualquiera, en el formulario público) va
// escapado en el HTML
// ══════════════════════════════════════════════════════════════════════════
// Un OWNER puede ponerle cualquier nombre a su organización, y el email de
// Facebook/Google que carga pasa la validación con `<a/href=…>` adentro. Esos
// datos iban crudos en los mails al staff: un link del atacante al lado del
// botón "Marcar como autorizado". Y el formulario público de onboarding manda
// la confirmación al email que se cargue, con nombre y empresa crudos: HTML de
// un tercero con nuestro remitente.
// ══════════════════════════════════════════════════════════════════════════

const ATAQUE = '<a href="//evil.example/x">Marcar</a>';
const EMAIL_ATAQUE = "<a/href=//evil.example/x>marcar</a>@x.co";

const m = vi.hoisted(() => ({ mails: [] as any[], session: null as any, orgName: "" }));

vi.mock("next-auth", () => ({ getServerSession: async () => m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => p }));
vi.mock("@/lib/email/send", () => ({ sendEmail: async (x: any) => { m.mails.push(x); return { ok: true }; } }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    organization: {
      findUnique: async () => ({ name: m.orgName, slug: "slug<i>", settings: {} }),
      update: async () => ({}),
    },
    user: { findUnique: async () => ({ id: "ckuser0000000000000000001", organizationId: "ckorg00000000000000000002", role: "OWNER" }) },
    connection: { findFirst: async () => null, create: async () => ({}), update: async () => ({}) },
    $queryRawUnsafe: async () => [{ id: "ckob00000000000000000001", status: "IN_WIZARD" }],
    $executeRawUnsafe: async () => 1,
  },
}));

import * as metaAuth from "@/app/api/me/meta-auth-request/route";
import * as googleAuth from "@/app/api/me/google-auth-request/route";
import * as submitWizard from "@/app/api/me/onboarding/submit-wizard/route";
import { onboardingConfirmationEmail } from "@/lib/onboarding/emails";
import { renderTemplateFromRow } from "@/lib/onboarding/template-renderer";

beforeEach(() => {
  m.mails = [];
  m.orgName = ATAQUE;
  m.session = { user: { id: "ckuser0000000000000000001", email: "owner@tienda.test", name: "<b>Nombre</b>", organizationId: "ckorg00000000000000000002" } };
});

function sinCrudo(html: string) {
  expect(html).not.toContain('<a href="//evil.example');
  expect(html).not.toContain("<a/href=");
  expect(html).not.toContain("<b>Nombre");
  expect(html).not.toContain("<i>");
}

describe.each([
  ["meta-auth-request", metaAuth, { fbEmail: EMAIL_ATAQUE }],
  ["google-auth-request", googleAuth, { googleEmail: EMAIL_ATAQUE }],
])("%s: mail al staff", (_n, ruta, body) => {
  it("EL CASO: nombre de org, nombre de usuario, slug y email cargados van escapados", async () => {
    const res = await ruta.POST(new Request("http://local/x", { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(200);
    expect(m.mails).toHaveLength(1);
    sinCrudo(m.mails[0].html);
    expect(m.mails[0].html).toContain("&lt;a href=");
  });
});

it("submit-wizard: el nombre de la org va escapado en el mail al staff", async () => {
  const res = await submitWizard.POST(new NextRequest("http://local/x", {
    method: "POST",
    body: JSON.stringify({
      platforms: [{ platform: "VTEX", credentials: { provider: "vtex", accountName: "tienda", appKey: `vtexappkey-${"x".repeat(25)}`, appToken: "y".repeat(60) } }],
    }),
  }));
  expect(res.status).toBe(200);
  const mail = m.mails.find((x) => String(x.context || "").includes("wizard"));
  expect(mail).toBeDefined();
  sinCrudo(mail.html);
});

describe("formulario público de onboarding", () => {
  it("la confirmación escapa nombre y empresa en el HTML, y el asunto queda en texto plano", () => {
    const { subject, html } = onboardingConfirmationEmail({ contactName: "<b>Nombre</b>", companyName: ATAQUE, statusToken: "t" });
    sinCrudo(html);
    expect(subject).toContain(ATAQUE);
    expect(html).toContain("<title>Postulación recibida — &lt;a href=");
  });

  it("la plantilla editable también", () => {
    const fila = {
      templateKey: "onboarding_confirmation",
      label: "x",
      subject: "Recibida — {companyName}",
      preheader: "De {companyName}",
      eyebrow: "{companyName}",
      heroTop: "{greeting}",
      heroAccent: "{companyName}",
      subParagraphs: ["La postulación de {companyName} ({contactName})."],
      ctaLabel: "Ver {companyName}",
      finePrint: "{companyName}",
    } as any;
    const { subject, html } = renderTemplateFromRow(fila, { contactName: "<b>Nombre</b>", companyName: ATAQUE });
    sinCrudo(html);
    expect(subject).toBe(`Recibida — ${ATAQUE}`);
  });
});
