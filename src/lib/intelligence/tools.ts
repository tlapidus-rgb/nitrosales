// ══════════════════════════════════════════════════════════════
// NitroSales Intelligence Engine — Tool Definitions
// ══════════════════════════════════════════════════════════════
// Cada tool es un "analizador" que Claude puede invocar para
// obtener datos específicos según la pregunta del usuario.
// En vez de cargar TODO de golpe, Claude pide solo lo que necesita.
// ══════════════════════════════════════════════════════════════

import type Anthropic from "@anthropic-ai/sdk";

export type ToolDefinition = Anthropic.Tool;

// ── Tool definitions for Claude API ──
export const INTELLIGENCE_TOOLS: ToolDefinition[] = [
  {
    name: "get_sales_overview",
    description:
      "Obtiene resumen de ventas de los últimos 30 días vs período anterior. Revenue, pedidos, ticket promedio, tendencia diaria, dispositivos, tasa de cancelación. Usar cuando pregunten: cómo van las ventas, cómo me fue, revenue, pedidos, ticket promedio, facturación.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Período en días (default 30)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_products_inventory",
    description:
      "Obtiene análisis completo de productos e inventario: top sellers, stock crítico (quiebre inminente), sobrestock, dead stock, análisis por marca y categoría. Usar cuando pregunten: productos, stock, inventario, marcas, categorías, qué reponer, qué se vende, qué no se vende, dead stock.",
    input_schema: {
      type: "object" as const,
      properties: {
        focus: {
          type: "string",
          enum: ["overview", "critical_stock", "dead_stock", "overstock", "brands", "categories", "search_product"],
          description: "Foco del análisis",
        },
        search_term: {
          type: "string",
          description: "Nombre de producto o marca a buscar (solo si focus=search_product)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_ads_performance",
    description:
      "Obtiene performance de publicidad: gasto, ROAS, CPA, CTR por plataforma (Meta/Google), campañas detalladas, campañas buenas vs malas. Usar cuando pregunten: publicidad, ads, campañas, ROAS, gasto, Meta, Google, CPA, CTR, presupuesto.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Período en días (default 30)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_traffic_funnel",
    description:
      "Obtiene datos de tráfico web (GA4) y funnel de conversión: sesiones, usuarios, bounce rate, fuentes de tráfico, funnel completo (visitantes > producto > carrito > checkout > compra), cuello de botella. Usar cuando pregunten: tráfico, visitas, conversión, funnel, fuentes, de dónde vienen, bounce rate.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Período en días (default 30)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_customers_ltv",
    description:
      "Obtiene análisis de clientes: total, recurrentes, LTV promedio, top clientes, segmentación RFM básica, predicciones LTV si existen. Usar cuando pregunten: clientes, LTV, recurrencia, fidelización, retención, quiénes son mis mejores clientes, clientes VIP.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_seo_performance",
    description:
      "Obtiene datos de SEO (Google Search Console): keywords principales, posiciones, clicks, impresiones, cambios de posición, oportunidades, canibalización. Usar cuando pregunten: SEO, Google, keywords, posiciones, orgánico, search console, tráfico orgánico.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Período en días (default 30)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_competitors_analysis",
    description:
      "Obtiene inteligencia competitiva: precios de competidores, comparación de precios, productos donde sos más caro/barato, ads de competidores. Usar cuando pregunten: competencia, competidores, precios competencia, qué hacen los demás.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_financial_pnl",
    description:
      "Obtiene estado financiero: P&L completo, revenue por canal (VTEX/ML), costos operativos, comisiones, margen neto, unit economics. Usar cuando pregunten: finanzas, P&L, margen, ganancia, costos, comisiones, estoy ganando plata, plata.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Período en días (default 30)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_mercadolibre_health",
    description:
      "Obtiene salud de MercadoLibre: publicaciones activas, reputación, preguntas sin responder, envíos, comisiones, métricas del seller. Usar cuando pregunten: MercadoLibre, ML, publicaciones, reputación, preguntas ML, comisiones ML.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_influencers_performance",
    description:
      "Obtiene performance del programa de influencers: revenue atribuido, top influencers, campañas activas, comisiones, contenido. Usar cuando pregunten: influencers, creators, embajadores, UGC, contenido de influencers.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];
