import { PrismaClient } from "@prisma/client";

type CleanupRule = {
  table: string;
  predicateSql: string;
  label: string;
};

const VACUUM_TABLES = [
  "event_market_snapshots",
  "market_snapshots",
  "edge_explanation_snapshots",
  "simulation_cache",
  "trend_cache",
  "saved_trend_snapshots",
  "discovered_trend_system_snapshots",
  "sim_predictions"
];

const RULES: CleanupRule[] = [
  {
    table: "event_market_snapshots",
    predicateSql: "\"capturedAt\" < NOW() - INTERVAL '14 days'",
    label: "event market snapshots older than 14d"
  },
  {
    table: "market_snapshots",
    predicateSql: "\"capturedAt\" < NOW() - INTERVAL '14 days'",
    label: "market snapshots older than 14d"
  },
  {
    table: "edge_explanation_snapshots",
    predicateSql: "\"createdAt\" < NOW() - INTERVAL '30 days'",
    label: "edge explanation snapshots older than 30d"
  },
  {
    table: "simulation_cache",
    predicateSql: "(\"expiresAt\" IS NOT NULL AND \"expiresAt\" < NOW()) OR \"createdAt\" < NOW() - INTERVAL '7 days'",
    label: "expired/stale simulation cache"
  },
  {
    table: "trend_cache",
    predicateSql: "\"expiresAt\" < NOW() - INTERVAL '1 day'",
    label: "expired trend cache"
  },
  {
    table: "saved_trend_snapshots",
    predicateSql: "\"createdAt\" < NOW() - INTERVAL '45 days'",
    label: "saved trend snapshots older than 45d"
  },
  {
    table: "discovered_trend_system_snapshots",
    predicateSql: "\"createdAt\" < NOW() - INTERVAL '45 days'",
    label: "discovered trend snapshots older than 45d"
  },
  {
    table: "sim_predictions",
    predicateSql: "result <> 'OPEN' AND \"createdAt\" < NOW() - INTERVAL '90 days'",
    label: "settled sim predictions older than 90d"
  }
];

function asBoolFlag(name: string) {
  return process.argv.includes(name);
}

async function main() {
  const apply = asBoolFlag("--apply");
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

  console.log(`[db-space-repair] mode=${apply ? "apply" : "dry-run"}`);

  try {
    for (const rule of RULES) {
      const relationRows = await prisma.$queryRawUnsafe<Array<{ exists: string | null }>>(
        "SELECT to_regclass($1)::text AS exists",
        `public.${rule.table}`
      );
      if (!relationRows[0]?.exists) {
        console.log(`[db-space-repair] skipping missing table: ${rule.table}`);
        continue;
      }

      const countRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM ${rule.table} WHERE ${rule.predicateSql}`
      );
      const count = Number(countRows[0]?.count ?? BigInt(0));
      console.log(`[db-space-repair] ${rule.label}: ${count} row(s)`);

      if (apply && count > 0) {
        const deletedRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `WITH deleted AS (
             DELETE FROM ${rule.table}
             WHERE ${rule.predicateSql}
             RETURNING 1
           )
           SELECT COUNT(*)::bigint AS count FROM deleted`
        );
        const deleted = Number(deletedRows[0]?.count ?? BigInt(0));
        console.log(`[db-space-repair] deleted ${deleted} row(s) from ${rule.table}`);
      }
    }

    const sizeRows = await prisma.$queryRawUnsafe<Array<{ table_name: string; total_size: string }>>(
      `SELECT
         relname AS table_name,
         pg_size_pretty(pg_total_relation_size(C.oid)) AS total_size
       FROM pg_class C
       JOIN pg_namespace N ON (N.oid = C.relnamespace)
       WHERE nspname = 'public'
         AND relkind = 'r'
         AND relname = ANY($1::text[])
       ORDER BY pg_total_relation_size(C.oid) DESC`,
      VACUUM_TABLES
    );

    console.log("[db-space-repair] top tracked table sizes:");
    for (const row of sizeRows) {
      console.log(`  - ${row.table_name}: ${row.total_size}`);
    }

    if (apply) {
      for (const table of VACUUM_TABLES) {
        try {
          const relationRows = await prisma.$queryRawUnsafe<Array<{ exists: string | null }>>(
            "SELECT to_regclass($1)::text AS exists",
            `public.${table}`
          );
          if (!relationRows[0]?.exists) {
            console.log(`[db-space-repair] skipping vacuum for missing table: ${table}`);
            continue;
          }
          await prisma.$executeRawUnsafe(`VACUUM (ANALYZE) ${table}`);
          console.log(`[db-space-repair] vacuumed ${table}`);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.warn(`[db-space-repair] vacuum skipped for ${table}: ${reason}`);
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("[db-space-repair] done");
}

main().catch((error) => {
  console.error("[db-space-repair] failed", error);
  process.exit(1);
});
