// @ts-nocheck
// POST /api/admin/vtex-configure-broadcaster?key=Y&orgSlug=teve
//   Configura el Orders Broadcaster en VTEX para la org dada.
//   La URL del hook apunta a nuestro webhook handler con ?org=<orgId>&key=NEXTAUTH_SECRET.
//   Filtros copiados de EMDJ (que funciona).
//
// DELETE /api/admin/vtex-configure-broadcaster?key=Y&orgSlug=teve
//   Borra la configuracion (rollback). VTEX vuelve a 404 al consultar.
//
// GET (sin metodo PUT/DELETE) /api/admin/vtex-configure-broadcaster?key=Y&orgSlug=teve&dryRun=1
//   Dry-run: arma el payload pero no lo envia. Solo lo devuelve para revision.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexConfig } from "@/lib/vtex-credentials";

export const dynamic = "force-dynamic";
const KEY = "nitrosales-secret-key-2024-production";

// Misma config que EMDJ tiene (verificado via GET /api/orders/hook/config)
const BROADCASTER_FILTER_STATUSES = [
  "order-created",
  "payment-approved",
  "handling",
  "invoiced",
  "canceled",
  "request-cancel",
];

async function buildPayload(orgId: string, host: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  // Usamos NEXTAUTH_SECRET como key (igual que vtex-sync-recent + EMDJ).
  // Es el guard que valida el webhook handler.
  const protocol = host.includes("localhost") ? "http" : "https";
  const hookUrl =
    `${protocol}://${host}/api/webhooks/vtex/orders` +
    `?key=${encodeURIComponent(secret || KEY)}` +
    `&org=${encodeURIComponent(orgId)}`;

  return {
    filter: {
      type: "FromWorkflow",
      status: BROADCASTER_FILTER_STATUSES,
    },
    hook: {
      url: hookUrl,
      headers: {},
    },
  };
}

async function resolveOrg(req: NextRequest) {
  const url = new URL(req.url);
  const orgSlug = url.searchParams.get("orgSlug") || url.searchParams.get("orgId");
  if (!orgSlug) throw new Error("orgSlug o orgId requerido");
  const org = await prisma.organization.findFirst({
    where: { OR: [{ id: orgSlug }, { slug: orgSlug }, { name: { contains: orgSlug, mode: "insensitive" } }] },
    select: { id: true, name: true, slug: true },
  });
  if (!org) throw new Error("org no encontrada");
  return org;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("key") !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const org = await resolveOrg(req);
    const host = req.headers.get("host") || "nitrosales.vercel.app";
    const payload = await buildPayload(org.id, host);
    return NextResponse.json({
      ok: true,
      dryRun: true,
      orgId: org.id,
      orgName: org.name,
      payload,
      note: "Para ejecutar: POST mismo endpoint. Para rollback: DELETE.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("key") !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const org = await resolveOrg(req);
    const host = req.headers.get("host") || "nitrosales.vercel.app";
    const payload = await buildPayload(org.id, host);

    const vtexConfig = await getVtexConfig(org.id);
    const account = vtexConfig.creds.accountName;

    // Capturar estado actual (backup)
    const beforeUrl = `https://${account}.vtexcommercestable.com.br/api/orders/hook/config`;
    const beforeRes = await fetch(beforeUrl, { headers: vtexConfig.headers, signal: AbortSignal.timeout(15000) });
    const beforeText = await beforeRes.text().catch(() => "");

    // POST nuevo config
    const postRes = await fetch(beforeUrl, {
      method: "POST",
      headers: { ...vtexConfig.headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const postStatus = postRes.status;
    const postText = await postRes.text().catch(() => "");

    // Verificar post-cambio
    const afterRes = await fetch(beforeUrl, { headers: vtexConfig.headers, signal: AbortSignal.timeout(15000) });
    const afterStatus = afterRes.status;
    const afterText = await afterRes.text().catch(() => "");
    let afterBody: any;
    try { afterBody = JSON.parse(afterText); } catch { afterBody = afterText.slice(0, 500); }

    return NextResponse.json({
      ok: postStatus >= 200 && postStatus < 300 && afterStatus === 200,
      orgName: org.name,
      vtexAccount: account,
      before: { status: beforeRes.status, body: beforeText.slice(0, 300) },
      postResponse: { status: postStatus, body: postText.slice(0, 300) },
      after: { status: afterStatus, body: afterBody },
      payloadSent: payload,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("key") !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const org = await resolveOrg(req);
    const vtexConfig = await getVtexConfig(org.id);
    const account = vtexConfig.creds.accountName;

    const delUrl = `https://${account}.vtexcommercestable.com.br/api/orders/hook/config`;
    const delRes = await fetch(delUrl, {
      method: "DELETE",
      headers: vtexConfig.headers,
      signal: AbortSignal.timeout(15000),
    });
    const delStatus = delRes.status;
    const delText = await delRes.text().catch(() => "");

    return NextResponse.json({
      ok: delStatus >= 200 && delStatus < 300,
      orgName: org.name,
      vtexAccount: account,
      deleteResponse: { status: delStatus, body: delText.slice(0, 300) },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
