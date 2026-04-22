// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// VTEX backfill processor
// ══════════════════════════════════════════════════════════════
// Procesa un chunk de órdenes historicas de VTEX dentro del rango
// {fromDate, toDate} del job, paginando con cursor {page}.
//
// Estrategia pragmatica: upsert MINIMO por order. Solo llenamos los
// campos criticos para dashboards (total, fecha, status, currency).
// Los items/customer se enriquecen despues con el sync incremental
// normal de VTEX cuando el cliente ya usa la plataforma.
//
// Ritmo: 20 paginas × 100 ordenes = ~2000 ordenes/chunk.
//
// LIMITE CRITICO DE VTEX: la API /api/oms/pvt/orders permite MAXIMO 30
// paginas por filtro de fecha (3000 ordenes max por consulta). Si pedis
// la pagina 31 devuelve "Max page exceed ( 30 ), refine filter".
//
// SOLUCION: paginacion por VENTANAS DE FECHA. Dividimos el rango total
// del job en ventanas chicas (7 dias) y paginamos hasta 30 dentro de
// cada ventana. Cuando una ventana se agota, mover a la anterior.
// Esto permite traer cualquier volumen historico sin chocar con el
// limite de VTEX.
//
// Cursor shape: { windowEnd: ISO, windowStart: ISO, page: int }
//   - windowEnd: limite superior de la ventana actual
//   - windowStart: limite inferior (windowEnd - WINDOW_DAYS)
//   - page: pagina actual dentro de la ventana
// Backwards compat: si cursor viene viejo (solo {page}), lo descartamos
// e inicializamos desde el final del rango (toDate del job).
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { decryptCredentials } from "@/lib/crypto";
import type { ChunkResult } from "../types";

const PAGES_PER_CHUNK = 20;
const PAGE_SIZE = 100;
const WINDOW_DAYS = 7; // ventana de 7 dias por iteracion (max 30 pag × 100 = 3000 ordenes/ventana)
const VTEX_PAGE_LIMIT = 30; // limite hardcoded de VTEX por consulta

interface VtexCreds {
  accountName: string;
  appKey: string;
  appToken: string;
}

async function getVtexCreds(orgId: string): Promise<VtexCreds | null> {
  const conn = await prisma.connection.findFirst({
    where: { organizationId: orgId, platform: "VTEX" },
    select: { credentials: true },
  });
  if (!conn) return null;
  const creds = conn.credentials as any;
  if (!creds) return null;
  if (typeof creds === "string") {
    try {
      const dec = decryptCredentials(creds);
      return dec as VtexCreds;
    } catch {
      return null;
    }
  }
  return creds as VtexCreds;
}

