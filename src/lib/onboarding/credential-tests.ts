// ══════════════════════════════════════════════════════════════
// credential-tests.ts — funciones puras de test de credenciales
// ══════════════════════════════════════════════════════════════
// Reusables desde el endpoint del cliente (no expuesto en UI hoy)
// y desde el panel admin (F1.3 — botones de test antes de aprobar).
// ══════════════════════════════════════════════════════════════

export type SubCheck = {
  label: string;       // ej: "Email del cliente"
  ok: boolean;
  value?: string;      // ej: "presente" o "faltante"
  optional?: boolean;  // true = si falta, no se cuenta como falla (se muestra gris "–")
  warning?: boolean;   // true = pasa pero con alerta (ej: costo igual a precio = sospechoso)
};

export type AreaCheck = {
  area: string;        // ej: "Ventas"
  ok: boolean;         // true si NO hay fallas criticas (opcionales/warnings no cuentan)
  detail: string;      // resumen corto
  hint?: string;
  subChecks?: SubCheck[];
  hasWarnings?: boolean; // true si algun subCheck tiene warning u opcional faltante
};

export type TestResult = {
  ok: boolean;
  detail: string;
  hint?: string;
  areas?: AreaCheck[];
  hasWarnings?: boolean; // nuevo: true si alguna area tiene warnings (UI naranja)
};

