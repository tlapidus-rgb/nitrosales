// @ts-nocheck
"use client";

/**
 * /alertas/reglas — Fase 8e placeholder
 * ─────────────────────────────────────────────────────────────
 * Placeholder para la futura rules engine (Fase 8h).
 * Muestra estado "próximamente" con explicación de qué va a venir.
 */

import Link from "next/link";
import {
  Settings2,
  ArrowLeft,
  Bell,
  Mail,
  Zap,
  MessageCircle,
} from "lucide-react";

export default function AlertasReglasPage() {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100%",
        padding: "32px 40px",
        background: "#fafafa",
      }}
    >
      {/* Aurora */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(800px 400px at 80% -10%, rgba(244, 63, 94, 0.05), transparent 60%)," +
            "radial-gradient(700px 400px at 10% 110%, rgba(245, 158, 11, 0.04), transparent 60%)",
        }}
      />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 920 }}>
        <Link
          href="/alertas"
          style={{
            fontSize: 13,
            color: "#64748b",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            marginBottom: 20,
          }}
        >
          <ArrowLeft size={14} /> Volver a Alertas
        </Link>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 32 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "linear-gradient(135deg, #f43f5e, #f59e0b)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              flexShrink: 0,
            }}
          >
            <Settings2 size={22} />
          </div>
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#0f172a",
                margin: 0,
                marginBottom: 6,
              }}
            >
              Reglas personalizadas
            </h1>
            <div style={{ fontSize: 14, color: "#64748b", maxWidth: 640 }}>
              Acá vas a poder crear reglas del tipo{" "}
              <b style={{ color: "#0f172a" }}>"si pasa X, avisame por Y"</b>.
              Alcance: todos los módulos de NitroSales.
            </div>
          </div>
        </div>

        {/* Preview: qué vendrá */}
        <div
          style={{
            padding: 20,
            background: "white",
            borderRadius: 14,
            border: "1px solid rgba(15, 23, 42, 0.06)",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 14,
            }}
          >
            Cómo van a funcionar las reglas
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <RuleExample
              when="Runway baje de 3 meses"
              then="Email + in-app"
              module="Finanzas"
            />
            <RuleExample
              when="Stock de un SKU de ML sea menor a 5 unidades"
              then="In-app + WhatsApp"
              module="MercadoLibre"
            />
            <RuleExample
              when="Query larga de Aurum termine"
              then="Notificación in-app"
              module="Aurum"
            />
            <RuleExample
              when="Falten 3 días para vencimiento AFIP"
              then="Email"
              module="Fiscal"
            />
          </div>
        </div>

        {/* Canales */}
        <div
          style={{
            padding: 20,
            background: "white",
            borderRadius: 14,
            border: "1px solid rgba(15, 23, 42, 0.06)",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 14,
            }}
          >
            Canales de notificación
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <ChannelCard Icon={Bell} title="In-app" subtitle="Badge + inbox" available />
            <ChannelCard Icon={Mail} title="Email" subtitle="Via Resend" available />
            <ChannelCard Icon={MessageCircle} title="WhatsApp" subtitle="Próximamente" />
            <ChannelCard Icon={Zap} title="Push browser" subtitle="Próximamente" />
          </div>
        </div>

        {/* Estado */}
        <div
          style={{
            padding: 20,
            background:
              "linear-gradient(135deg, rgba(244, 63, 94, 0.04), rgba(245, 158, 11, 0.04))",
            border: "1px dashed rgba(244, 63, 94, 0.3)",
            borderRadius: 14,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#0f172a",
              marginBottom: 6,
            }}
          >
            En construcción
          </div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
            La rules engine se libera en la próxima fase. Por ahora podés marcar
            alertas como <b>favoritas</b> (quedan siempre primeras) y usar el
            sidebar del chat de <b>Aurum</b> con el botón 🔔 "Avisarme cuando
            termine" para queries largas.
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleExample({
  when,
  then,
  module,
}: {
  when: string;
  then: string;
  module: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: 12,
        background: "#fafafa",
        borderRadius: 10,
        fontSize: 13,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          padding: "2px 8px",
          borderRadius: 5,
          fontSize: 10,
          fontWeight: 600,
          background: "#e0e7ff",
          color: "#4338ca",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {module}
      </span>
      <span style={{ color: "#64748b" }}>Si</span>
      <b style={{ color: "#0f172a" }}>{when}</b>
      <span style={{ color: "#64748b" }}>→ Avisarme por</span>
      <b style={{ color: "#f43f5e" }}>{then}</b>
    </div>
  );
}

function ChannelCard({
  Icon,
  title,
  subtitle,
  available,
}: {
  Icon: any;
  title: string;
  subtitle: string;
  available?: boolean;
}) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        border: `1px solid ${available ? "rgba(16, 185, 129, 0.3)" : "rgba(15, 23, 42, 0.08)"}`,
        background: available ? "rgba(16, 185, 129, 0.04)" : "#fafafa",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: available ? "#10b981" : "#cbd5e1",
          color: "white",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={16} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: "#64748b" }}>{subtitle}</div>
      </div>
    </div>
  );
}
