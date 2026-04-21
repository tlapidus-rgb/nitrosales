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
// Ritmo: 8 paginas × 100 ordenes = ~800 ordenes/chunk, cron cada 5min
// → ~9600/hora, ~1 año de data VTEX mediana en 1-2hs.
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { decryptCredentials } from "@/lib/crypto";
import type { ChunkResult } from "../types";

const PAGES_PER_CHUNK = 8;
const PAGE_SIZE = 100;

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
  const cursor = (job.cursor as any) || {};
  const startPage: number = cursor.page || 1;
  const fromDate = new Date(job.fromDate);
  const toDate = new Date(job.toDate);

  const creds = await getVtexCreds(orgId);
  if (!creds || !creds.accountName) {
    return {
      itemsProcessed: 0,
      newCursor: cursor,
      isComplete: false,
      error: "VTEX credentials no configuradas",
    };
  }

  const baseUrl = `https://${creds.accountName}.vtexcommercestable.com.br/api/oms/pvt/orders`;
  const headers: Record<string, string> = {
    "X-VTEX-API-AppKey": creds.appKey,
    "X-VTEX-API-AppToken": creds.appToken,
    Accept: "application/json",
  };

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  let totalProcessed = 0;
  let pagesRun = 0;
  let isComplete = false;
  let totalEstimate: number | undefined;

  for (let i = 0; i < PAGES_PER_CHUNK; i++) {
    const currentPage = startPage + i;
    const url =
      `${baseUrl}?per_page=${PAGE_SIZE}&page=${currentPage}` +
      `&f_creationDate=creationDate:[${fromStr}%20TO%20${toStr}]` +
      `&orderBy=creationDate,asc`;

    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (err: any) {
      return {
        itemsProcessed: totalProcessed,
        newCursor: { page: currentPage },
        isComplete: false,
        error: `fetch: ${err.message}`,
      };
    }

    if (res.status === 429) {
      return {
        itemsProcessed: totalProcessed,
        newCursor: { page: currentPage },
        isComplete: false,
      };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        itemsProcessed: totalProcessed,
        newCursor: { page: currentPage },
        isComplete: false,
        error: `VTEX ${res.status}: ${errText.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    const list = data?.list || [];

    if (i === 0 && data?.paging?.total) {
      totalEstimate = data.paging.total;
    }

    if (list.length === 0) {
      isComplete = true;
      break;
    }

    for (const order of list) {
      try {
        await upsertVtexOrder(orgId, order);
        totalProcessed++;
      } catch (err: any) {
        console.warn(`[vtex-backfill] skip ${order.orderId}: ${err.message}`);
      }
    }

    pagesRun++;

    if (list.length < PAGE_SIZE) {
      isComplete = true;
      break;
    }
  }

  const newPage = startPage + pagesRun;

  return {
    itemsProcessed: totalProcessed,
    newCursor: { page: newPage },
    isComplete,
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