export async function testVtex(creds: any): Promise<TestResult> {
  const accountName = (creds?.accountName || "").trim();
  const appKey = (creds?.appKey || "").trim();
  const appToken = (creds?.appToken || "").trim();

  if (!accountName || !appKey || !appToken) {
    return { ok: false, detail: "Faltan campos obligatorios", hint: "Account Name, App Key y App Token son requeridos." };
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(accountName)) {
    return { ok: false, detail: "Account Name inválido", hint: "Solo letras, números y guiones. Sin https:// ni .myvtex.com" };
  }

  const headers = {
    "X-VTEX-API-AppKey": appKey,
    "X-VTEX-API-AppToken": appToken,
    Accept: "application/json",
  };
  const base = `https://${accountName}.vtexcommercestable.com.br`;

  // Helper de fetch con timeout + interpretacion de status
  async function vtexFetch(path: string): Promise<{ status: number; data: any | null; error: string | null }> {
    try {
      const r = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(10000) });
      if (r.status === 204) return { status: 204, data: null, error: null };
      let data: any = null;
      try { data = await r.json(); } catch { data = null; }
      return { status: r.status, data, error: r.ok ? null : `HTTP ${r.status}` };
    } catch (err: any) {
      const msg = err?.name === "TimeoutError" || err?.name === "AbortError" ? "timeout" : (err?.message || "error de red");
      return { status: 0, data: null, error: msg };
    }
  }

  // Test PROFUNDO: por cada area, trae muestra real y valida que los campos
  // que el backfill va a usar esten presentes en la respuesta.
  type AreaResult = AreaCheck;

  async function testOrders(): Promise<AreaResult> {
    const listRes = await vtexFetch("/api/oms/pvt/orders?per_page=1&orderBy=creationDate,desc");
    if (listRes.status === 401 || listRes.status === 403) {
      return { area: "Ventas", ok: false, detail: `sin permiso (${listRes.status})`, hint: "App Key necesita permiso OMS - Full Access" };
    }
    if (listRes.status === 404) {
      return { area: "Ventas", ok: false, detail: `Cuenta "${accountName}" no existe en VTEX`, hint: "Revisá el accountName." };
    }
    if (listRes.error) return { area: "Ventas", ok: false, detail: listRes.error };
    const list = listRes.data?.list;
    if (!Array.isArray(list) || list.length === 0) {
      return { area: "Ventas", ok: true, detail: "cuenta sin ventas todavía (no se pudo validar detalle)" };
    }
    const firstOrderId = list[0]?.orderId;
    if (!firstOrderId) return { area: "Ventas", ok: false, detail: "lista sin orderId" };

    const detRes = await vtexFetch(`/api/oms/pvt/orders/${firstOrderId}`);
    if (detRes.error || !detRes.data) {
      return { area: "Ventas", ok: false, detail: `no pude traer detalle (${detRes.error})` };
    }
    const o = detRes.data;
    const checks: SubCheck[] = [
      { label: "Email del cliente", ok: !!o.clientProfileData?.email },
      { label: "Nombre del cliente", ok: !!(o.clientProfileData?.firstName || o.clientProfileData?.lastName) },
      { label: "Items del pedido", ok: Array.isArray(o.items) && o.items.length > 0, value: `${o.items?.length || 0} items` },
      { label: "Nombre de productos", ok: (o.items || []).every((it: any) => !!it.name) },
      { label: "Precios unitarios", ok: (o.items || []).every((it: any) => (it.sellingPrice || it.price) != null) },
      { label: "SKU / refId de productos", ok: (o.items || []).some((it: any) => it.refId || it.sellerSku || it.id) },
      { label: "Dirección de envío", ok: !!o.shippingData?.address?.postalCode },
      { label: "Ciudad / provincia", ok: !!(o.shippingData?.address?.city || o.shippingData?.address?.state) },
      { label: "Totales (envío/descuento)", ok: Array.isArray(o.totals) && o.totals.length > 0 },
      { label: "Cupón (si usado)", ok: true, value: o.marketingData?.coupon || "sin cupón en esta venta" },
    ];
    const failed = checks.filter((c) => !c.ok);
    return {
      area: "Ventas",
      ok: failed.length === 0,
      detail: failed.length === 0 ? `${checks.length} checks OK` : `${failed.length}/${checks.length} checks fallaron`,
      subChecks: checks,
    };
  }

  async function testCatalog(): Promise<AreaResult> {
    const search = await vtexFetch("/api/catalog_system/pub/products/search?_from=0&_to=0");
    if (search.status === 401 || search.status === 403) {
      return { area: "Catálogo", ok: false, detail: `sin permiso (${search.status})`, hint: "App Key necesita permiso Catalog - Read" };
    }
    if (!Array.isArray(search.data) || search.data.length === 0) {
      return { area: "Catálogo", ok: true, detail: "sin productos cargados todavía" };
    }
    const prod = search.data[0];
    const firstSku = prod.items?.[0] || {};
    const checks: SubCheck[] = [
      { label: "Nombre de producto", ok: !!(prod.productName || prod.productTitle) },
      { label: "Marca", ok: !!prod.brand, value: prod.brand || "faltante" },
      { label: "Categoría", ok: !!prod.categoryId || !!prod.categories?.length },
      { label: "SKU variante", ok: !!firstSku.itemId },
      { label: "Imagen", ok: Array.isArray(firstSku.images) && firstSku.images.length > 0 },
      { label: "EAN / código de barras", ok: !!firstSku.ean, value: firstSku.ean ? "presente" : "faltante (opcional)" },
      { label: "Referencia / SKU real", ok: !!firstSku.referenceId?.[0]?.Value },
    ];
    const failed = checks.filter((c) => !c.ok);
    return {
      area: "Catálogo",
      ok: failed.length === 0,
      detail: failed.length === 0 ? `${checks.length} checks OK` : `${failed.length}/${checks.length} faltan`,
      subChecks: checks,
    };
  }

  async function testPricing(): Promise<AreaResult> {
    const search = await vtexFetch("/api/catalog_system/pub/products/search?_from=0&_to=0");
    const skuId = search.data?.[0]?.items?.[0]?.itemId;
    if (!skuId) {
      return { area: "Precios", ok: true, detail: "sin SKU disponible para validar" };
    }
    const priceRes = await vtexFetch(`/api/pricing/prices/${skuId}?_forceGet=true`);
    if (priceRes.status === 401 || priceRes.status === 403) {
      return { area: "Precios", ok: false, detail: `sin permiso (${priceRes.status})`, hint: "App Key necesita permiso Pricing - Read" };
    }
    if (priceRes.status === 404) {
      return {
        area: "Precios",
        ok: true,
        detail: "SKU sin precio en Pricing (VTEX usa Catalog como fallback)",
        subChecks: [
          { label: "Pricing API accesible", ok: true },
          { label: "Precio base del SKU", ok: false, value: "no cargado en Pricing" },
          { label: "Costo (costPrice)", ok: false, value: "no cargado" },
        ],
      };
    }
    if (priceRes.error || !priceRes.data) return { area: "Precios", ok: false, detail: priceRes.error || "sin data" };
    const p = priceRes.data;
    // Detectar costo falso: si costPrice == basePrice, VTEX lo devuelve como
    // fallback cuando no hay COGS real cargado. No es un costo verdadero.
    const hasRealCost = p.costPrice != null && p.costPrice > 0 && p.costPrice !== p.basePrice;
    const checks: SubCheck[] = [
      { label: "Precio base", ok: p.basePrice != null, value: p.basePrice != null ? String(p.basePrice) : "faltante" },
      { label: "Precio de lista", ok: p.listPrice != null, value: p.listPrice != null ? String(p.listPrice) : "no cargado", optional: true },
      {
        label: "Costo (costPrice)",
        ok: hasRealCost,
        value: hasRealCost
          ? String(p.costPrice)
          : p.costPrice === p.basePrice
            ? "igual al precio (VTEX devuelve fallback, cargá costo real en VTEX)"
            : "no cargado",
        warning: !hasRealCost,
      },
      { label: "Markup", ok: p.markup != null && p.markup > 0, value: p.markup != null ? String(p.markup) : "sin markup", optional: true },
    ];
    // Solo cuentan como falla los checks NO opcionales que estan en ok: false
    const failed = checks.filter((c) => !c.ok && !c.optional);
    const hasWarnings = checks.some((c) => c.warning || (c.optional && !c.ok));
    return {
      area: "Precios",
      ok: failed.length === 0,
      detail: failed.length === 0
        ? (hasRealCost ? `${checks.length} checks OK (con costo real)` : `checks OK pero sin costo real cargado`)
        : `${failed.length} campos críticos faltan`,
      subChecks: checks,
      hasWarnings,
    };
  }

  async function testInventory(): Promise<AreaResult> {
    const whRes = await vtexFetch("/api/logistics/pvt/configuration/warehouses");
    if (whRes.status === 401 || whRes.status === 403) {
      return { area: "Stock / depósitos", ok: false, detail: `sin permiso (${whRes.status})`, hint: "App Key necesita permiso Logistics - Read" };
    }
    if (whRes.error) return { area: "Stock / depósitos", ok: false, detail: whRes.error };
    const list = Array.isArray(whRes.data) ? whRes.data : (whRes.data?.items || []);
    if (list.length === 0) {
      return { area: "Stock / depósitos", ok: true, detail: "cuenta sin depósitos configurados" };
    }
    const wh = list[0];
    const checks: SubCheck[] = [
      { label: "Depósitos encontrados", ok: list.length > 0, value: `${list.length}` },
      { label: "ID de depósito", ok: !!(wh.id || wh.warehouseId) },
      { label: "Nombre del depósito", ok: !!wh.name, value: wh.name || "faltante" },
      { label: "Prioridad / código postal", ok: !!(wh.priority != null || wh.postalCode) },
    ];
    const failed = checks.filter((c) => !c.ok);
    return {
      area: "Stock / depósitos",
      ok: failed.length === 0,
      detail: failed.length === 0 ? `${list.length} depósitos con estructura completa` : `${failed.length}/${checks.length} fallaron`,
      subChecks: checks,
    };
  }

  async function testShipping(): Promise<AreaResult> {
    const r = await vtexFetch("/api/logistics/pvt/shipping-policies");
    if (r.status === 401 || r.status === 403) {
      return { area: "Tarifas de envío", ok: false, detail: `sin permiso (${r.status})`, hint: "App Key necesita permiso Logistics - Read" };
    }
    if (r.error) return { area: "Tarifas de envío", ok: false, detail: r.error };
    const list = Array.isArray(r.data) ? r.data : (r.data?.items || []);
    if (list.length === 0) {
      return { area: "Tarifas de envío", ok: true, detail: "sin políticas de envío configuradas" };
    }
    const pol = list[0];
    const checks: SubCheck[] = [
      { label: "Políticas encontradas", ok: list.length > 0, value: `${list.length}` },
      { label: "Nombre de política", ok: !!pol.name, value: pol.name || "faltante" },
      { label: "Método de envío", ok: !!(pol.shippingMethod || pol.type) },
    ];
    const failed = checks.filter((c) => !c.ok);
    return {
      area: "Tarifas de envío",
      ok: failed.length === 0,
      detail: failed.length === 0 ? `${list.length} políticas con estructura completa` : `${failed.length}/${checks.length} fallaron`,
      subChecks: checks,
    };
  }

  async function testBrands(): Promise<AreaResult> {
    const r = await vtexFetch("/api/catalog_system/pvt/brand/list");
    if (r.status === 401 || r.status === 403) {
      return { area: "Marcas", ok: false, detail: `sin permiso (${r.status})`, hint: "App Key necesita permiso Catalog - Read" };
    }
    if (r.error) return { area: "Marcas", ok: false, detail: r.error };
    const list = Array.isArray(r.data) ? r.data : [];
    if (list.length === 0) return { area: "Marcas", ok: true, detail: "sin marcas cargadas" };
    const brand = list[0];
    const checks: SubCheck[] = [
      { label: "Marcas encontradas", ok: list.length > 0, value: `${list.length}` },
      { label: "ID de marca", ok: !!brand.id },
      { label: "Nombre de marca", ok: !!brand.name, value: brand.name || "faltante" },
      { label: "Estado activo", ok: brand.isActive != null },
    ];
    const failed = checks.filter((c) => !c.ok);
    return {
      area: "Marcas",
      ok: failed.length === 0,
      detail: failed.length === 0 ? `${list.length} marcas con estructura completa` : `${failed.length}/${checks.length} fallaron`,
      subChecks: checks,
    };
  }

  // Probar las 6 áreas en paralelo
  const [ordersArea, catalogArea, pricingArea, logisticsInvArea, logisticsShipArea, brandsArea] = await Promise.all([
    testOrders(),
    testCatalog(),
    testPricing(),
    testInventory(),
    testShipping(),
    testBrands(),
  ]);

  const areasList: AreaCheck[] = [ordersArea, catalogArea, pricingArea, logisticsInvArea, logisticsShipArea, brandsArea];

  if (!ordersArea.ok && ordersArea.detail.includes(`no existe`)) {
    return { ok: false, detail: ordersArea.detail, hint: ordersArea.hint, areas: areasList };
  }

  const failing = areasList.filter((r) => !r.ok);
  const passing = areasList.filter((r) => r.ok);

  if (failing.length === 0) {
    return { ok: true, detail: `✅ 6 áreas OK con todos los campos validados`, areas: areasList };
  }

  if (!ordersArea.ok) {
    return { ok: false, detail: `❌ Ventas: ${ordersArea.detail}`, hint: ordersArea.hint, areas: areasList };
  }

  const firstHint = failing.find((r) => r.hint)?.hint;
  return {
    ok: false,
    detail: `⚠️ Parcial: ${passing.length}/${areasList.length} áreas OK`,
    hint: firstHint || "Revisar permisos o completar data en VTEX Admin.",
    areas: areasList,
  };
}

