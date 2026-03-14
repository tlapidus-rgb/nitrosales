// ══════════════════════════════════════════════
// Conector de VTEX
// ══════════════════════════════════════════════
// Este archivo se conecta a la API de VTEX y trae los datos
// de órdenes, productos, clientes e inventario.

interface VtexCredentials {
  accountName: string;
  appKey: string;
  appToken: string;
}

interface VtexOrder {
  orderId: string;
  status: string;
  value: number;
  items: any[];
  clientProfileData: any;
  creationDate: string;
  paymentData: any;
  shippingData: any;
}

// ── Tipos para inventario ──
interface VtexWarehouseBalance {
  warehouseId: string;
  warehouseName: string;
  totalQuantity: number;
  reservedQuantity: number;
  hasUnlimitedQuantity: boolean;
}

interface VtexSkuInventory {
  skuId: string;
  balance: VtexWarehouseBalance[];
}

interface VtexSkuDetail {
  Id: number;
  ProductId: number;
  NameComplete: string;
  ProductName: string;
  BrandName: string;
  ProductCategories: Record<string, string>;
  Images: Array<{ ImageUrl: string }>;
  ListPrice: number;
  Price: number;
  IsActive: boolean;
  RefId: string;
  Ean: string;
}

interface SkuSyncResult {
  skuId: number;
  name: string;
  brand: string;
  stock: number;
  success: boolean;
  error?: string;
}

