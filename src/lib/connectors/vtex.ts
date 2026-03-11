// ══════════════════════════════════════════════
// Conector de VTEX
// ══════════════════════════════════════════════
// Este archivo se conecta a la API de VTEX y trae los datos
// de órdenes, productos y clientes.

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

  // ── Órdenes ──
  async fetchOrders(params: {
    from: string;    // "2024-01-01"
    to: string;      // "2024-01-31"
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

  // Detalle de una orden específica
  async fetchOrderDetail(orderId: string): Promise<VtexOrder> {
    const url = `${this.baseUrl}/api/oms/pvt/orders/${orderId}`;
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`VTEX order detail error: ${response.status}`);
    }
    return response.json();
  }

  // ── Productos ──
  async fetchProducts(params: {
    from?: number;
    to?: number;
  }): Promise<any[]> {
    const { from = 1, to = 50 } = params;
    // Primero obtenemos los IDs
    const url = `${this.baseUrl}/api/catalog_system/pvt/products/GetProductAndSkuIds?categoryId=&_from=${from}&_to=${to}`;
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`VTEX products error: ${response.status}`);
    }
    const data = await response.json();

    // Después el detalle de cada producto
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

  // ── Clientes (via órdenes) ──
  // VTEX no tiene un endpoint directo de clientes en la API de OMS,
  // los extraemos de las órdenes
  extractCustomerFromOrder(order: VtexOrder) {
    const profile = order.clientProfileData;
    if (!profile) return null;
    return {
      externalId: profile.userProfileId || profile.email,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      // La geo viene del shipping
      city: order.shippingData?.address?.city,
      state: order.shippingData?.address?.state,
      country: order.shippingData?.address?.country,
    };
  }

  // ── Test de conexión ──
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
