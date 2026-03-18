import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const revalidate = 0;

const ORG_ID = "cmmmga1uq0000sb43w0krvvys";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");
    const dateTo = toParam ? new Date(toParam + "T23:59:59.999-03:00") : now;
    const dateFrom = fromParam ? new Date(fromParam + "T00:00:00.000-03:00") : new Date(now.getTime() - 365 * MS_PER_DAY);
    const sourceParam = searchParams.get("source")?.toUpperCase();
    const sourceFilter = sourceParam && sourceParam !== "ALL" ? sourceParam : null;
    const srcWhere = sourceFilter ? `AND o."source" = '${sourceFilter}'` : "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const periodMs = dateTo.getTime() - dateFrom.getTime();
    const prevFrom = new Date(dateFrom.getTime() - periodMs);
    const prevTo = new Date(dateFrom.getTime() - 1);

    const [currentKpis, prevKpis, repeatData, rfmSegments, frequencyDist, topCities, customerTable, totalCount] = await Promise.all([
      prisma.$queryRawUnsafe<[{total:string;total_spent:string}]>(`SELECT COUNT(DISTINCT o."customerId")::text AS total, COALESCE(SUM(o."totalValue"),0)::text AS total_spent FROM orders o WHERE o."organizationId"='${ORG_ID}' AND o."orderDate">=$1 AND o."orderDate"<=$2 AND o.status NOT IN('CANCELLED','RETURNED') AND o."customerId" IS NOT NULL ${srcWhere}`, dateFrom, dateTo),
      prisma.$queryRawUnsafe<[{total:string;total_spent:string}]>(`SELECT COUNT(DISTINCT o."customerId")::text AS total, COALESCE(SUM(o."totalValue"),0)::text AS total_spent FROM orders o WHERE o."organizationId"='${ORG_ID}' AND o."orderDate">=$1 AND o."orderDate"<=$2 AND o.status NOT IN('CANCELLED','RETURNED') AND o."customerId" IS NOT NULL ${srcWhere}`, prevFrom, prevTo),
      prisma.$queryRawUnsafe<[{total:string;repeat_customers:string;avg_orders:string}]>(`WITH co AS (SELECT o."customerId",COUNT(*)::int AS cnt FROM orders o WHERE o."organizationId"='${ORG_ID}' AND o."orderDate">=$1 AND o."orderDate"<=$2 AND o.status NOT IN('CANCELLED','RETURNED') AND o."customerId" IS NOT NULL ${srcWhere} GROUP BY o."customerId") SELECT COUNT(*)::text AS total, COUNT(*) FILTER(WHERE cnt>1)::text AS repeat_customers, COALESCE(AVG(cnt),0)::text AS avg_orders FROM co`, dateFrom, dateTo),
      prisma.$queryRawUnsafe<Array<{segment:string;customers:string;revenue:string}>>(`WITH lifetime AS (SELECT o."customerId",COUNT(*)::int AS orders,SUM(o."totalValue") AS revenue,EXTRACT(DAY FROM NOW()-MAX(o."orderDate"))::int AS recency FROM orders o WHERE o."organizationId"='${ORG_ID}' AND o.status NOT IN('CANCELLED','RETURNED') AND o."customerId" IS NOT NULL GROUP BY o."customerId"), period_customers AS (SELECT DISTINCT o."customerId" FROM orders o WHERE o."organizationId"='${ORG_ID}' AND o."orderDate">=$1 AND o."orderDate"<=$2 AND o.status NOT IN('CANCELLED','RETURNED') AND o."customerId" IS NOT NULL ${srcWhere}) SELECT CASE WHEN l.recency<=30 AND l.orders>=4 THEN 'Champions' WHEN l.orders>=4 THEN 'Leales' WHEN l.recency<=30 AND l.orders=1 THEN 'Nuevos' WHEN l.recency<=60 AND l.orders>=2 THEN 'Potenciales' WHEN l.recency>90 AND l.orders>=2 THEN 'En riesgo' WHEN l.recency>180 THEN 'Perdidos' ELSE 'Ocasionales' END AS segment, COUNT(*)::text AS customers, COALESCE(SUM(l.revenue),0)::text AS revenue FROM lifetime l JOIN period_customers pc ON pc."customerId"=l."customerId" GROUP BY 1 ORDER BY SUM(l.revenue) DESC`, dateFrom, dateTo),
      prisma.$queryRawUnsafe<Array<{bucket:string;customers:string;revenue:string}>>(`WITH co AS (SELECT o."customerId",COUNT(*)::int AS cnt,SUM(o."totalValue") AS spent FROM orders o WHERE o."organizationId"='${ORG_ID}' AND o."orderDate">=$1 AND o."orderDate"<=$2 AND o.status NOT IN('CANCELLED','RETURNED') AND o."customerId" IS NOT NULL ${srcWhere} GROUP BY o."customerId") SELECT CASE WHEN cnt=1 THEN '1 orden' WHEN cnt BETWEEN 2 AND 3 THEN '2-3 ordenes' WHEN cnt BETWEEN 4 AND 6 THEN '4-6 ordenes' ELSE '7+ ordenes' END AS bucket, COUNT(*)::text AS customers, COALESCE(SUM(spent),0)::text AS revenue FROM co GROUP BY 1 ORDER BY MIN(cnt)`, dateFrom, dateTo),
      prisma.$queryRawUnsafe<Array<{city:string;customers:string;revenue:string}>>(`SELECT COALESCE(c.city,'Sin dato') AS city, COUNT(DISTINCT c.id)::text AS customers, COALESCE(SUM(o."totalValue"),0)::text AS revenue FROM orders o JOIN customers c ON c.id=o."customerId" WHERE o."organizationId"='${ORG_ID}' AND o."orderDate">=$1 AND o."orderDate"<=$2 AND o.status NOT IN('CANCELLED','RETURNED') ${srcWhere} GROUP BY c.city ORDER BY COUNT(DISTINCT c.id) DESC LIMIT 10`, dateFrom, dateTo),
      prisma.$queryRawUnsafe<Array<{id:string;name:string;email:string;city:string;orders:string;total_spent:string;avg_ticket:string;first_order:string;last_order:string;lifetime_orders:string;recency_days:string}>>(`WITH cs AS (SELECT o."customerId",COUNT(*)::int AS cnt,SUM(o."totalValue") AS spent,MIN(o."orderDate") AS first_o,MAX(o."orderDate") AS last_o FROM orders o WHERE o."organizationId"='${ORG_ID}' AND o."orderDate">=$1 AND o."orderDate"<=$2 AND o.status NOT IN('CANCELLED','RETURNED') AND o."customerId" IS NOT NULL ${srcWhere} GROUP BY o."customerId"), lt AS (SELECT o."customerId",COUNT(*)::int AS lifetime_orders,EXTRACT(DAY FROM NOW()-MAX(o."orderDate"))::int AS recency FROM orders o WHERE o."organizationId"='${ORG_ID}' AND o.status NOT IN('CANCELLED','RETURNED') AND o."customerId" IS NOT NULL GROUP BY o."customerId") SELECT c.id,TRIM(CONCAT(COALESCE(c."firstName",''),' ',COALESCE(c."lastName",''))) AS name,COALESCE(c.email,'') AS email,COALESCE(c.city,'') AS city,cs.cnt::text AS orders,cs.spent::text AS total_spent,(cs.spent/NULLIF(cs.cnt,0))::text AS avg_ticket,TO_CHAR(cs.first_o-INTERVAL '3 hours','YYYY-MM-DD') AS first_order,TO_CHAR(cs.last_o-INTERVAL '3 hours','YYYY-MM-DD') AS last_order,lt.lifetime_orders::text AS lifetime_orders,lt.recency::text AS recency_days FROM cs JOIN customers c ON c.id=cs."customerId" LEFT JOIN lt ON lt."customerId"=cs."customerId" ORDER BY cs.spent DESC LIMIT ${PAGE_SIZE} OFFSET ${(page-1)*PAGE_SIZE}`, dateFrom, dateTo),
      prisma.$queryRawUnsafe<[{cnt:string}]>(`SELECT COUNT(DISTINCT o."customerId")::text AS cnt FROM orders o WHERE o."organizationId"='${ORG_ID}' AND o."orderDate">=$1 AND o."orderDate"<=$2 AND o.status NOT IN('CANCELLED','RETURNED') AND o."customerId" IS NOT NULL ${srcWhere}`, dateFrom, dateTo),
    ]);

    const totalCustomers = Number(currentKpis[0].total);
    const prevTotalCustomers = Number(prevKpis[0].total);
    const totalSpent = Number(currentKpis[0].total_spent);
    const prevTotalSpent = Number(prevKpis[0].total_spent);
    const repeatCount = Number(repeatData[0].repeat_customers);
    const totalWithOrders = Number(repeatData[0].total);
    const repeatRate = totalWithOrders > 0 ? Math.round((repeatCount / totalWithOrders) * 1000) / 10 : 0;
    const avgSpent = totalCustomers > 0 ? Math.round(totalSpent / totalCustomers) : 0;
    const prevAvgSpent = prevTotalCustomers > 0 ? Math.round(prevTotalSpent / prevTotalCustomers) : 0;
    const totalForPagination = Number(totalCount[0].cnt);
    const pctChange = (c: number, p: number) => p > 0 ? ((c - p) / p) * 100 : c > 0 ? 100 : 0;

    function getSegment(lifetimeOrders: number, recencyDays: number): string {
      if (recencyDays <= 30 && lifetimeOrders >= 4) return "Champions";
      if (lifetimeOrders >= 4) return "Leales";
      if (recencyDays <= 30 && lifetimeOrders === 1) return "Nuevos";
      if (recencyDays <= 60 && lifetimeOrders >= 2) return "Potenciales";
      if (recencyDays > 90 && lifetimeOrders >= 2) return "En riesgo";
      if (recencyDays > 180) return "Perdidos";
      return "Ocasionales";
    }

    return NextResponse.json({
      kpis: {
        totalCustomers, repeatRate,
        avgSpentPerCustomer: avgSpent,
        newCustomers: totalCustomers - repeatCount,
        avgOrdersPerCustomer: Math.round(Number(repeatData[0].avg_orders) * 10) / 10,
        changes: {
          customers: Math.round(pctChange(totalCustomers, prevTotalCustomers) * 10) / 10,
          avgSpent: Math.round(pctChange(avgSpent, prevAvgSpent) * 10) / 10,
        },
      },
      rfmSegments: rfmSegments.map(s => ({ segment: s.segment, customers: Number(s.customers), revenue: Number(s.revenue) })),
      frequencyDistribution: frequencyDist.map(f => ({ bucket: f.bucket, customers: Number(f.customers), revenue: Number(f.revenue) })),
      topCities: topCities.map(c => ({ city: c.city, customers: Number(c.customers), revenue: Number(c.revenue) })),
      customers: customerTable.map(c => {
        const lt = Number(c.lifetime_orders || 1);
        const rec = Number(c.recency_days || 999);
        return { id: c.id, name: c.name || "Sin nombre", email: c.email, city: c.city, orders: Number(c.orders), totalSpent: Number(c.total_spent), avgTicket: Math.round(Number(c.avg_ticket || 0)), firstOrder: c.first_order, lastOrder: c.last_order, segment: getSegment(lt, rec), recencyDays: rec, lifetimeOrders: lt };
      }),
      pagination: { page, pageSize: PAGE_SIZE, totalCustomers: totalForPagination, totalPages: Math.ceil(totalForPagination / PAGE_SIZE) },
      meta: { dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString(), source: sourceFilter || "ALL" },
    });
  } catch (error: any) {
    console.error("Customers API error:", error);
    return NextResponse.json({ error: "Error fetching customers data", detail: error.message }, { status: 500 });
  }
}
