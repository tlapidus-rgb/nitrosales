import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// GET: Listar memorias de la organización
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const orgId = await getOrganizationId();
    const { searchParams } = req.nextUrl;
    const includeInactive = searchParams.get("includeInactive") === "true";
    const category = searchParams.get("category");

    const where: any = { organizationId: orgId };
    if (!includeInactive) where.isActive = true;
    if (category) where.category = category;

    const memories = await prisma.botMemory.findMany({
      where,
      orderBy: [
        { isActive: "desc" },
        { priority: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json({ memories });
  } catch (e: any) {
    console.error("[memory/GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: Crear nueva memoria
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const orgId = await getOrganizationId();
    const { category, title, content, priority, source } = await req.json();

    if (!title || !content || !category) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: title, content, category" },
        { status: 400 }
      );
    }

    const memory = await prisma.botMemory.create({
      data: {
        organizationId: orgId,
        category,
        title,
        content,
        priority: priority ?? 5,
        source: source || "MANUAL",
        createdBy: (session as any).user?.email || "UNKNOWN",
      },
    });

    return NextResponse.json({ memory }, { status: 201 });
  } catch (e: any) {
    console.error("[memory/POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