export async function testMetaAds(creds: any): Promise<TestResult> {
  const accessToken = (creds?.accessToken || creds?.token || "").trim();
  const adAccountId = (creds?.adAccountId || creds?.accountId || "").trim();

  if (!accessToken) {
    return { ok: false, detail: "Falta Access Token" };
  }

  const url = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&limit=50&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await resp.json();

    if (data?.error) {
      const code = data.error.code;
      const msg = data.error.message || "Error Meta API";
      if (code === 190) {
        return { ok: false, detail: "Access Token inválido o expirado", hint: "Permisos requeridos: ads_read + ads_management + business_management." };
      }
      return { ok: false, detail: msg };
    }

    const accounts = Array.isArray(data?.data) ? data.data : [];
    if (accounts.length === 0) {
      return { ok: false, detail: "Sin cuentas publicitarias accesibles" };
    }

    if (adAccountId) {
      const normalized = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
      const found = accounts.find((a: any) => a.id === normalized);
      if (!found) {
        return {
          ok: false,
          detail: `Ad Account ${adAccountId} no accesible`,
          hint: `Token tiene acceso a ${accounts.length} cuentas distintas.`,
        };
      }
      return { ok: true, detail: `Conectado a ${found.name || found.id}` };
    }

    return { ok: true, detail: `${accounts.length} cuenta${accounts.length === 1 ? "" : "s"} accesible${accounts.length === 1 ? "" : "s"}` };
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, detail: "Timeout (10s)" };
    }
    return { ok: false, detail: err?.message || "Error de red" };
  }
}

