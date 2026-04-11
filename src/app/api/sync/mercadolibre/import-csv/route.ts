export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — Vercel Pro

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";

// ══════════════════════════════════════════════════════════════
// POST /api/sync/mercadolibre/import-csv
// ══════════════════════════════════════════════════════════════
// Accepts a CSV (from MercadoLibre "Ventas" export) as FormData
// and bulk-creates Products + OrderItems for matching orders.
//
// Expected CSV columns (auto-detected, case-insensitive):
//   - Order ID:   "Nro. de venta" | "Número de venta" | "# Venta" | "order_id" | "Pack ID"
//   - Title:      "Publicación" | "Título" | "Título de la publicación" | "title" | "Producto"
//   - SKU:        "SKU" | "SKU del vendedor" | "seller_sku"
//   - Quantity:   "Cantidad" | "Unidades" | "quantity" | "Cant."
//   - Unit price: "Precio unitario" | "Precio" | "unit_price" | "Precio de venta"
//   - ML Item ID: "# Publicación" | "Nro. de publicación" | "item_id" | "MLA"
//   - Image URL:  "Imagen" | "image_url" | "thumbnail" (optional)
//
// The importer matches rows to existing orders by externalId and
// inserts products + order_items in bulk SQL for speed.
// ══════════════════════════════════════════════════════════════

interface CSVRow {
  orderId: string;
  title: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  mlItemId: string;
  imageUrl: string | null;
}