export async function processVtexChunk(job: any): Promise<ChunkResult> {
  const orgId = job.organizationId as string;
  const fromDate = new Date(job.fromDate); // limite mas viejo del rango (ej: hoy - 90 dias)
  const toDate = new Date(job.toDate);     // limite mas nuevo del rango (ej: hoy)

  const creds = await getVtexCreds(orgId);
  if (!creds || !creds.accountName) {
    return {
      itemsProcessed: 0,
      newCursor: job.cursor || {},
      isComplete: false,
      error: "VTEX credentials no configuradas",
    };
  }

  // ── Inicializar ventana actual desde cursor o desde el final del rango ──
  // Vamos de mas reciente a mas viejo (windowEnd se mueve hacia atras).
  const cursor = (job.cursor as any) || {};
  let windowEnd: Date;
  let windowStart: Date;
  let startPage: number;

  if (cursor.windowEnd && cursor.windowStart) {
    // Cursor nuevo (date-window): retomar donde quedo
    windowEnd = new Date(cursor.windowEnd);
    windowStart = new Date(cursor.windowStart);
    startPage = cursor.page || 1;
  } else {
    // Cursor viejo (solo {page}) o sin cursor: arrancar desde el final del rango
    windowEnd = new Date(toDate);
    windowStart = new Date(windowEnd);
    windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
    if (windowStart < fromDate) windowStart = new Date(fromDate);
    startPage = 1;
  }

  const baseUrl = `https://${creds.accountName}.vtexcommercestable.com.br/api/oms/pvt/orders`;
  const headers: Record<string, string> = {
    "X-VTEX-API-AppKey": creds.appKey,
    "X-VTEX-API-AppToken": creds.appToken,
    Accept: "application/json",
  };

  let totalProcessed = 0;
  let pagesRunInChunk = 0;
  let currentWindowEnd = windowEnd;
  let currentWindowStart = windowStart;
  let currentPage = startPage;
  let totalEstimate: number | undefined = job.totalEstimate ? Number(job.totalEstimate) : undefined;

  // Si es la primera vez (sin totalEstimate), pedir 1 query liviana al rango FULL
  // para obtener el total real del job (sirve para mostrar % de progreso correcto).
  // Es una sola request adicional al inicio. VTEX devuelve paging.total aunque solo
  // permita acceder a las primeras 30 paginas.
  if (!totalEstimate) {
    try {
      const totalUrl =
        `${baseUrl}?per_page=1&page=1` +
        `&f_creationDate=creationDate:[${fromDate.toISOString()}%20TO%20${toDate.toISOString()}]`;
      const totalRes = await fetch(totalUrl, { headers });
      if (totalRes.ok) {
        const totalData = await totalRes.json();
        const t = totalData?.paging?.total;
        if (typeof t === "number" && t > 0) {
          totalEstimate = t;
        }
      }
    } catch {
      // Ignorar errores aca — el backfill funciona igual sin totalEstimate
    }
  }

  // Loop principal: procesar paginas. Cuando una ventana se agota, mover a la anterior.
  for (let i = 0; i < PAGES_PER_CHUNK; i++) {
    // Si llegamos al limite de paginas de VTEX en esta ventana, mover a ventana anterior.
    if (currentPage > VTEX_PAGE_LIMIT) {
      // Mover ventana hacia atras
      const newEnd = new Date(currentWindowStart);
      const newStart = new Date(newEnd);
      newStart.setDate(newStart.getDate() - WINDOW_DAYS);
      if (newStart < fromDate) {
        currentWindowStart = new Date(fromDate);
      } else {
        currentWindowStart = newStart;
      }
      currentWindowEnd = newEnd;
      currentPage = 1;

      // Si la nueva ventana esta fuera del rango (windowEnd <= fromDate), terminamos
      if (currentWindowEnd <= fromDate) {
        return {
          itemsProcessed: totalProcessed,
          newCursor: {},
          isComplete: true,
          totalEstimate,
        };
      }
    }

    const fromStr = currentWindowStart.toISOString();
    const toStr = currentWindowEnd.toISOString();
    const url =
      `${baseUrl}?per_page=${PAGE_SIZE}&page=${currentPage}` +
      `&f_creationDate=creationDate:[${fromStr}%20TO%20${toStr}]` +
      `&orderBy=creationDate,desc`;

    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (err: any) {
      return {
        itemsProcessed: totalProcessed,
        newCursor: {
          windowStart: currentWindowStart.toISOString(),
          windowEnd: currentWindowEnd.toISOString(),
          page: currentPage,
        },
        isComplete: false,
        error: `fetch: ${err.message}`,
      };
    }

    if (res.status === 429) {
      // Rate limit — guardamos cursor y salimos. Proxima invocacion retoma.
      return {
        itemsProcessed: totalProcessed,
        newCursor: {
          windowStart: currentWindowStart.toISOString(),
          windowEnd: currentWindowEnd.toISOString(),
          page: currentPage,
        },
        isComplete: false,
      };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        itemsProcessed: totalProcessed,
        newCursor: {
          windowStart: currentWindowStart.toISOString(),
          windowEnd: currentWindowEnd.toISOString(),
          page: currentPage,
        },
        isComplete: false,
        error: `VTEX ${res.status}: ${errText.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    const list = data?.list || [];

    if (list.length === 0) {
      // Ventana actual agotada → mover a ventana anterior (mas vieja)
      // sin avanzar i (no consume del PAGES_PER_CHUNK por cambiar de ventana)
      const newEnd = new Date(currentWindowStart);
      const newStart = new Date(newEnd);
      newStart.setDate(newStart.getDate() - WINDOW_DAYS);
      const reachedEnd = newEnd <= fromDate;

      if (reachedEnd) {
        // Llegamos al inicio del rango total → backfill completo
        return {
          itemsProcessed: totalProcessed,
          newCursor: {},
          isComplete: true,
          totalEstimate,
        };
      }

      currentWindowEnd = newEnd;
      currentWindowStart = newStart < fromDate ? new Date(fromDate) : newStart;
      currentPage = 1;
      continue; // no incrementar pagesRunInChunk porque no procesamos data esta iter
    }

    // Procesar las ordenes de esta pagina
    for (const order of list) {
      try {
        await upsertVtexOrder(orgId, order);
        totalProcessed++;
      } catch (err: any) {
        console.warn(`[vtex-backfill] skip ${order.orderId}: ${err.message}`);
      }
    }

    pagesRunInChunk++;
    currentPage++;

    // Si la pagina trajo menos del page size, esta ventana se agoto
    if (list.length < PAGE_SIZE) {
      // Mover a ventana anterior
      const newEnd = new Date(currentWindowStart);
      const newStart = new Date(newEnd);
      newStart.setDate(newStart.getDate() - WINDOW_DAYS);
      const reachedEnd = newEnd <= fromDate;

      if (reachedEnd) {
        return {
          itemsProcessed: totalProcessed,
          newCursor: {},
          isComplete: true,
          totalEstimate,
        };
      }

      currentWindowEnd = newEnd;
      currentWindowStart = newStart < fromDate ? new Date(fromDate) : newStart;
      currentPage = 1;
    }
  }

  // Salimos del loop por agotar PAGES_PER_CHUNK — guardar cursor para la proxima
  return {
    itemsProcessed: totalProcessed,
    newCursor: {
      windowStart: currentWindowStart.toISOString(),
      windowEnd: currentWindowEnd.toISOString(),
      page: currentPage,
    },
    isComplete: false,
    totalEstimate,
  };
}

async function upsertVtexOrder(orgId: string, vtexOrder: any) {
  const externalId = vtexOrder.orderId;
  if (!externalId) return;

  const orderDate = vtexOrder.creationDate ? new Date(vtexOrder.creationDate) : new Date();
  const totalValue = Number(vtexOrder.totalValue || 0) / 100;
  const itemCount = Array.isArray(vtexOrder.items)
    ? vtexOrder.items.length
    : Number(vtexOrder.totalQuantity || 0);

  const statusMap: Record<string, string> = {
    "payment-pending": "PENDING",
    "payment-approved": "APPROVED",
    "payment-received": "APPROVED",
    ready: "APPROVED",
    "ready-for-handling": "APPROVED",
    handling: "APPROVED",
    invoiced: "INVOICED",
    shipped: "SHIPPED",
    delivered: "DELIVERED",
    canceled: "CANCELLED",
    cancelled: "CANCELLED",
  };
  const status = (statusMap[String(vtexOrder.status || "").toLowerCase()] || "PENDING") as any;

  await prisma.order.upsert({
    where: {
      organizationId_externalId: {
        organizationId: orgId,
        externalId: String(externalId),
      },
    },
    update: {
      status,
      totalValue,
      itemCount,
      currency: vtexOrder.currencyCode || "ARS",
      orderDate,
    },
    create: {
      externalId: String(externalId),
      organizationId: orgId,
      status,
      totalValue,
      itemCount,
      currency: vtexOrder.currencyCode || "ARS",
      source: "VTEX",
      orderDate,
    },
  });
}