export async function testMetaPixel(creds: any): Promise<TestResult> {
  const pixelId = (creds?.pixelId || "").trim();
  const accessToken = (creds?.accessToken || creds?.token || "").trim();

  if (!pixelId) {
    return { ok: false, detail: "Falta Pixel ID" };
  }
  if (!/^\d+$/.test(pixelId)) {
    return { ok: false, detail: "Pixel ID inválido (debe ser numérico)" };
  }

  if (!accessToken) {
    return { ok: true, detail: "Pixel ID con formato válido (sin access token para validación full)" };
  }

  const url = `https://graph.facebook.com/v21.0/${pixelId}?fields=id,name,last_fired_time&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await resp.json();

    if (data?.error) {
      const code = data.error.code;
      if (code === 190) return { ok: false, detail: "Access Token inválido para este pixel" };
      if (code === 100 || data.error?.type === "GraphMethodException") {
        return { ok: false, detail: "Pixel ID no encontrado o sin acceso" };
      }
      return { ok: false, detail: data.error.message || "Error Meta API" };
    }

    const name = data?.name || pixelId;
    const lastFired = data?.last_fired_time;
    return {
      ok: true,
      detail: lastFired
        ? `Pixel "${name}" OK (último evento: ${new Date(lastFired).toLocaleDateString("es-AR")})`
        : `Pixel "${name}" OK (sin eventos recientes)`,
    };
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, detail: "Timeout (10s)" };
    }
    return { ok: false, detail: err?.message || "Error de red" };
  }
}

// ── MERCADOLIBRE ─────────────────────────────────────
// Test: refresh token si esta expirado + GET /users/me para validar auth
// Reusa el patron de getSellerToken pero sin persistir cambios.
export async function testMercadoLibre(creds: any): Promise<TestResult> {
  const accessToken = (creds?.accessToken || "").trim();
  const refreshToken = (creds?.refreshToken || "").trim();
  const appId = (creds?.appId || "").trim();
  const secretKey = (creds?.secretKey || "").trim();
  const expiresAt = creds?.tokenExpiresAt;

  if (!accessToken && !refreshToken) {
    return { ok: false, detail: "Sin tokens de OAuth", hint: "El cliente debe re-autorizar MercadoLibre desde el wizard." };
  }

  // Si esta expirado y hay refresh, intentar refresh primero
  let tokenToUse = accessToken;
  const expiredOrSoon = !expiresAt || Date.now() > (Number(expiresAt) - 60000);

  if (expiredOrSoon) {
    if (!refreshToken || !appId || !secretKey) {
      return { ok: false, detail: "Token expirado y sin refresh_token", hint: "El cliente debe re-autorizar MercadoLibre." };
    }
    try {
      const refreshRes = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: appId,
          client_secret: secretKey,
          refresh_token: refreshToken,
        }).toString(),
        signal: AbortSignal.timeout(10000),
      });
      if (!refreshRes.ok) {
        return { ok: false, detail: `Refresh fallo (HTTP ${refreshRes.status})`, hint: "El cliente debe re-autorizar MercadoLibre." };
      }
      const refreshData = await refreshRes.json();
      tokenToUse = refreshData.access_token;
    } catch (err: any) {
      return { ok: false, detail: "Error al refrescar token: " + (err?.message || "?") };
    }
  }

  // Test auth basica primero
  let nickname = "?";
  let userId: number | null = null;
  try {
    const resp = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${tokenToUse}` },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, detail: `Token rechazado (HTTP ${resp.status})`, hint: "Re-autorizar MercadoLibre." };
    }
    if (!resp.ok) {
      return { ok: false, detail: `Error HTTP ${resp.status}` };
    }
    const data = await resp.json();
    nickname = data?.nickname || "?";
    userId = data?.id;
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, detail: "Timeout en auth (10s)" };
    }
    return { ok: false, detail: err?.message || "Error de red en auth" };
  }

  if (!userId) {
    return { ok: false, detail: "No se pudo obtener userId", hint: "Re-autorizar MercadoLibre." };
  }

  // Helper MELI fetch
  async function mlFetch(path: string): Promise<{ status: number; data: any | null; error: string | null }> {
    try {
      const r = await fetch(`https://api.mercadolibre.com${path}`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
        signal: AbortSignal.timeout(10000),
      });
      let data: any = null;
      try { data = await r.json(); } catch { data = null; }
      return { status: r.status, data, error: r.ok ? null : `HTTP ${r.status}` };
    } catch (err: any) {
      const msg = err?.name === "TimeoutError" || err?.name === "AbortError" ? "timeout" : (err?.message || "error de red");
      return { status: 0, data: null, error: msg };
    }
  }

  type AreaResult = AreaCheck;

  async function testMLOrders(): Promise<AreaResult> {
    const list = await mlFetch(`/orders/search?seller=${userId}&limit=1&sort=date_desc`);
    if (list.status === 401 || list.status === 403) {
      return { area: "Ventas", ok: false, detail: `sin permiso (${list.status})`, hint: "Re-autorizar MELI con scope 'read'" };
    }
    if (list.error) return { area: "Ventas", ok: false, detail: list.error };
    const results = list.data?.results;
    if (!Array.isArray(results) || results.length === 0) {
      return { area: "Ventas", ok: true, detail: "cuenta sin ventas todavía" };
    }
    const o = results[0];
    const firstItem = o.order_items?.[0];
    const checks: SubCheck[] = [
      { label: "ID de orden", ok: !!o.id },
      { label: "Estado de orden", ok: !!o.status, value: o.status || "faltante" },
      { label: "Monto total", ok: o.total_amount != null, value: o.total_amount != null ? `$${o.total_amount}` : "faltante" },
      { label: "Items del pedido", ok: Array.isArray(o.order_items) && o.order_items.length > 0, value: `${o.order_items?.length || 0}` },
      { label: "Título de producto", ok: !!firstItem?.item?.title },
      { label: "Precio unitario", ok: firstItem?.unit_price != null },
      { label: "SKU del producto", ok: !!(firstItem?.item?.seller_sku || firstItem?.item?.id) },
      { label: "Datos del comprador", ok: !!(o.buyer || o.buyer_id) },
      { label: "pack_id (si es carrito)", ok: true, value: o.pack_id ? String(o.pack_id) : "sin pack (venta individual)" },
    ];
    const failed = checks.filter((c) => !c.ok);
    return {
      area: "Ventas",
      ok: failed.length === 0,
      detail: failed.length === 0 ? `${checks.length} checks OK` : `${failed.length}/${checks.length} fallaron`,
      subChecks: checks,
    };
  }

  async function testMLListings(): Promise<AreaResult> {
    const list = await mlFetch(`/users/${userId}/items/search?limit=1&status=active`);
    if (list.status === 401 || list.status === 403) {
      return { area: "Publicaciones", ok: false, detail: `sin permiso (${list.status})`, hint: "Re-autorizar MELI con scope 'read'" };
    }
    if (list.error) return { area: "Publicaciones", ok: false, detail: list.error };
    const ids = list.data?.results || [];
    if (!Array.isArray(ids) || ids.length === 0) {
      return { area: "Publicaciones", ok: true, detail: "sin publicaciones activas" };
    }
    const det = await mlFetch(`/items/${ids[0]}`);
    if (det.error) return { area: "Publicaciones", ok: false, detail: `detalle falló (${det.error})` };
    const item = det.data;
    const checks: SubCheck[] = [
      { label: "Título", ok: !!item?.title, value: item?.title || "faltante" },
      { label: "Precio", ok: item?.price != null, value: item?.price != null ? `$${item.price}` : "faltante" },
      { label: "Estado", ok: !!item?.status, value: item?.status || "faltante" },
      { label: "Stock disponible", ok: item?.available_quantity != null, value: String(item?.available_quantity ?? "faltante") },
      { label: "Cantidad vendida", ok: item?.sold_quantity != null, value: String(item?.sold_quantity ?? "faltante") },
      { label: "Imagen (thumbnail)", ok: !!item?.thumbnail || (item?.pictures?.length > 0) },
      { label: "Link (permalink)", ok: !!item?.permalink },
      { label: "Condición (nuevo/usado)", ok: !!item?.condition, value: item?.condition || "faltante" },
    ];
    const failed = checks.filter((c) => !c.ok);
    return {
      area: "Publicaciones",
      ok: failed.length === 0,
      detail: failed.length === 0 ? `${checks.length} checks OK` : `${failed.length}/${checks.length} fallaron`,
      subChecks: checks,
    };
  }

  async function testMLQuestions(): Promise<AreaResult> {
    const r = await mlFetch(`/my/received_questions/search?limit=1`);
    if (r.status === 401 || r.status === 403) {
      return { area: "Preguntas", ok: false, detail: `sin permiso (${r.status})`, hint: "Re-autorizar MELI (scope 'read')" };
    }
    if (r.error) return { area: "Preguntas", ok: false, detail: r.error };
    const qs = r.data?.questions;
    if (!Array.isArray(qs) || qs.length === 0) {
      return { area: "Preguntas", ok: true, detail: "sin preguntas recibidas" };
    }
    const q = qs[0];
    const checks: SubCheck[] = [
      { label: "ID de pregunta", ok: !!q.id },
      { label: "Texto de la pregunta", ok: !!q.text },
      { label: "Estado", ok: !!q.status, value: q.status || "faltante" },
      { label: "Producto asociado", ok: !!q.item_id },
    ];
    const failed = checks.filter((c) => !c.ok);
    return {
      area: "Preguntas",
      ok: failed.length === 0,
      detail: failed.length === 0 ? `${checks.length} checks OK` : `${failed.length}/${checks.length} fallaron`,
      subChecks: checks,
    };
  }

  async function testMLReputation(): Promise<AreaResult> {
    const r = await mlFetch(`/users/${userId}`);
    if (r.status === 401 || r.status === 403) {
      return { area: "Reputación", ok: false, detail: `sin permiso (${r.status})` };
    }
    if (r.error) return { area: "Reputación", ok: false, detail: r.error };
    const rep = r.data?.seller_reputation;
    if (!rep) return { area: "Reputación", ok: true, detail: "usuario sin perfil de vendedor" };
    const checks: SubCheck[] = [
      { label: "Nivel de reputación", ok: !!(rep.level_id || rep.power_seller_status), value: rep.level_id || rep.power_seller_status || "faltante" },
      { label: "Transacciones totales", ok: !!rep.transactions, value: rep.transactions?.total != null ? String(rep.transactions.total) : "faltante" },
      { label: "Completadas", ok: rep.transactions?.completed != null, value: String(rep.transactions?.completed ?? "n/a") },
      { label: "Canceladas", ok: rep.transactions?.canceled != null, value: String(rep.transactions?.canceled ?? "n/a") },
      { label: "Power seller", ok: true, value: rep.power_seller_status || "no aplicable" },
    ];
    const failed = checks.filter((c) => !c.ok);
    return {
      area: "Reputación",
      ok: failed.length === 0,
      detail: failed.length === 0 ? `${checks.length} checks OK` : `${failed.length}/${checks.length} fallaron`,
      subChecks: checks,
    };
  }

  const [ordersArea, listingsArea, questionsArea, reputationArea] = await Promise.all([
    testMLOrders(),
    testMLListings(),
    testMLQuestions(),
    testMLReputation(),
  ]);

  const areasList: AreaCheck[] = [ordersArea, listingsArea, questionsArea, reputationArea];
  const failing = areasList.filter((r) => !r.ok);
  const passing = areasList.filter((r) => r.ok);

  if (failing.length === 0) {
    return {
      ok: true,
      detail: `✅ Conectado como "${nickname}" (ID ${userId}) · 4 áreas OK con todos los campos validados`,
      areas: areasList,
    };
  }

  const firstHint = failing.find((r) => r.hint)?.hint;
  return {
    ok: false,
    detail: `⚠️ Conectado como "${nickname}" pero ${passing.length}/4 áreas OK`,
    hint: firstHint || "El cliente debe re-autorizar MercadoLibre con todos los permisos desde el wizard.",
    areas: areasList,
  };
}

