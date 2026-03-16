import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ORG_ID = "cmmmga1uq0000sb43w0krvvys";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (key !== "nitrosales-backfill-2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const action = searchParams.get("action") || "check";
  
  try {
    if (action === "check") {
      // Diagnostic: check brand/category status
      const total = await prisma.product.count({ where: { organizationId: ORG_ID } });
      const withBrand = await prisma.product.count({ where: { organizationId: ORG_ID, brand: { not: null } } });
      const withCategory = await prisma.product.count({ where: { organizationId: ORG_ID, category: { not: null } } });
      const noBrand = await prisma.product.count({ where: { organizationId: ORG_ID, brand: null } });
      
      // Sample products without brand
      const sampleNoBrand = await prisma.product.findMany({
        where: { organizationId: ORG_ID, brand: null },
        select: { id: true, externalId: true, name: true },
        take: 10
      });
      
      // Sample products with brand
      const sampleWithBrand = await prisma.product.findMany({
        where: { organizationId: ORG_ID, brand: { not: null } },
        select: { id: true, externalId: true, name: true, brand: true, category: true },
        take: 10
      });
      
      return NextResponse.json({ total, withBrand, withCategory, noBrand, sampleNoBrand, sampleWithBrand });
    }
    
    if (action === "fix") {
      // Fix: copy brand/category from catalog-created products to order-created products
      // Match by product name (trimmed)
      const result = await prisma.$executeRaw`
        UPDATE products p1
        SET brand = p2.brand, category = p2.category
        FROM products p2
        WHERE p1."organizationId" = ${ORG_ID}
        AND p2."organizationId" = ${ORG_ID}
        AND TRIM(p1.name) = TRIM(p2.name)
        AND p1.brand IS NULL
        AND p2.brand IS NOT NULL
      `;
      
      // Count remaining unmatched
      const remaining = await prisma.product.count({
        where: { organizationId: ORG_ID, brand: null }
      });
      
      return NextResponse.json({ updated: result, remainingWithoutBrand: remaining });
    }
    
    return NextResponse.json({ error: "Unknown action. Use ?action=check or ?action=fix" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
