import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { NextResponse } from "next/server";

/** Manual sync only. Cron/webhook authentication remains separate. */
export async function mlSessionConnection(): Promise<
  { connection: { id: string; organizationId: string }; response?: never } |
  { connection?: never; response: NextResponse }
> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    const organizationId = (session.user as { organizationId?: unknown }).organizationId;
    if (typeof organizationId !== "string" || !organizationId.trim()) {
      return { response: NextResponse.json({ error: "Organization required" }, { status: 403 }) };
    }
    const connection = await prisma.connection.findFirst({
      where: { organizationId, platform: "MERCADOLIBRE", status: "ACTIVE" },
      select: { id: true, organizationId: true },
    });
    if (!connection) return { response: NextResponse.json({ error: "No active ML connection" }, { status: 404 }) };
    return { connection };
  } catch {
    return { response: NextResponse.json({ error: "Unable to verify ML session" }, { status: 503 }) };
  }
}
