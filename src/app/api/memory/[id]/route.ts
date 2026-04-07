import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// PATCH: Actualizar memoria
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const orgId = await getOrganizationId();
    const body = await req.json();

    // Verificar propiedad
    const existing = await prisma.botMemory.findUnique({ where: { id: params.id } });
    if (!existing || existing.organizationId !== orgId) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const updated = await prisma.botMemory.update({
      where: { id: params.id },
      data: {
        ...(body.category !== undefined && { category: body.category }),
        ...(body.title !== undefined && { title: body.title }),
        ...(body.content !== undefined && { content: body.content }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return NextResponse.json({ memory: updated });
  } catch (e: any) {
    console.error("[memory/PATCH]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE: Eliminar memoria
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const orgId = await getOrganizationId();

    const existing = await prisma.botMemory.findUnique({ where: { id: params.id } });
    if (!existing || existing.organizationId !== orgId) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    await prisma.botMemory.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[memory/DELETE]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