// ── GOOGLE ADS ──────────────────────────────────────
// Test: refresh OAuth + listAccessibleCustomers
export async function testGoogleAds(creds: any): Promise<TestResult> {
  const clientId = (creds?.clientId || "").trim();
  const clientSecret = (creds?.clientSecret || "").trim();
  const refreshToken = (creds?.refreshToken || "").trim();
  const developerToken = (creds?.developerToken || "").trim();
  const customerId = (creds?.customerId || "").replace(/-/g, "").trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, detail: "Faltan credenciales OAuth (clientId/clientSecret/refreshToken)" };
  }
  if (!developerToken) {
    return { ok: false, detail: "Falta developer_token", hint: "Se pide en https://ads.google.com/aw/apicenter" };
  }

  // Refresh token
  let accessToken = "";
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenRes.ok) {
      return { ok: false, detail: `OAuth refresh falló (${tokenRes.status})`, hint: "Re-autorizar Google Ads." };
    }
    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
  } catch (err: any) {
    return { ok: false, detail: "Error en OAuth refresh: " + (err?.message || "?") };
  }

  // Test: listAccessibleCustomers
  try {
    const resp = await fetch("https://googleads.googleapis.com/v16/customers:listAccessibleCustomers", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 401) {
        return { ok: false, detail: "Token rechazado por Google Ads API", hint: "Re-autorizar." };
      }
      if (resp.status === 403) {
        return { ok: false, detail: "Developer token sin permisos", hint: msg };
      }
      return { ok: false, detail: msg };
    }
    const data = await resp.json();
    const resources: string[] = data?.resourceNames || [];
    if (resources.length === 0) {
      return { ok: false, detail: "Sin cuentas de Google Ads accesibles" };
    }
    if (customerId) {
      const found = resources.some((r) => r.includes(customerId));
      if (!found) {
        return { ok: false, detail: `Customer ${customerId} no está en cuentas accesibles`, hint: `${resources.length} cuentas disponibles.` };
      }
      return { ok: true, detail: `Customer ${customerId} accesible (de ${resources.length} cuentas total)` };
    }
    return { ok: true, detail: `${resources.length} cuenta${resources.length === 1 ? "" : "s"} accesible${resources.length === 1 ? "" : "s"}` };
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, detail: "Timeout (10s)" };
    }
    return { ok: false, detail: err?.message || "Error de red" };
  }
}

