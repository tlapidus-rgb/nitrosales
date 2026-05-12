// @ts-nocheck
// GET /api/admin/debug-test-creds?key=Y&orgId=X
// Llama directo a testCredentialsByPlatform + testNitroPixel
// con auth por key (no cookie) para diagnosticar errores que el
// endpoint admin tira como "Unexpected token A".

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptCredentials, isEncrypted } from "@/lib/crypto";
import { testCredentialsByPlatform, testNitroPixel } from "@/lib/onboarding/credential-tests";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("key") !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const orgId = url.searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    // ?onlyPlatform=VTEX para probar una sola plataforma y aislar la que cuelga
    const onlyPlatform = url.searchParams.get("onlyPlatform");
    // ?skipTest=1 solo lista las connections, no las prueba
    const skipTest = url.searchParams.get("skipTest") === "1";
    // ?perTimeout=5000 timeout individual en ms por test (default 8000)
    const perTimeout = Math.min(60000, Math.max(1000, Number(url.searchParams.get("perTimeout") || "8000")));

    const connections = await prisma.connection.findMany({
      where: { organizationId: orgId, ...(onlyPlatform ? { platform: onlyPlatform as any } : {}) },
      select: { id: true, platform: true, status: true, credentials: true, lastSyncError: true },
    });

    const results: any[] = [];

    for (const conn of connections) {
      const start = Date.now();
      let creds: any = null;
      let decryptError: string | null = null;
      try {
        const raw = conn.credentials as any;
        if (typeof raw === "string" && isEncrypted(raw)) {
          creds = decryptCredentials(raw);
        } else if (typeof raw === "object" && raw !== null) {
          creds = raw;
        } else {
          creds = JSON.parse(raw);
        }
      } catch (e: any) {
        decryptError = e?.message;
      }

      if (decryptError) {
        results.push({
          platform: conn.platform,
          status: conn.status,
          decryptError,
          elapsedMs: Date.now() - start,
        });
        continue;
      }

      // Mostrar QUÉ campos están en creds (sin valores secretos)
      const credKeys = Object.keys(creds || {});
      let testResult: any = null;
      let testError: string | null = null;
      let testStack: string | null = null;

      if (skipTest) {
        results.push({
          platform: conn.platform,
          status: conn.status,
          credKeys,
          skipped: true,
        });
        continue;
      }

      try {
        // Hard timeout para no colgar el endpoint si testCredentialsByPlatform no respeta su propio timeout
        testResult = await Promise.race([
          testCredentialsByPlatform(conn.platform, creds, {}),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`HARD_TIMEOUT_${perTimeout}ms`)), perTimeout)),
        ]);
      } catch (e: any) {
        testError = e?.message;
        testStack = e?.stack?.slice(0, 500);
      }

      results.push({
        platform: conn.platform,
        status: conn.status,
        credKeys,
        testResult,
        testError,
        testStack,
        lastSyncError: conn.lastSyncError,
        elapsedMs: Date.now() - start,
      });
    }

    // NitroPixel
    const pixelStart = Date.now();
    let pixelResult: any = null;
    let pixelError: string | null = null;
    try {
      pixelResult = await testNitroPixel(orgId, prisma);
    } catch (e: any) {
      pixelError = e?.message;
    }

    return NextResponse.json({
      ok: true,
      orgId,
      connectionsFound: connections.length,
      results,
      pixel: { result: pixelResult, error: pixelError, elapsedMs: Date.now() - pixelStart },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 800) }, { status: 500 });
  }
}
