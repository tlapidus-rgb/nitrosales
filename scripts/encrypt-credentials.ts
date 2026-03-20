// ══════════════════════════════════════════════════════════════
// One-time script: Encrypt existing Connection credentials
// ══════════════════════════════════════════════════════════════
// Usage: npx tsx scripts/encrypt-credentials.ts
//
// Prerequisites:
//   1. Set ENCRYPTION_KEY env var (64 hex chars)
//   2. Set DATABASE_URL env var
//
// This script reads all Connection rows, encrypts their JSON
// credentials, and updates the DB. It's safe to run multiple
// times (skips already-encrypted entries).

import { PrismaClient } from "@prisma/client";
import { encryptCredentials, isEncrypted } from "../src/lib/crypto";

async function main() {
  const prisma = new PrismaClient();

  try {
    const connections = await prisma.connection.findMany();
    console.log(`Found ${connections.length} connection(s)`);

    let encrypted = 0;
    let skipped = 0;

    for (const conn of connections) {
      const raw = conn.credentials;

      // Skip if already encrypted
      if (typeof raw === "string" && isEncrypted(raw)) {
        console.log(`  [SKIP] ${conn.platform} (org: ${conn.organizationId}) - already encrypted`);
        skipped++;
        continue;
      }

      // Skip if null/empty
      if (!raw || (typeof raw === "object" && Object.keys(raw as object).length === 0)) {
        console.log(`  [SKIP] ${conn.platform} (org: ${conn.organizationId}) - empty credentials`);
        skipped++;
        continue;
      }

      // Encrypt the JSON credentials
      const encryptedValue = encryptCredentials(raw as Record<string, unknown>);

      await prisma.connection.update({
        where: { id: conn.id },
        data: { credentials: encryptedValue },
      });

      console.log(`  [OK] ${conn.platform} (org: ${conn.organizationId}) - encrypted`);
      encrypted++;
    }

    console.log(`\nDone: ${encrypted} encrypted, ${skipped} skipped`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
