// ââââââââââââââââââââââââââââââââââââââââââââââ
// Conector de VTEX
// ââââââââââââââââââââââââââââââââââââââââââââââ
// Este archivo se conecta a la API de VTEX y trae los datos
// de Ã³rdenes, productos, clientes e inventario.

export interface VtexCredentials {
  accountName: string;
  appKey: string;
  appToken: string;
}

export interface VtexOrderItem {
  id: string;
  productId: string;
  name: string;
  refId: string | null;
  sellerSku: string | null;
  quantity: number;
  price: number;
  sellingPrice: number;
  imageUrl: string | null;
  additionalInfo?: {
    brandName?: string;
    categoriesIds?: string;
  };
}

export interface VtexClientProfile {
  userProfileId?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface VtexPaymentTransaction {
  payments: Array<{
    paymentSystemName: string;
    group: string;
    value: number;
  }>;
}

export interface VtexShippingAddress {
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface VtexShippingData {
  address?: VtexShippingAddress;
}

export interface VtexTotalItem {
  id: string;
  name: string;
  value: number;
}

export interface VtexRateAndBenefit {
  name?: string;
}

export interface VtexOrder {
  orderId: string;
  status: string;
  value: number;
  totalValue?: number;
  totalItems?: number;
  items: VtexOrderItem[];
  clientProfileData: VtexClientProfile | null;
  creationDate: string;
  paymentData?: {
    transactions?: VtexPaymentTransaction[];
  };
  shippingData?: VtexShippingData;
  totals?: VtexTotalItem[];
  ratesAndBenefitsData?: VtexRateAndBenefit[];
  salesChannel?: string;
  storePreferencesData?: {
    currencyCode?: string;
  };
}

export interface VtexProductCatalog {
  Id: number;
  Name: string;
  CategoryId: number;
  BrandId: number;
  LinkId: string;
  IsActive: boolean;
  [key: string]: unknown; // Allow additional fields from catalog API
}

// ââ Tipos para inventario ââ
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
  CostPrice: number | null; // Costo de compra del proveedor (COGS)
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

// ââ Helpers ââ
// ── Minimal Prisma interface (avoids importing full PrismaClient in connector) ──
interface PrismaClientLike {
  $transaction: (args: unknown[]) => Promise<unknown>;
  product: {
    upsert: (args: {
      where: { organizationId_externalId: { organizationId: string; externalId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => unknown;
  };
}

// ── Product upsert data shape ──
interface ProductUpsertData {
  externalId: string;
  name: string;
  sku: string;
  brand: string | null;
  category: string | null;
  price: number;
  costPrice?: number;
  imageUrl: string | null;
  isActive: boolean;
  stock: number;
  stockUpdatedAt: Date;
  [key: string]: unknown; // Allow spread with optional fields
}

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

  // ââ Fetch con retry y backoff para rate limits ââ
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

  // âââââââââââââââââââââââââââââââââââââââââââ
  // ÃRDENES
  // âââââââââââââââââââââââââââââââââââââââââââ

  async fetchOrders(params: {
    from: string;
    to: string;
    page?: number;
    perPage?: number;
  }): Promise<{ list: VtexOrder[]; total: number }> {
    const { from, to, page = 1, perPage = 50 } = params;
    const url = `${this.baseUrl}/api/oms/pvt/orders?f_creationDate=creationDate:[${from}T00:00:00.000Z TO ${to}T23:59:59.999Z]&page=${page}&per_page=${perPage}&orderBy=creationDate,desc`;

    const response = await this.fetchWithRetry(url);
    const data = await response.json();
    return {
      list: data.list || [],
      total: data.paging?.total || 0,
    };
  }

  async fetchOrderDetail(orderId: string): Promise<VtexOrder> {
    const url = `${this.baseUrl}/api/oms/pvt/orders/${orderId}`;
    const response = await this.fetchWithRetry(url);
    return response.json();
  }

  // âââââââââââââââââââââââââââââââââââââââââââ
  // PRODUCTOS (legacy - catalog search)
  // âââââââââââââââââââââââââââââââââââââââââââ

  async fetchProducts(params: {
    from?: number;
    to?: number;
  }): Promise<VtexProductCatalog[]> {
    const { from = 1, to = 50 } = params;
    const url = `${this.baseUrl}/api/catalog_system/pvt/products/GetProductAndSkuIds?categoryId=&_from=${from}&_to=${to}`;
    const response = await this.fetchWithRetry(url);
    const data = await response.json();

    // Batching: fetch product details in groups of 10 with Promise.allSettled
    const productIds = Object.keys(data.data || {});
    const products: VtexProductCatalog[] = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
      const batch = productIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((productId) => this.fetchProductDetail(productId))
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          products.push(result.value);
        } else {
          console.error(`Error fetching product:`, result.reason);
        }
      }
      // Small delay between batches to respect rate limits
      if (i + BATCH_SIZE < productIds.length) {
        await sleep(100);
      }
    }
    return products;
  }

