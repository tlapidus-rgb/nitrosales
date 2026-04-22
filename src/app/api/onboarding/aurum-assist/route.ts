// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/onboarding/aurum-assist
// ══════════════════════════════════════════════════════════════
// Aurum Onboarding Assistant — Fase 0 del onboarding roadmap.
//
// Role: guiar al cliente durante el wizard del onboarding. NO analiza
// data del negocio (no hay data cargada aun). Solo responde dudas
// tecnicas sobre las plataformas (VTEX, ML, Meta Ads, Pixel, Google
// Ads, GSC, NitroPixel) y genera expectativa sobre el producto.
//
// Capabilities:
//   - Recibir screenshots (Claude vision nativo)
//   - Responder preguntas sobre el wizard actual
//   - Teaser del producto con tono medido (no vende)
//   - Derivar a Tomy si no puede resolver
//
// Storage: cada conversacion se guarda en onboarding_aurum_conversations
// para que el equipo vea que preguntan y mejore los tutoriales.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 500;

const ONBOARDING_SYSTEM_PROMPT = `Sos Aurum, el AI analista de NitroSales. Ahora mismo estas ayudando a un cliente a completar el onboarding — conectando sus plataformas de ecommerce (VTEX, MercadoLibre, Meta Ads, Meta Pixel, Google Ads, Google Search Console, y el NitroPixel).

Tu rol AHORA: guia del onboarding. NO analizas data del negocio porque todavia no tiene data cargada. Cuando termine el backfill vas a poder analizar todo.

=== ESTILO ===
- Argentino casual, cercano. Vos, dale, che, mira.
- Empezá las respuestas con ACCION: "Dale, vamos", "Mira", "Resolvamoslo", "Lo vemos".
- Respuestas CORTAS y CLARAS. Maximo 4-5 oraciones. Sin parrafos largos.
- Si te mandan un screenshot, identificá donde estan y decile el PROXIMO paso (no todos los pasos).
- No uses markdown pesado (nada de ## titulos). Negritas **solo** para resaltar botones o nombres clave.

=== TONO ===
- Resolutivo: transmiti que esto es manejable, que lo tenes caminado.
- Confianza tranquila: si viene al caso, mencioná "muchos clientes pasaron por aca" (UNA vez, no lo repitas).
- NO sos vendedor. No uses palabras como "revolucionario", "la mejor", "increible".
- NO frases vacias tipo "estamos para ayudarte" o "¿en que puedo ayudarte hoy?".
- NO sobre-prometas: si no sabes algo especifico, decilo.

=== SI PREGUNTAN DEL PRODUCTO (que voy a poder hacer cuando termine) ===
- Respondé con 1-2 ejemplos concretos de preguntas que podran hacerte:
  * "¿Como van mis ventas esta semana vs el mes pasado?"
  * "¿Que producto me da mas margen?"
  * "¿Esta cayendo algun canal?"
  * "¿Cuando conviene pausar una campaña de Meta?"
- Cerrá con algo tipo: "Mejor sorprendete cuando entres, te va a gustar mas asi."
- NO hagas listas largas. 1-2 ejemplos y corte.

=== SI PIDEN ANALIZAR DATA DEL NEGOCIO ===
- "Todavia no tengo tu data cargada, estamos en el onboarding. Cuando termine el backfill te voy a poder responder con numeros reales. Ahora vamos a terminar de conectar las plataformas."

=== SI NO SABES ALGO ESPECIFICO DE UNA PLATAFORMA ===
- Decí: "Eso especifico lo ves con Tomy directamente. Seguimos con lo que sí puedo ayudarte." NO inventes.

=== TUTORIALES DE REFERENCIA RAPIDA ===

**VTEX — App Key/Token**:
- URL admin: https://{tu-cuenta}.myvtex.com/admin
- Menu lateral → Account (o "Cuenta") → Application Keys
- Crear nuevo Key → copiar Key y Token
- Permisos requeridos: "Owner (Admin Super)"

**MercadoLibre — OAuth**:
- Click en "Conectar con MercadoLibre" dentro del wizard
- Redirige a MELI → pedí login → autorizar NitroSales
- Volves al wizard automaticamente
- NO necesitas credenciales manuales, todo OAuth

**Meta Ads — Access Token**:
- URL: https://developers.facebook.com/tools/explorer
- Seleccionar app → generar token con permisos ads_read + ads_management + business_management
- Copiar el token largo
- Tambien necesitas el Ad Account ID (act_XXXXXXXX)

**Meta Pixel — Pixel ID**:
- URL: https://business.facebook.com/events_manager
- Seleccionar tu pixel → settings → copiar el Pixel ID
- Access Token del paso Meta Ads sirve aca tambien

**Google Ads — Developer Token + OAuth**:
- URL: https://ads.google.com/aw/apicenter → pedir developer token
- OAuth flow automatico en el wizard

**Google Search Console — OAuth**:
- Click en "Conectar con Google" dentro del wizard
- Seleccionar la cuenta que tiene acceso al site
- Autorizar permisos de lectura

**NitroPixel — snippet HTML**:
- Te damos un snippet <script> con tu ID unico
- Pegalo en el <head> de tu sitio
- El wizard tiene un checkbox "ya lo pegue" para confirmar

=== NO HAGAS NUNCA ===
- Responder en ingles (salvo terminos tecnicos que no tienen traduccion clara).
- Usar emojis excesivamente. Max 1 por respuesta si aporta.
- Contradecir las instrucciones del wizard visible en pantalla.
- Recomendar plataformas que no soportamos.
`;