// ── Helpers ──
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class VtexConnector {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(credentials: VtexCredentials) {
    this.baseUrl = `https://${credentials.accountName}.vtexcommercestable.com.br`;
    this.headers = {
      "X-VTEX-API-AppKey": credentials.appKey,
      "X-VTEX-API-AppToken": credentials.appToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  // ── Fetch con retry y backoff para rate limits ──
  private async fetchWithRetry(
    url: string,
    retries = 3,
    baseDelay = 1000
  ): Promise<Response> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await fetch(url, { headers: this.headers });

      if (response.ok) return response;

      // Rate limit: retry con exponential backoff
      if (response.status === 429 && attempt < retries) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter
          ? parseInt(retryAfter) * 1000
          : baseDelay * Math.pow(2, attempt);
        console.warn(
          `[VTEX] Rate limited (429). Retry ${attempt + 1}/${retries} en ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      // Server errors: retry
      if (response.status >= 500 && attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(
          `[VTEX] Server error ${response.status}. Retry ${attempt + 1}/${retries} en ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      // 404 o error no retriable
      throw new Error(`VTEX API error: ${response.status} ${response.statusText} (${url})`);
    }
    throw new Error(`VTEX API: Max retries exceeded (${url})`);
  }

  // ═══════════════════════════════════════════
  // ÓRDENES
  // ═══════════════════════════════════════════

  async fetchOrders(params: {
    from: string;
    to: string;
    page?: number;
    perPage?: number;
  }): Promise<{ list: VtexOrder[]; total: number }> {
    const { from, to, page = 1, perPage = 50 } = params;
    const url = `${this.baseUrl}/api/oms/pvt/orders?f_creationDate=creationDate:[${from}T00:00:00.000Z TO ${to}T23:59:59.999Z]&page=${page}&per_page=${perPage}&orderBy=creationDate,desc`;

    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`VTEX API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      list: data.list || [],
      total: data.paging?.total || 0,
    };
  }

  async fetchOrderDetail(orderId: string): Promise<VtexOrder> {
    const url = `${this.baseUrl}/api/oms/pvt/orders/${orderId}`;
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`VTEX order detail error: ${response.status}`);
    }
    return response.json();
  }

  // ═══════════════════════════════════════════
  // PRODUCTOS (legacy - catalog search)
  // ═══════════════════════════════════════════

  async fetchProducts(params: {
    from?: number;
    to?: number;
  }): Promise<any[]> {
    const { from = 1, to = 50 } = params;
    const url = `${this.baseUrl}/api/catalog_system/pvt/products/GetProductAndSkuIds?categoryId=&_from=${from}&_to=${to}`;
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`VTEX products error: ${response.status}`);
    }
    const data = await response.json();

    const products = [];
    for (const productId of Object.keys(data.data || {})) {
      try {
        const detail = await this.fetchProductDetail(productId);
        products.push(detail);
      } catch (e) {
        console.error(`Error fetching product ${productId}:`, e);
      }
    }
    return products;
  }

  async fetchProductDetail(productId: string): Promise<any> {
    const url = `${this.baseUrl}/api/catalog_system/pvt/products/productget/${productId}`;
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`VTEX product detail error: ${response.status}`);
    }
    return response.json();
  }

  // ═══════════════════════════════════════════
  // INVENTARIO (nuevo - SKU-level)
  // ═══════════════════════════════════════════

  /**
   * Obtiene TODOS los SKU IDs del catálogo, paginando de a 1000.
   * Usa el endpoint privado de catalog.
   */
  async fetchAllSkuIds(pageSize = 1000): Promise<number[]> {
    const allIds: number[] = [];
    let page = 1;

    console.log("[VTEX] Fetching all SKU IDs...");

    while (true) {
      const url = `${this.baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitids?page=${page}&pagesize=${pageSize}`;

      try {
        const response = await this.fetchWithRetry(url);
        const ids: number[] = await response.json();

        if (!Array.isArray(ids) || ids.length === 0) break;

        allIds.push(...ids);
        console.log(`[VTEX] Page ${page}: ${ids.length} SKU IDs (total: ${allIds.length})`);
        page++;
        await sleep(100); // Rate limit safety
      } catch (error) {
        console.error(`[VTEX] Error fetching SKU IDs page ${page}:`, error);
        break;
      }
    }

    console.log(`[VTEX] Total SKU IDs found: ${allIds.length}`);
    return allIds;
  }

  /**
   * Obtiene el inventario de un SKU (stock en todos los warehouses).
   * Retorna stock total disponible = SUM(totalQuantity - reservedQuantity).
   */
  async fetchSkuInventory(skuId: number): Promise<{ totalStock: number; unlimited: boolean }> {
    const url = `${this.baseUrl}/api/logistics/pvt/inventory/skus/${skuId}`;
    const response = await this.fetchWithRetry(url);
    const data: VtexSkuInventory = await response.json();

    let totalStock = 0;
    let unlimited = false;

    if (data.balance && Array.isArray(data.balance)) {
      for (const wh of data.balance) {
        if (wh.hasUnlimitedQuantity) {
          unlimited = true;
          continue;
        }
        const available = Math.max(0, wh.totalQuantity - wh.reservedQuantity);
        totalStock += available;
      }
    }

    return { totalStock, unlimited };
  }

  /**
   * Obtiene detalle de un SKU (nombre, marca, imagen, precio, etc).
   */
  async fetchSkuDetail(skuId: number): Promise<VtexSkuDetail> {
    const url = `${this.baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`;
    const response = await this.fetchWithRetry(url);
    return response.json();
  }

  /**
   * Sincroniza un batch de SKUs: obtiene inventario + detalle y hace upsert en la DB.
   * Usa concurrencia controlada (maxConcurrent) y respeta un time budget.
   *
   * @param skuIds Lista de SKU IDs a procesar
   * @param orgId Organization ID para la DB
   * @param db Prisma client
   * @param timeBudgetMs Tiempo máximo en ms (default: 45s)
   * @param maxConcurrent Concurrencia máxima (default: 5)
   */
  async syncInventoryBatch(
    skuIds: number[],
    orgId: string,
    db: any, // PrismaClient
    timeBudgetMs = 45000,
    maxConcurrent = 5
  ): Promise<{ processed: number; failed: number; results: SkuSyncResult[] }> {
    const startTime = Date.now();
    const results: SkuSyncResult[] = [];
    let processed = 0;
    let failed = 0;

    // Procesar en batches de maxConcurrent
    for (let i = 0; i < skuIds.length; i += maxConcurrent) {
      // Chequear time budget
      const elapsed = Date.now() - startTime;
      if (elapsed > timeBudgetMs) {
        console.log(
          `[VTEX] Time budget exhausted (${elapsed}ms / ${timeBudgetMs}ms). Processed ${processed} SKUs.`
        );
        break;
      }

      const batch = skuIds.slice(i, i + maxConcurrent);

      // Procesar batch en paralelo
      const batchResults = await Promise.allSettled(
        batch.map((skuId) => this.syncSingleSku(skuId, orgId, db))
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
          if (result.value.success) processed++;
          else failed++;
        } else {
          failed++;
          results.push({
            skuId: batch[results.length % batch.length] || 0,
            name: "Unknown",
            brand: "",
            stock: 0,
            success: false,
            error: result.reason?.message || "Unknown error",
          });
        }
      }

      // Delay entre batches para respetar rate limits
      await sleep(80);

      // Log progreso cada 100 SKUs
      if ((processed + failed) % 100 < maxConcurrent) {
        console.log(
          `[VTEX] Progress: ${processed} processed, ${failed} failed, ${Math.round(elapsed / 1000)}s elapsed`
        );
      }
    }

    return { processed, failed, results };
  }

  /**
   * Sincroniza un solo SKU: fetch inventario + detalle, upsert en DB.
   */
  private async syncSingleSku(
    skuId: number,
    orgId: string,
    db: any
  ): Promise<SkuSyncResult> {
    try {
      // Fetch inventario y detalle en paralelo
      const [inventory, detail] = await Promise.all([
        this.fetchSkuInventory(skuId),
        this.fetchSkuDetail(skuId),
      ]);

      const name = detail.NameComplete || detail.ProductName || `SKU ${skuId}`;
      const brand = detail.BrandName || "";
      const imageUrl = detail.Images?.[0]?.ImageUrl || null;
      const price = detail.Price || detail.ListPrice || 0;
      const isActive = detail.IsActive !== false;

      // Extraer categoría más específica
      const categories = detail.ProductCategories
        ? Object.values(detail.ProductCategories)
        : [];
      const category = categories.length > 0
        ? categories[categories.length - 1] // La más específica
        : null;

      // Stock: si es unlimited, poner un valor alto (99999)
      const stock = inventory.unlimited ? 99999 : inventory.totalStock;

      // Upsert en la DB
      await db.product.upsert({
        where: {
          organizationId_externalId: {
            organizationId: orgId,
            externalId: String(skuId),
          },
        },
        create: {
          externalId: String(skuId),
          name,
          sku: detail.RefId || detail.Ean || String(skuId),
          brand: brand || null,
          category: category || null,
          price,
          imageUrl,
          isActive,
          stock,
          stockUpdatedAt: new Date(),
          organizationId: orgId,
        },
        update: {
          name,
          sku: detail.RefId || detail.Ean || String(skuId),
          brand: brand || null,
          category: category || null,
          price,
          imageUrl,
          isActive,
          stock,
          stockUpdatedAt: new Date(),
        },
      });

      return { skuId, name, brand, stock, success: true };
    } catch (error: any) {
      // SKU individual falla → log y continuar (no abortar el batch)
      console.error(`[VTEX] Error syncing SKU ${skuId}:`, error.message);
      return {
        skuId,
        name: "Error",
        brand: "",
        stock: 0,
        success: false,
        error: error.message,
      };
    }
  }

  // ═══════════════════════════════════════════
  // CLIENTES (via órdenes)
  // ═══════════════════════════════════════════

  extractCustomerFromOrder(order: VtexOrder) {
    const profile = order.clientProfileData;
    if (!profile) return null;
    return {
      externalId: profile.userProfileId || profile.email,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      city: order.shippingData?.address?.city,
      state: order.shippingData?.address?.state,
      country: order.shippingData?.address?.country,
    };
  }

  // ═══════════════════════════════════════════
  // TEST DE CONEXIÓN
  // ═══════════════════════════════════════════

  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/api/oms/pvt/orders?page=1&per_page=1`;
      const response = await fetch(url, { headers: this.headers });
      return response.ok;
    } catch {
      return false;
    }
  }
}