// ── GOOGLE SEARCH CONSOLE ───────────────────────────
// Test: JWT con service account + sites.list
// Acepta tanto service account (legacy) como OAuth refresh_token (nuevo)
export async function testGSC(creds: any): Promise<TestResult> {
  // Variante 1: Service Account (JWT)
  if (creds?.client_email && creds?.private_key) {
    try {
      const crypto = await import("crypto");
      const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      const claim = Buffer.from(JSON.stringify({
        iss: creds.client_email,
        scope: "https://www.googleapis.com/auth/webmasters.readonly",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      })).toString("base64url");
      const signInput = header + "." + claim;
      const sign = crypto.createSign("RSA-SHA256");
      sign.update(signInput);
      const signature = sign.sign(creds.private_key, "base64url");
      const jwt = signInput + "." + signature;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt,
        signal: AbortSignal.timeout(10000),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        return { ok: false, detail: "JWT auth falló", hint: tokenData?.error_description || "Verificar client_email y private_key." };
      }

      const sitesRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!sitesRes.ok) return { ok: false, detail: `sites.list falló (HTTP ${sitesRes.status})` };
      const sitesData = await sitesRes.json();
      const sites = sitesData?.siteEntry || [];
      if (sites.length === 0) {
        return { ok: false, detail: "Sin sites accesibles", hint: "Compartir el site con la service account en GSC." };
      }
      return { ok: true, detail: `${sites.length} site${sites.length === 1 ? "" : "s"} accesible${sites.length === 1 ? "" : "s"} (service account)` };
    } catch (err: any) {
      return { ok: false, detail: err?.message || "Error en JWT auth" };
    }
  }

  // Variante 2: OAuth user (refresh_token)
  const clientId = (creds?.clientId || "").trim();
  const clientSecret = (creds?.clientSecret || "").trim();
  const refreshToken = (creds?.refreshToken || "").trim();
  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, detail: "Faltan credenciales (service account O OAuth)" };
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenRes.ok) {
      return { ok: false, detail: `OAuth refresh falló (${tokenRes.status})` };
    }
    const tokenData = await tokenRes.json();

    const sitesRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!sitesRes.ok) return { ok: false, detail: `sites.list falló (HTTP ${sitesRes.status})` };
    const sitesData = await sitesRes.json();
    const sites = sitesData?.siteEntry || [];
    return { ok: true, detail: `${sites.length} site${sites.length === 1 ? "" : "s"} accesible${sites.length === 1 ? "" : "s"} (OAuth)` };
  } catch (err: any) {
    return { ok: false, detail: err?.message || "Error de red" };
  }
}