// Column name mapping — first match wins
const COL_MAP: Record<keyof CSVRow, string[]> = {
  orderId: [
    "nro. de venta", "número de venta", "# venta", "order_id",
    "pack id", "nro de venta", "id de venta", "nro venta",
    "id venta", "venta",
  ],
  title: [
    "publicación", "título de la publicación", "título", "title",
    "producto", "descripción", "item", "nombre",
  ],
  sku: [
    "sku", "sku del vendedor", "seller_sku", "codigo",
    "código", "referencia",
  ],
  quantity: [
    "cantidad", "unidades", "quantity", "cant.", "cant", "qty",
  ],
  unitPrice: [
    "precio unitario", "precio de venta", "precio", "unit_price",
    "price", "monto", "valor unitario",
  ],
  mlItemId: [
    "# publicación", "nro. de publicación", "nro de publicación",
    "item_id", "mla", "id de publicación", "id publicación",
    "publicación id",
  ],
  imageUrl: [
    "imagen", "image_url", "thumbnail", "foto", "url imagen",
  ],
};

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === "," || ch === ";") {
          cells.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

function detectColumns(headers: string[]): Record<keyof CSVRow, number> {
  const lower = headers.map((h) => h.toLowerCase().replace(/^["']|["']$/g, "").trim());
  const result: Partial<Record<keyof CSVRow, number>> = {};

  for (const [field, aliases] of Object.entries(COL_MAP)) {
    for (const alias of aliases) {
      const idx = lower.findIndex((h) => h.includes(alias));
      if (idx >= 0) {
        result[field as keyof CSVRow] = idx;
        break;
      }
    }
  }

  return result as Record<keyof CSVRow, number>;
}

function parseNumber(val: string): number {
  if (!val) return 0;
  // Handle "1.234,56" (Argentine format) and "1234.56"
  const cleaned = val.replace(/[^0-9.,\-]/g, "");
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // "1.234,56" → "1234.56"
    return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  }
  if (cleaned.includes(",") && !cleaned.includes(".")) {
    // Could be "1234,56" (decimal comma) or "1,234" (thousands)
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      return parseFloat(cleaned.replace(",", "."));
    }
    return parseFloat(cleaned.replace(/,/g, ""));
  }
  return parseFloat(cleaned) || 0;
}

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization();
    if (!org) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const orgId = org.id;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded. Send as FormData with key 'file'." }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
    }

    const headers = rows[0];
    const cols = detectColumns(headers);

    // Validate required columns
    const missing: string[] = [];
    if (cols.orderId === undefined) missing.push("Order ID (ej: 'Nro. de venta')");
    if (cols.title === undefined) missing.push("Title (ej: 'Publicación')");
    if (cols.unitPrice === undefined) missing.push("Price (ej: 'Precio unitario')");

    if (missing.length > 0) {
      return NextResponse.json({
        error: `No se encontraron columnas requeridas: ${missing.join(", ")}`,
        detected: Object.fromEntries(
          Object.entries(cols).map(([k, v]) => [k, v !== undefined ? headers[v] : null])
        ),
        headers: headers.slice(0, 20),
      }, { status: 400 });
    }

    // Parse data rows
    const parsed: CSVRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const orderId = (cols.orderId !== undefined ? row[cols.orderId] : "")?.trim();
      if (!orderId) continue;

      parsed.push({
        orderId,
        title: (cols.title !== undefined ? row[cols.title] : "ML Item")?.trim() || "ML Item",
        sku: (cols.sku !== undefined ? row[cols.sku] : "")?.trim() || "",
        quantity: cols.quantity !== undefined ? Math.max(1, Math.round(parseNumber(row[cols.quantity]))) : 1,
        unitPrice: cols.unitPrice !== undefined ? parseNumber(row[cols.unitPrice]) : 0,
        mlItemId: (cols.mlItemId !== undefined ? row[cols.mlItemId] : "")?.trim() || "",
        imageUrl: (cols.imageUrl !== undefined ? row[cols.imageUrl] : null)?.trim() || null,
      });
    }

    if (parsed.length === 0) {
      return NextResponse.json({ error: "No valid rows found in CSV" }, { status: 400 });
    }

    // Group by orderId
    const byOrder = new Map<string, CSVRow[]>();
    for (const row of parsed) {
      const existing = byOrder.get(row.orderId) || [];
      existing.push(row);
      byOrder.set(row.orderId, existing);
    }

    // Find matching orders in DB that don't have items yet
    const orderIds = [...byOrder.keys()];
    const BATCH = 500;
    let totalEnriched = 0;
    let totalItems = 0;
    let notFound = 0;
    let alreadyHasItems = 0;

    for (let b = 0; b < orderIds.length; b += BATCH) {
      const batch = orderIds.slice(b, b + BATCH);
      const placeholders = batch.map((_, i) => `$${i + 2}`).join(",");

      // Find orders that exist and DON'T have items
      const dbOrders: { id: string; externalId: string }[] = await prisma.$queryRawUnsafe(
        `SELECT o.id, o."externalId"
         FROM orders o
         WHERE o."organizationId" = $1
           AND o."externalId" IN (${placeholders})`,
        orgId,
        ...batch
      );

      // Check which already have items
      const orderIdsInDb = dbOrders.map((o) => o.id);
      const withItems: { orderId: string }[] = orderIdsInDb.length > 0
        ? await prisma.$queryRawUnsafe(
            `SELECT DISTINCT "orderId" FROM order_items WHERE "orderId" IN (${orderIdsInDb.map((_, i) => `$${i + 1}`).join(",")})`,
            ...orderIdsInDb
          )
        : [];
      const hasItemsSet = new Set(withItems.map((w) => w.orderId));

      const dbMap = new Map<string, string>();
      for (const o of dbOrders) {
        if (hasItemsSet.has(o.id)) {
          alreadyHasItems++;
        } else {
          dbMap.set(o.externalId, o.id);
        }
      }

      notFound += batch.length - dbOrders.length;

      // Bulk insert products + items for orders without items
      for (const [extId, dbOrderId] of dbMap) {
        const items = byOrder.get(extId);
        if (!items) continue;

        for (const item of items) {
          const prodExtId = item.mlItemId || item.sku || `meli-csv-${extId}-${item.title.substring(0, 20)}`;

          // Upsert product
          const prodRows: { id: string }[] = await prisma.$queryRawUnsafe(
            `INSERT INTO products ("id", "organizationId", "externalId", "name", "sku", "price", "imageUrl", "createdAt", "updatedAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW(), NOW())
             ON CONFLICT ("organizationId", "externalId")
             DO UPDATE SET "name" = EXCLUDED."name", "price" = EXCLUDED."price", "updatedAt" = NOW()
             RETURNING id`,
            orgId,
            prodExtId,
            item.title,
            item.sku || prodExtId,
            item.unitPrice,
            item.imageUrl
          );

          // Insert order item
          await prisma.$queryRawUnsafe(
            `INSERT INTO order_items ("id", "orderId", "productId", "quantity", "unitPrice", "totalPrice")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)`,
            dbOrderId,
            prodRows[0].id,
            item.quantity,
            item.unitPrice,
            item.unitPrice * item.quantity
          );
          totalItems++;
        }
        totalEnriched++;
      }
    }

    return NextResponse.json({
      ok: true,
      csvRows: parsed.length,
      uniqueOrders: byOrder.size,
      enriched: totalEnriched,
      itemsCreated: totalItems,
      alreadyHadItems: alreadyHasItems,
      notFoundInDb: notFound,
      columnsDetected: Object.fromEntries(
        Object.entries(cols).map(([k, v]) => [k, v !== undefined ? headers[v] : null])
      ),
    });
  } catch (err: any) {
    console.error("[ML CSV Import] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
