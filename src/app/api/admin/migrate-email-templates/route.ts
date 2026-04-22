// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/migrate-email-templates
// ══════════════════════════════════════════════════════════════
// Crea la tabla email_templates y la seedea con los 11 templates
// actuales del flujo de onboarding. Idempotente (safe to re-run).
//
// Tabla:
//   id            text pk
//   templateKey   text (lead_invite, onboarding_confirmation, etc)
//   variant       text (default, A, B, C, D)
//   label         text (nombre visible: "Invitación al lead")
//   flowStage     text (pipeline | onboarding)
//   stageOrder    int (orden en el timeline del flujo)
//   trigger       text (cuándo se envía — "Al cargar lead manual", etc)
//   subject       text
//   preheader     text
//   eyebrow       text (nullable — no todos lo tienen)
//   heroTop       text
//   heroAccent    text (nullable)
//   subParagraphs jsonb (array de strings para múltiples párrafos)
//   ctaLabel      text
//   finePrint     text (nullable)
//   isActive      bool (para variantes: solo 1 activa por templateKey)
//   updatedAt     timestamp
//   createdAt     timestamp
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const log: string[] = [];

    // 1. Crear tabla
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "email_templates" (
        "id" text PRIMARY KEY,
        "templateKey" text NOT NULL,
        "variant" text NOT NULL DEFAULT 'default',
        "label" text NOT NULL,
        "flowStage" text NOT NULL,
        "stageOrder" int NOT NULL DEFAULT 0,
        "trigger" text NOT NULL,
        "subject" text NOT NULL,
        "preheader" text DEFAULT '',
        "eyebrow" text,
        "heroTop" text,
        "heroAccent" text,
        "subParagraphs" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "ctaLabel" text,
        "finePrint" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "updatedAt" timestamp NOT NULL DEFAULT NOW(),
        "createdAt" timestamp NOT NULL DEFAULT NOW(),
        UNIQUE("templateKey", "variant")
      )
    `);
    log.push("✓ Tabla email_templates creada (o ya existia)");

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "email_templates_key_active_idx" ON "email_templates"("templateKey", "isActive")`
    );
    log.push("✓ Index key+isActive creado");

    // 2. Seed con templates actuales
    const templates = [
      // ────────── PIPELINE (pre-registro) ──────────
      {
        id: "lead_invite__A",
        templateKey: "lead_invite",
        variant: "A",
        label: "Invitación al lead — Profesional",
        flowStage: "pipeline",
        stageOrder: 1,
        trigger: "Cuando cargás un lead en /control/pipeline y marcás 'enviar invitación'",
        subject: "Tu acceso a NitroSales",
        preheader: "El equipo habilitó el acceso para {companyName}. Un formulario breve para activarlo.",
        eyebrow: "Invitación",
        heroTop: "Tu acceso a NitroSales",
        heroAccent: "está {listo}",
        subParagraphs: [
          "El equipo habilitó el ingreso para {companyName}. NitroSales es la plataforma de inteligencia comercial para ecommerce LATAM — atribución propia, P&L en tiempo real y un agente de IA que opera con vos.",
          "Para activar la cuenta, completá un formulario breve con los datos del negocio.",
        ],
        ctaLabel: "Comenzar configuración",
        finePrint: "Este enlace es personal y está asociado a {companyName}. Si no esperabas este email, podés ignorarlo — no se tomará ninguna acción.",
        isActive: true,
      },
      {
        id: "lead_invite__B",
        templateKey: "lead_invite",
        variant: "B",
        label: "Invitación al lead — Vuela a ciegas",
        flowStage: "pipeline",
        stageOrder: 1,
        trigger: "Cuando cargás un lead y marcás 'enviar invitación'",
        subject: "Tu acceso a NitroSales",
        preheader: "Hoy tu ecommerce opera a ciegas. Cambialo.",
        eyebrow: "⚡ Implementá AI commerce",
        heroTop: "Tu ecommerce",
        heroAccent: "vuela a ciegas.",
        subParagraphs: [
          "Campañas que no sabés si rinden, stock que no sabés qué rota, márgenes que no sabés dónde se escapan. Adentro se ve todo.",
        ],
        ctaLabel: "Activar {companyName}",
        finePrint: null,
        isActive: false,
      },
      {
        id: "lead_invite__C",
        templateKey: "lead_invite",
        variant: "C",
        label: "Invitación al lead — Dejá de decidir a ojo",
        flowStage: "pipeline",
        stageOrder: 1,
        trigger: "Cuando cargás un lead y marcás 'enviar invitación'",
        subject: "Tu acceso a NitroSales",
        preheader: "Cada campaña, cada producto, cada peso — con data en tiempo real.",
        eyebrow: "⚡ Implementá AI commerce",
        heroTop: "Dejá de decidir",
        heroAccent: "a ojo.",
        subParagraphs: [
          "Cada campaña, cada producto, cada peso — con la data real en tus manos, en tiempo real. Así opera el ecommerce top de LATAM.",
        ],
        ctaLabel: "Activar {companyName}",
        finePrint: null,
        isActive: false,
      },
      {
        id: "lead_invite__D",
        templateKey: "lead_invite",
        variant: "D",
        label: "Invitación al lead — Operado por IA",
        flowStage: "pipeline",
        stageOrder: 1,
        trigger: "Cuando cargás un lead y marcás 'enviar invitación'",
        subject: "Tu acceso a NitroSales",
        preheader: "Sin dashboards. Sin excel. Sin dudas. Tu ecommerce operado por IA.",
        eyebrow: "⚡ Implementá AI commerce",
        heroTop: "Tu ecommerce,",
        heroAccent: "operado por IA.",
        subParagraphs: [
          "Sin dashboards. Sin excel. Sin dudas. NitroSales conecta tus plataformas y te dice qué hacer en cada momento.",
        ],
        ctaLabel: "Activar {companyName}",
        finePrint: null,
        isActive: false,
      },
      {
        id: "lead_followup__default",
        templateKey: "lead_followup",
        variant: "default",
        label: "Recordatorio — Lead no respondió",
        flowStage: "pipeline",
        stageOrder: 2,
        trigger: "Cuando tocás 'Reenviar / followup' en un lead que no respondió",
        subject: "Recordatorio de tu acceso a NitroSales",
        preheader: "El acceso para sumar a {companyName} sigue disponible.",
        eyebrow: "Recordatorio",
        heroTop: "Hola {contactName}",
        heroAccent: null,
        subParagraphs: [
          "El acceso para sumar a {companyName} a NitroSales sigue disponible. Te dejamos nuevamente el link por si se perdió en el mail anterior.",
        ],
        ctaLabel: "Empezar onboarding",
        finePrint: "Si hay algo que no quedó claro o preferís charlar antes, respondé este email.",
        isActive: true,
      },
      // ────────── ONBOARDING (post-postulación) ──────────
      {
        id: "onboarding_confirmation__default",
        templateKey: "onboarding_confirmation",
        variant: "default",
        label: "Postulación recibida",
        flowStage: "onboarding",
        stageOrder: 1,
        trigger: "Automático cuando el lead completa el form /onboarding",
        subject: "Postulación recibida — {companyName}",
        preheader: "La postulación de {companyName} fue recibida y está en revisión.",
        eyebrow: "✓ Postulación recibida",
        heroTop: "Hola {contactName}",
        heroAccent: null,
        subParagraphs: [
          "La postulación de {companyName} fue recibida. El equipo de NitroSales la está revisando.",
          "Qué pasa ahora: el equipo revisa los datos del negocio. Después llega un email con las credenciales de acceso al producto. Adentro de NitroSales se conectan las plataformas y arranca la sincronización.",
        ],
        ctaLabel: null,
        finePrint: "Si surge alguna pregunta, respondé este email y el equipo te contesta.",
        isActive: true,
      },
      {
        id: "onboarding_needs_info__default",
        templateKey: "onboarding_needs_info",
        variant: "default",
        label: "Falta info para activar",
        flowStage: "onboarding",
        stageOrder: 2,
        trigger: "Cuando el admin marca 'Necesita info' en el drawer del onboarding",
        subject: "Falta un dato para activar {companyName}",
        preheader: "Para completar la activación de {companyName} falta confirmar algunos datos.",
        eyebrow: "⏸ Pausado — Falta info",
        heroTop: "Hola {contactName}",
        heroAccent: null,
        subParagraphs: [
          "Para completar la activación de {companyName}, el equipo de NitroSales necesita confirmar algunos datos. Te mandamos este email porque hay campos pendientes en tu solicitud.",
        ],
        ctaLabel: "Actualizar solicitud",
        finePrint: null,
        isActive: true,
      },
      // NOTA: "onboarding_activation" queda hardcoded (tiene bloques especiales de
      // credenciales + NitroPixel que no se pueden representar genéricamente).
      // Para editarlo hace falta tocar código en emails.ts.
      {
        id: "backfill_started__default",
        templateKey: "backfill_started",
        variant: "default",
        label: "Arrancó la sincronización",
        flowStage: "onboarding",
        stageOrder: 4,
        trigger: "Cuando el admin aprueba el backfill (botón 'Aprobar backfill')",
        subject: "Sincronización iniciada — {companyName}",
        preheader: "La sincronización de la data histórica de {companyName} arrancó.",
        eyebrow: "Sincronización iniciada",
        heroTop: "Hola {contactName}",
        heroAccent: null,
        subParagraphs: [
          "La sincronización de la data histórica de {companyName} ya arrancó. Llega un email cuando termine.",
          "Mientras tanto se puede entrar al producto — el progreso se ve en vivo y la plataforma se desbloquea automáticamente al completarse.",
        ],
        ctaLabel: "Abrir NitroSales",
        finePrint: null,
        isActive: true,
      },
      {
        id: "data_ready__default",
        templateKey: "data_ready",
        variant: "default",
        label: "Data lista — Backfill completo",
        flowStage: "onboarding",
        stageOrder: 5,
        trigger: "Automático cuando el backfill termina de procesar todas las órdenes históricas",
        subject: "Data lista — {companyName}",
        preheader: "La sincronización de {companyName} terminó. La plataforma está completamente desbloqueada.",
        eyebrow: "✓ Data lista",
        heroTop: "Hola {contactName}",
        heroAccent: null,
        subParagraphs: [
          "La sincronización de {companyName} terminó. Toda la data histórica ya está procesada y la plataforma está completamente desbloqueada.",
          "Por dónde empezar: revisar ventas y métricas de los últimos 30 días, configurar la primera alerta para recibir avisos automáticos, hablar con Aurum, el asistente de NitroSales, para explorar la data.",
        ],
        ctaLabel: "Abrir NitroSales",
        finePrint: null,
        isActive: true,
      },
    ];

    let inserted = 0;
    let skipped = 0;
    for (const t of templates) {
      // No pisar ediciones existentes: solo insertar si no existe
      const exists = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT "id" FROM "email_templates" WHERE "templateKey" = $1 AND "variant" = $2 LIMIT 1`,
        t.templateKey, t.variant
      );
      if (exists.length > 0) {
        skipped++;
        continue;
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO "email_templates"
         ("id","templateKey","variant","label","flowStage","stageOrder","trigger","subject","preheader","eyebrow","heroTop","heroAccent","subParagraphs","ctaLabel","finePrint","isActive","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,NOW(),NOW())`,
        t.id, t.templateKey, t.variant, t.label, t.flowStage, t.stageOrder, t.trigger,
        t.subject, t.preheader, t.eyebrow, t.heroTop, t.heroAccent,
        JSON.stringify(t.subParagraphs), t.ctaLabel, t.finePrint, t.isActive
      );
      inserted++;
    }
    log.push(`✓ Seed: ${inserted} insertados, ${skipped} ya existian (preservando ediciones)`);

    return NextResponse.json({ ok: true, log });
  } catch (error: any) {
    console.error("[migrate-email-templates] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