  async fetchProductDetail(productId: string): Promise<VtexProductCatalog> {
    const url = `${this.baseUrl}/api/catalog_system/pvt/products/productget/${productId}`;
    const response = await this.fetchWithRetry(url);
    return response.json();
  }

  // âââââââââââââââââââââââââââââââââââââââââââ
  // INVENTARIO (nuevo - SKU-level)
  // âââââââââââââââââââââââââââââââââââââââââââ

  /**
   * Obtiene TODOS los SKU IDs del catÃ¡logo, paginando de a 1000.
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
          // Para warehouses "unlimited", usar totalQuantity directamente
          // (VTEX no decrementa stock pero el campo tiene el valor real)
          const available = Math.max(0, wh.totalQuantity);
          totalStock += available;
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
   * Sincroniza un batch de SKUs: obtiene inventario + detalle y hace batch upsert en la DB.
   * Optimizado v2:
   * - Fetch VTEX data en paralelo (maxConcurrent)
   * - Batch DB upserts de hasta BATCH_DB_SIZE SKUs en una transacciÃ³n
   * - Delay reducido (40ms vs 80ms)
   *
   * @param skuIds Lista de SKU IDs a procesar
   * @param orgId Organization ID para la DB
   * @param db Prisma client
   * @param timeBudgetMs Tiempo mÃ¡ximo en ms (default: 50s)
   * @param maxConcurrent Concurrencia mÃ¡xima (default: 12)
   */
  async syncInventoryBatch(
    skuIds: number[],
    orgId: string,
    db: PrismaClientLike,
    timeBudgetMs = 50000,
    maxConcurrent = 12
  ): Promise<{ processed: number; failed: number; results: SkuSyncResult[] }> {
    const startTime = Date.now();
    const results: SkuSyncResult[] = [];
    let processed = 0;
    let failed = 0;
    const BATCH_DB_SIZE = 50; // Upserts agrupados en transacciones de 50

    // Buffer para acumular upserts y hacer batch
    let upsertBuffer: Array<{
      skuId: number;
      data: ProductUpsertData;
      result: SkuSyncResult;
    }> = [];

    // Flush buffer: ejecutar todos los upserts pendientes en una transacciÃ³n
    const flushBuffer = async () => {
      if (upsertBuffer.length === 0) return;
      const batch = [...upsertBuffer];
      upsertBuffer = [];

      try {
        await db.$transaction(
          batch.map((item) =>
            db.product.upsert({
              where: {
                organizationId_externalId: {
                  organizationId: orgId,
                  externalId: String(item.skuId),
                },
              },
              create: { ...item.data, organizationId: orgId },
              update: item.data,
            })
          )
        );

        // Marcar todos como exitosos
        for (const item of batch) {
          results.push(item.result);
          processed++;
        }
      } catch (txError: any) {
        // Si la transacciÃ³n falla, intentar uno por uno
        console.warn(
          `[VTEX] Batch transaction failed (${batch.length} items), falling back to individual upserts:`,
          txError.message
        );
        for (const item of batch) {
          try {
            await db.product.upsert({
              where: {
                organizationId_externalId: {
                  organizationId: orgId,
                  externalId: String(item.skuId),
                },
              },
              create: { ...item.data, organizationId: orgId },
              update: item.data,
            });
            results.push(item.result);
            processed++;
          } catch (e: any) {
            failed++;
            results.push({
              ...item.result,
              success: false,
              error: e.message,
            });
          }
        }
      }
    };

    // Procesar en batches de maxConcurrent (fetch paralelo de VTEX)
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

      // Fetch inventario + detalle en paralelo para todo el batch
      const batchResults = await Promise.allSettled(
        batch.map((skuId) => this.fetchSkuData(skuId))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const skuId = batch[j];

        if (result.status === "fulfilled" && result.value) {
          const { name, brand, imageUrl, price, costPrice, isActive, category, stock, refId, ean } =
            result.value;

          const data = {
            externalId: String(skuId),
            name,
            sku: refId || ean || String(skuId),
            ean: ean || null,
            brand: brand || null,
            category: category || null,
            price,
            imageUrl,
            isActive,
            stock,
            stockUpdatedAt: new Date(),
            // Solo setear costPrice si VTEX tiene el dato (no pisar un valor manual)
            ...(costPrice !== null ? { costPrice } : {}),
          };

          upsertBuffer.push({
            skuId,
            data,
            result: { skuId, name, brand, stock, success: true },
          });
        } else {
          failed++;
          const errMsg =
            result.status === "rejected"
              ? result.reason?.message || "Unknown error"
              : "No data";
          results.push({
            skuId,
            name: "Error",
            brand: "",
            stock: 0,
            success: false,
            error: errMsg,
          });
        }
      }

      // Flush buffer si alcanzÃ³ el tamaÃ±o de batch DB
      if (upsertBuffer.length >= BATCH_DB_SIZE) {
        await flushBuffer();
      }

      // Delay reducido entre batches
      await sleep(40);

      // Log progreso cada ~100 SKUs
      const total = processed + failed;
      if (total > 0 && total % 100 < maxConcurrent) {
        const elapsed = Date.now() - startTime;
        console.log(
          `[VTEX] Progress: ${processed} ok, ${failed} failed, ${Math.round(elapsed / 1000)}s, ${Math.round(processed / (elapsed / 1000))} SKUs/s`
        );
      }
    }