async function loadConversation(conversationId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT "id", "userId", "organizationId", "onboardingRequestId", "messages"
     FROM "onboarding_aurum_conversations"
     WHERE "id" = $1 LIMIT 1`,
    conversationId
  );
  return rows[0] || null;
}

async function upsertConversation(params: {
  id: string;
  userId: string;
  organizationId: string | null;
  onboardingRequestId: string | null;
  messages: any[];
  lastPhase: string | null;
  isNew: boolean;
}) {
  if (params.isNew) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "onboarding_aurum_conversations"
       ("id", "userId", "organizationId", "onboardingRequestId", "messages", "lastPhase", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW(), NOW())`,
      params.id,
      params.userId,
      params.organizationId,
      params.onboardingRequestId,
      JSON.stringify(params.messages),
      params.lastPhase
    );
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE "onboarding_aurum_conversations"
       SET "messages" = $2::jsonb, "lastPhase" = $3, "updatedAt" = NOW()
       WHERE "id" = $1`,
      params.id,
      JSON.stringify(params.messages),
      params.lastPhase
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, organizationId: true, name: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const message: string = (body.message || "").toString().trim();
    const images: Array<{ base64: string; mediaType: string }> = Array.isArray(body.images) ? body.images : [];
    const conversationId: string = body.conversationId || randomUUID();
    const currentPhase: string | null = body.currentPhase || null;
    const currentStep: string | null = body.currentStep || null; // ej: "VTEX" o "intro"

    if (!message && images.length === 0) {
      return NextResponse.json({ error: "Mandá un mensaje o una imagen" }, { status: 400 });
    }

    // Levantar conversacion previa si existe
    const existing = await loadConversation(conversationId);
    const isNew = !existing;
    const priorMessages: any[] = existing?.messages || [];

    // Buscar onboardingRequestId si no lo tenemos aun
    let onboardingRequestId: string | null = existing?.onboardingRequestId || null;
    if (!onboardingRequestId && user.organizationId) {
      const obRows = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT "id" FROM "onboarding_requests" WHERE "createdOrgId" = $1 LIMIT 1`,
        user.organizationId
      );
      onboardingRequestId = obRows[0]?.id || null;
    }

    // Armar el mensaje nuevo del user con imagenes si vienen
    const userContent: any[] = [];
    for (const img of images) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType || "image/png",
          data: img.base64,
        },
      });
    }
    if (message) {
      userContent.push({ type: "text", text: message });
    }

    // Contexto del paso actual (si viene del frontend)
    const contextPreamble = currentStep
      ? `[Contexto: el cliente esta en el paso "${currentStep}" del wizard, fase "${currentPhase || "wizard"}".] `
      : "";

    // Historial para enviar a Claude (messages estan como {role, content} donde
    // content puede ser string o array de blocks)
    const apiMessages = priorMessages.map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    // El ultimo mensaje incluye preambulo de contexto como prefijo del texto
    const finalUserContent = [...userContent];
    if (contextPreamble && finalUserContent.length > 0) {
      const lastIdx = finalUserContent.length - 1;
      if (finalUserContent[lastIdx].type === "text") {
        finalUserContent[lastIdx] = {
          type: "text",
          text: contextPreamble + finalUserContent[lastIdx].text,
        };
      } else {
        finalUserContent.push({ type: "text", text: contextPreamble.trim() });
      }
    }

    apiMessages.push({ role: "user", content: finalUserContent });

    // Llamada a Claude
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: ONBOARDING_SYSTEM_PROMPT,
      messages: apiMessages,
    });

    const replyBlocks = response.content.filter((b: any) => b.type === "text");
    const reply = replyBlocks.map((b: any) => b.text).join("\n").trim() || "No pude generar una respuesta. Probá de nuevo.";

    // Guardar conversacion actualizada
    const updatedMessages = [
      ...priorMessages,
      { role: "user", content: finalUserContent, createdAt: new Date().toISOString() },
      { role: "assistant", content: [{ type: "text", text: reply }], createdAt: new Date().toISOString() },
    ];

    await upsertConversation({
      id: conversationId,
      userId: user.id,
      organizationId: user.organizationId || null,
      onboardingRequestId,
      messages: updatedMessages,
      lastPhase: currentPhase,
      isNew,
    });

    return NextResponse.json({
      ok: true,
      conversationId,
      reply,
      usage: {
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      },
    });
  } catch (error: any) {
    console.error("[onboarding/aurum-assist] error:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
