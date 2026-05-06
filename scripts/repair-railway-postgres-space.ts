import { PrismaClient } from "@prisma/client";

import { repairPostgresSpace } from "@/lib/db/postgres-space-repair";

function asBoolFlag(name: string) {
  return process.argv.includes(name);
}

async function main() {
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.PRISMA_DATABASE_URL ||
    "";

  if (!dbUrl) {
    throw new Error("DATABASE_URL (or POSTGRES_PRISMA_URL / PRISMA_DATABASE_URL) is required");
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl
      }
    }
  });

  try {
    const result = await repairPostgresSpace(prisma, asBoolFlag("--apply") ? "apply" : "dry-run");
    console.log(`[db-space-repair] mode=${result.mode}`);
    for (const row of result.cleaned) {
      console.log(
        `[db-space-repair] ${row.label}: matched=${row.matched} deleted=${row.deleted}`
      );
    }
    for (const table of result.skippedTables) {
      console.log(`[db-space-repair] skipped missing table: ${table}`);
    }
    console.log("[db-space-repair] tracked table sizes:");
    for (const row of result.tableSizes) {
      console.log(`  - ${row.table_name}: ${row.total_size}`);
    }
    for (const table of result.vacuumedTables) {
      console.log(`[db-space-repair] vacuumed ${table}`);
    }
    console.log(`[db-space-repair] totals: matched=${result.totals.matched} deleted=${result.totals.deleted}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[db-space-repair] failed", error);
  process.exit(1);
});