// ── NITROPIXEL ──────────────────────────────────────
// No es API externa — chequea la DB para ver si el pixel disparo
// eventos en las ultimas 48hs. Recibe orgId (no credentials).
export async function testNitroPixel(orgId: string, prismaClient: any): Promise<TestResult> {
  if (!orgId) return { ok: false, detail: "Falta orgId" };
  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS c FROM "pixel_events" WHERE "organizationId" = $1 AND "eventTime" >= $2`,
      orgId,
      since
    );
    const count = Number(rows?.[0]?.c || 0);
    if (count === 0) {
      return {
        ok: false,
        detail: "Sin eventos en las últimas 48hs",
        hint: "Verificar que el snippet esté instalado en el <head> del sitio.",
      };
    }
    return { ok: true, detail: `${count.toLocaleString("es-AR")} eventos detectados últimas 48hs` };
  } catch (err: any) {
    return { ok: false, detail: err?.message || "Error consultando DB" };
  }
}

export async function testCredentialsByPlatform(platform: string, credentials: any): Promise<TestResult> {
  switch (platform.toUpperCase()) {
    case "VTEX":
      return testVtex(credentials);
    case "META_ADS":
      return testMetaAds(credentials);
    case "META_PIXEL":
      return testMetaPixel(credentials);
    case "MERCADOLIBRE":
      return testMercadoLibre(credentials);
    case "GOOGLE_ADS":
      return testGoogleAds(credentials);
    case "GOOGLE_SEARCH_CONSOLE":
    case "GSC":
      return testGSC(credentials);
    default:
      return { ok: false, detail: `Plataforma "${platform}" desconocida` };
  }
}
