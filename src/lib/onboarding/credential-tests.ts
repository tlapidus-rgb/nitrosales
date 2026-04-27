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

export async function testVtex(creds: any, options?: { testSku?: string }): Promise<TestResult> {
  const accountName = (creds?.accountName || "").trim();
  const appKey = (creds?.appKey || "").trim();
  const appToken = (creds?.appToken || "").trim();

  if (!accountName || !appKey || !appToken) {
    return { ok: false, detail: "Faltan campos obligatorios", hint: "Account Name, App Key y App Token son requeridos." };
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(accountName)) {
    return { ok: false, detail: "Account Name inválido", hint: "Solo letras, números y guiones. Sin https:// ni .myvtex.com" };
  }
  // Caso real S58: appToken truncado al copy-paste (12 chars en vez de 60+).
  // Detectar y fallar rapido con mensaje accionable antes de probar las 6 areas.
  if (appToken.length < 40) {
    return {
      ok: false,
      detail: `App Token parece incompleto (${appToken.length} caracteres)`,
      hint: "El App Token de VTEX tiene 60+ caracteres. Volvé a tu admin VTEX, copialo COMPLETO sin cortar, y pegalo de nuevo en el wizard. Es la causa #1 de errores 401.",
    };
  }
  if (appKey.length < 20) {
    return {
      ok: false,
      detail: `App Key parece incompleta (${appKey.length} caracteres)`,
      hint: "La App Key de VTEX empieza con 'vtexappkey-' y tiene 30+ caracteres. Verificá que la copiaste completa.",
    };
  }

  const headers = {
    "X-VTEX-API-AppKey": appKey,
    "X-VTEX-API-AppToken": appToken,
    Accept: "application/json",
  };
  const base = `https://${accountName}.vtexcommercestable.com.br`;

  // Helper de fetch con timeout + interpretacion de status
  async function vtexFetch(path: string, method: string = "GET", body?: any): Promise<{ status: number; data: any | null; error: string | null }> {
    try {
      const init: RequestInit = { method, headers, signal: AbortSignal.timeout(10000) };
      if (body) {
        init.body = JSON.stringify(body);
        (init.headers as any)["Content-Type"] = "application/json";
      }
      const r = await fetch(`${base}${path}`, init);
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

  // Obtener 5 SKUs de VENTAS RECIENTES (100% productos activos, que se venden).
  // Esto evita muestrear productos inactivos/en catalogación del primer page.
  async function getRealSoldSkus(): Promise<string[]> {
    if (options?.testSku) return [options.testSku];
    const ordersRes = await vtexFetch("/api/oms/pvt/orders?per_page=5&orderBy=creationDate,desc");
    const orderIds = (ordersRes.data?.list || []).map((o: any) => o.orderId).filter(Boolean);
    const soldSkus = new Set<string>();
    for (const oid of orderIds.slice(0, 5)) {
      if (soldSkus.size >= 5) break;
      const det = await vtexFetch(`/api/oms/pvt/orders/${oid}`);
      for (const it of (det.data?.items || [])) {
        const sku = String(it.id || it.productId || "");
        if (sku) soldSkus.add(sku);
        if (soldSkus.size >= 5) break;
      }
    }
    return Array.from(soldSkus).slice(0, 5);
  }
  const realSkus = await getRealSoldSkus();

  async function testCatalog(): Promise<AreaResult> {
    let searchPath: string;
    if (realSkus.length > 0) {
      // Buscar los SKUs reales en el catalog
      const skuFq = realSkus.map((s) => `fq=skuId:${s}`).join("&");
      searchPath = `/api/catalog_system/pub/products/search?${skuFq}`;
    } else {
      // Fallback: primeros del catalog (cuenta sin ventas todavia)
      searchPath = "/api/catalog_system/pub/products/search?_from=0&_to=4";
    }
    const search = await vtexFetch(searchPath);
    if (search.status === 401 || search.status === 403) {
      return { area: "Catálogo", ok: false, detail: `sin permiso (${search.status})`, hint: "App Key necesita permiso Catalog - Read" };
    }
    if (!Array.isArray(search.data) || search.data.length === 0) {
      return { area: "Catálogo", ok: true, detail: "sin productos cargados todavía" };
    }
    const prods = search.data;
    const N = prods.length;
    // Contar cuantos tienen cada campo
    let countName = 0, countBrand = 0, countCategory = 0, countSku = 0, countImage = 0, countEan = 0, countRef = 0;
    for (const prod of prods) {
      const sku = prod.items?.[0] || {};
      if (prod.productName || prod.productTitle) countName++;
      if (prod.brand) countBrand++;
      if (prod.categoryId || prod.categories?.length) countCategory++;
      if (sku.itemId) countSku++;
      if (Array.isArray(sku.images) && sku.images.length > 0) countImage++;
      if (sku.ean) countEan++;
      if (sku.referenceId?.[0]?.Value) countRef++;
    }
    const checks: SubCheck[] = [
      { label: "Nombre de producto", ok: countName === N, value: `${countName}/${N}` },
      { label: "Marca", ok: countBrand === N, value: `${countBrand}/${N}` },
      { label: "Categoría", ok: countCategory === N, value: `${countCategory}/${N}` },
      { label: "SKU variante", ok: countSku === N, value: `${countSku}/${N}` },
      { label: "Imagen", ok: countImage === N, value: `${countImage}/${N}` },
      { label: "EAN / código de barras", ok: countEan === N, value: `${countEan}/${N}`, optional: true },
      { label: "Referencia / SKU real", ok: countRef === N, value: `${countRef}/${N}` },
    ];
    const failed = checks.filter((c) => !c.ok && !c.optional);
    const hasWarnings = checks.some((c) => (c.optional && !c.ok));
    return {
      area: "Catálogo",
      ok: failed.length === 0,
      detail: failed.length === 0 ? `${N} SKUs validados · ${checks.length} checks OK` : `${N} SKUs validados · ${failed.length} campos fallaron`,
      subChecks: checks,
      hasWarnings,
    };
  }

  async function testPricing(): Promise<AreaResult> {
    const skusToCheck: string[] = realSkus.length > 0 ? realSkus : [];
    if (skusToCheck.length === 0) {
      return { area: "Precios", ok: true, detail: "sin SKUs disponibles para validar" };
    }

    // VTEX 3 fuentes de precio:
    //  1. Checkout Simulation → items[0].price/listPrice = PRECIO REAL que ve
    //     el cliente en la tienda (política comercial + promos aplicadas).
    //     ESTE es el más confiable para "precio al cliente".
    //  2. Catalog Search → sellers[0].commertialOffer → fallback (a veces no
    //     trae offer si el producto está en otro sales channel).
    //  3. Pricing API → costPrice = costo interno del producto.
    const [priceResults, catalogResults, simulationResults] = await Promise.all([
      Promise.all(skusToCheck.map((sku) => vtexFetch(`/api/pricing/prices/${sku}?_forceGet=true`))),
      Promise.all(skusToCheck.map((sku) => vtexFetch(`/api/catalog_system/pub/products/search?fq=skuId:${encodeURIComponent(sku)}&sc=1`))),
      Promise.all(skusToCheck.map((sku) => vtexFetch(
        `/api/checkout/pub/orderForms/simulation?sc=1`,
        "POST",
        { items: [{ id: String(sku), quantity: 1, seller: "1" }], country: "ARG" },
      ))),
    ]);

    const forbidden = priceResults.filter((r) => r.status === 401 || r.status === 403).length;
    if (forbidden === priceResults.length) {
      return { area: "Precios", ok: false, detail: `sin permiso (${priceResults[0].status})`, hint: "App Key necesita permiso Pricing - Read" };
    }

    const N = skusToCheck.length;

    // Extraer precio real del simulation (fuente primaria)
    const simOffers: Array<{ price: number | null; listPrice: number | null; simError: string | null }> = simulationResults.map((sr) => {
      if (sr.error || !sr.data) return { price: null, listPrice: null, simError: sr.error || "sin data" };
      const it = sr.data?.items?.[0];
      if (!it) return { price: null, listPrice: null, simError: "simulation sin items" };
      return {
        price: typeof it.price === "number" ? it.price / 100 : null,
        listPrice: typeof it.listPrice === "number" ? it.listPrice / 100 : null,
        simError: null,
      };
    });

    // Fallback: catalog search por si simulation falla
    const catalogOffers: Array<any | null> = catalogResults.map((catRes, i) => {
      if (!catRes.data || !Array.isArray(catRes.data) || catRes.data.length === 0) return null;
      const prod = catRes.data[0];
      const sku = skusToCheck[i];
      const item = (prod.items || []).find((it: any) => String(it.itemId) === String(sku)) || prod.items?.[0];
      return item?.sellers?.[0]?.commertialOffer || null;
    });

    let countWithRealPrice = 0;
    let countWithListPrice = 0;
    let countWithCost = 0;
    let countReachablePricing = 0;

    for (let i = 0; i < N; i++) {
      const sim = simOffers[i];
      const co = catalogOffers[i];
      const pr = priceResults[i];
      // Precio: prefiere simulation, fallback catalog
      const price = sim.price != null ? sim.price : (co?.Price != null ? Number(co.Price) : null);
      const listPrice = sim.listPrice != null ? sim.listPrice : (co?.ListPrice != null ? Number(co.ListPrice) : null);
      if (price != null && price > 0) countWithRealPrice++;
      if (listPrice != null && listPrice > 0 && listPrice > (price || 0)) countWithListPrice++;
      if (pr.status === 404 || pr.status === 200) countReachablePricing++;
      if (pr.data?.costPrice != null) countWithCost++;
    }

    const checks: SubCheck[] = [
      {
        label: "Precio al cliente (Catalog)",
        ok: countWithRealPrice >= Math.ceil(N / 2),
        value: `${countWithRealPrice}/${N}`,
      },
      {
        label: "Precio tachado (ListPrice)",
        ok: countWithListPrice >= 1,
        value: `${countWithListPrice}/${N}`,
        optional: true,
      },
      {
        label: "Costo del producto (Pricing)",
        ok: countWithCost >= Math.ceil(N / 2),
        value: `${countWithCost}/${N}`,
      },
      {
        label: "Pricing API accesible",
        ok: countReachablePricing === N,
        value: `${countReachablePricing}/${N}`,
        optional: true,
      },
    ];

    // Desglose por SKU mostrando TODAS las fuentes para diagnostico
    for (let i = 0; i < skusToCheck.length; i++) {
      const sku = skusToCheck[i];
      const sim = simOffers[i];
      const co = catalogOffers[i];
      const pr = priceResults[i];
      const parts: string[] = [];
      // Simulation (fuente primaria)
      if (sim.price != null) {
        parts.push(`sim.precio=${sim.price}`);
        if (sim.listPrice != null) parts.push(`sim.tachado=${sim.listPrice}`);
      } else {
        parts.push(`sim=falló(${sim.simError || "?"})`);
      }
      // Catalog (fallback)
      if (co) {
        parts.push(`cat.precio=${co.Price ?? "null"}`);
        parts.push(`cat.tachado=${co.ListPrice ?? "null"}`);
      } else {
        parts.push(`cat=sin offer`);
      }
      // Pricing (costo)
      if (pr.status === 404) parts.push(`cost=404`);
      else if (pr.data) parts.push(`cost=${pr.data.costPrice ?? "null"}`);
      else parts.push(`cost=error`);
      const hasAnyPrice = sim.price != null || co?.Price != null;
      checks.push({
        label: `SKU ${sku}`,
        ok: hasAnyPrice,
        value: parts.join(" · "),
        optional: true,
      });
    }

    const failed = checks.filter((c) => !c.ok && !c.optional);
    const hasWarnings = checks.some((c) => c.optional && !c.ok);
    return {
      area: "Precios",
      ok: failed.length === 0,
      detail: failed.length === 0
        ? `${N} SKUs validados · campos llegan correctamente`
        : `${N} SKUs validados · ${failed.length} campos críticos no llegan`,
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
    // Traemos 5 ventas reales y validamos los MISMOS campos que el backfill
    // va a usar al enriquecer (customer + items + thumbnail + etc).
    // Si las 5 pasan → credenciales + logica + backfill van a funcionar.
    const SAMPLE = 5;
    const list = await mlFetch(`/orders/search?seller=${userId}&limit=${SAMPLE}&sort=date_desc`);
    if (list.status === 401 || list.status === 403) {
      return { area: "Ventas", ok: false, detail: `sin permiso (${list.status})`, hint: "Re-autorizar MELI con scope 'read'" };
    }
    if (list.error) return { area: "Ventas", ok: false, detail: list.error };
    const results = list.data?.results;
    if (!Array.isArray(results) || results.length === 0) {
      return { area: "Ventas", ok: true, detail: "cuenta sin ventas todavía" };
    }

    // Por cada campo critico, cuento en cuantas de las N ordenes vino presente.
    // "ok" requiere que TODAS las muestras lo tengan (salvo los opcionales).
    const n = results.length;
    const tally = {
      id: 0, status: 0, total: 0, items: 0, title: 0, unitPrice: 0, sku: 0,
      buyer: 0, buyerName: 0, thumbnail: 0, category: 0, shipping: 0,
    };
    const firstMissing: string[] = [];
    for (let idx = 0; idx < results.length; idx++) {
      const o = results[idx];
      const firstItem = o.order_items?.[0];
      const mlItem = firstItem?.item || {};
      const missing: string[] = [];

      if (o.id) tally.id++; else missing.push("id");
      if (o.status) tally.status++; else missing.push("status");
      if (o.total_amount != null) tally.total++; else missing.push("total");
      if (Array.isArray(o.order_items) && o.order_items.length > 0) tally.items++; else missing.push("items");
      if (mlItem.title) tally.title++; else missing.push("title");
      if (firstItem?.unit_price != null) tally.unitPrice++; else missing.push("unitPrice");
      if (mlItem.seller_sku || mlItem.id) tally.sku++; else missing.push("sku");
      if (o.buyer?.id || o.buyer_id) tally.buyer++; else missing.push("buyer.id");
      if (o.buyer?.first_name || o.buyer?.nickname) tally.buyerName++;
      if (mlItem.thumbnail) tally.thumbnail++;
      if (mlItem.category_id) tally.category++;
      if (o.shipping?.receiver_address) tally.shipping++;

      if (missing.length > 0 && firstMissing.length < 2) {
        firstMissing.push(`orden ${o.id || idx}: ${missing.join(",")}`);
      }
    }

    const full = (count: number) => count === n;
    const most = (count: number) => count >= Math.ceil(n * 0.6); // al menos 60% lo tiene
    const checks: SubCheck[] = [
      { label: `ID de orden (${tally.id}/${n})`, ok: full(tally.id) },
      { label: `Estado (${tally.status}/${n})`, ok: full(tally.status) },
      { label: `Monto total (${tally.total}/${n})`, ok: full(tally.total) },
      { label: `Items del pedido (${tally.items}/${n})`, ok: full(tally.items) },
      { label: `Título de producto (${tally.title}/${n})`, ok: full(tally.title) },
      { label: `Precio unitario (${tally.unitPrice}/${n})`, ok: full(tally.unitPrice) },
      { label: `SKU del producto (${tally.sku}/${n})`, ok: full(tally.sku) },
      { label: `ID del comprador (${tally.buyer}/${n})`, ok: full(tally.buyer) },
      // Opcionales/warnings: ML enmascara algunos datos. Si faltan parcialmente,
      // el backfill igual funciona pero con menos informacion del cliente.
      { label: `Nombre del comprador (${tally.buyerName}/${n})`, ok: most(tally.buyerName), optional: !most(tally.buyerName), warning: !full(tally.buyerName) && most(tally.buyerName) },
      { label: `Imagen del producto (${tally.thumbnail}/${n})`, ok: most(tally.thumbnail), warning: !full(tally.thumbnail) && most(tally.thumbnail), optional: !most(tally.thumbnail) },
      { label: `Categoría (${tally.category}/${n})`, ok: most(tally.category), optional: !most(tally.category) },
      { label: `Dirección de envío (${tally.shipping}/${n})`, ok: most(tally.shipping), optional: !most(tally.shipping) },
    ];
    const failed = checks.filter((c) => !c.ok && !c.optional);
    const hasWarnings = checks.some((c) => c.warning || (c.optional && !c.ok));
    return {
      area: "Ventas",
      ok: failed.length === 0,
      detail: failed.length === 0
        ? `${n} ventas probadas, ${checks.filter(c => c.ok).length}/${checks.length} checks OK`
        : `${failed.length}/${checks.length} campos fallaron (${firstMissing.join(" | ") || "ver subChecks"})`,
      subChecks: checks,
      hasWarnings,
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
//
// S58 FIX: el cliente solo carga customerId (+ loginCustomerId opcional) en el
// wizard. clientId/clientSecret/developerToken son env vars del servidor (la
// app OAuth de NitroSales). refreshToken se obtiene cuando el cliente completa
// OAuth post-wizard. Antes el test pedia los 5 al cliente y siempre fallaba
// con "faltan credenciales OAuth" aunque el cliente cargara customerId — ahora
// lee del env + acepta snake_case fallback en creds.
export async function testGoogleAds(creds: any): Promise<TestResult> {
  const clientId = (process.env.GOOGLE_ADS_CLIENT_ID || creds?.clientId || "").trim();
  const clientSecret = (process.env.GOOGLE_ADS_CLIENT_SECRET || creds?.clientSecret || "").trim();
  const refreshToken = (creds?.refreshToken || creds?.refresh_token || "").trim();
  const developerToken = (process.env.GOOGLE_ADS_DEVELOPER_TOKEN || creds?.developerToken || "").trim();
  const customerId = (creds?.customerId || creds?.customer_id || "").replace(/-/g, "").trim();

  if (!customerId) {
    return { ok: false, detail: "Falta Customer ID (10 digitos)" };
  }
  if (!refreshToken) {
    return {
      ok: false,
      detail: "OAuth pendiente — falta autorizar Google Ads",
      hint: "El cliente debe completar OAuth en /settings/integraciones (login oficial de Google).",
    };
  }
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      detail: "Server config incompleta",
      hint: "Faltan env vars GOOGLE_ADS_CLIENT_ID y/o GOOGLE_ADS_CLIENT_SECRET en Vercel.",
    };
  }
  if (!developerToken) {
    return {
      ok: false,
      detail: "Server config incompleta",
      hint: "Falta env var GOOGLE_ADS_DEVELOPER_TOKEN en Vercel.",
    };
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
    // S58 FIX: la columna correcta del schema es "receivedAt" (cuando el server recibio
    // el evento). Antes estaba "eventTime" que NO existe → query fallaba con 42703.
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS c FROM "pixel_events" WHERE "organizationId" = $1 AND "receivedAt" >= $2`,
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

export async function testCredentialsByPlatform(platform: string, credentials: any, options?: { vtexTestSku?: string }): Promise<TestResult> {
  switch (platform.toUpperCase()) {
    case "VTEX":
      return testVtex(credentials, options?.vtexTestSku ? { testSku: options.vtexTestSku } : undefined);
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