    // Flush remaining
    await flushBuffer();

    return { processed, failed, results };
  }

  /**
   * Fetch inventario + detalle de un SKU (sin DB write).
   * Separa la lectura VTEX del write a DB para permitir batch upserts.
   */
  private async fetchSkuData(skuId: number): Promise<{
    name: string;
    brand: string;
    imageUrl: string | null;
    price: number;
    costPrice: number | null;
    isActive: boolean;
    category: string | null;
    stock: number;
    refId: string;
    ean: string;
  }> {
    const [inventory, detail] = await Promise.all([
      this.fetchSkuInventory(skuId),
      this.fetchSkuDetail(skuId),
    ]);

    const name = detail.NameComplete || detail.ProductName || `SKU ${skuId}`;
    const brand = detail.BrandName || "";
    const imageUrl = detail.Images?.[0]?.ImageUrl || null;
    const price = detail.Price || detail.ListPrice || 0;
    const costPrice = detail.CostPrice && detail.CostPrice > 0 ? detail.CostPrice : null;
    const isActive = detail.IsActive !== false;

    const categories = detail.ProductCategories
      ? Object.values(detail.ProductCategories)
      : [];
    const category =
      categories.length > 0 ? (categories[categories.length - 1] as string) : null;

    // Siempre usar el stock real calculado (ya incluye warehouses unlimited)
    const stock = inventory.totalStock;

    return {
      name,
      brand,
      imageUrl,
      price,
      costPrice,
      isActive,
      category,
      stock,
      refId: detail.RefId || "",
      ean: detail.Ean || "",
    };
  }

  // âââââââââââââââââââââââââââââââââââââââââââ
  // CLIENTES (via Ã³rdenes)
  // âââââââââââââââââââââââââââââââââââââââââââ

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

  // âââââââââââââââââââââââââââââââââââââââââââ
  // TEST DE CONEXIÃN
  // âââââââââââââââââââââââââââââââââââââââââââ

  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/api/oms/pvt/orders?page=1&per_page=1`;
      const response = await this.fetchWithRetry(url, 1, 500);
      return response.ok;
    } catch {
      return false;
    }
  }
}
