import type { PrismaClient } from "@prisma/client";

export type PostgresSpaceRepairMode = "dry-run" | "apply";

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
] as const;

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

async function tableExists(prisma: PrismaClient, table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: string | null }>>(
    "SELECT to_regclass($1)::text AS exists",
    `public.${table}`
  );
  return Boolean(rows[0]?.exists);
}

export async function repairPostgresSpace(prisma: PrismaClient, mode: PostgresSpaceRepairMode = "dry-run") {
  const apply = mode === "apply";
  const cleaned: Array<{ table: string; label: string; matched: number; deleted: number }> = [];
  const skippedTables: string[] = [];
  const vacuumedTables: string[] = [];

  for (const rule of RULES) {
    if (!(await tableExists(prisma, rule.table))) {
      skippedTables.push(rule.table);
      continue;
    }

    const countRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM ${rule.table} WHERE ${rule.predicateSql}`
    );
    const matched = Number(countRows[0]?.count ?? BigInt(0));
    let deleted = 0;

    if (apply && matched > 0) {
      const deletedRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `WITH deleted AS (
           DELETE FROM ${rule.table}
           WHERE ${rule.predicateSql}
           RETURNING 1
         )
         SELECT COUNT(*)::bigint AS count FROM deleted`
      );
      deleted = Number(deletedRows[0]?.count ?? BigInt(0));
    }

    cleaned.push({
      table: rule.table,
      label: rule.label,
      matched,
      deleted
    });
  }

  const tableSizes = await prisma.$queryRawUnsafe<Array<{ table_name: string; total_size: string }>>(
    `SELECT
       relname AS table_name,
       pg_size_pretty(pg_total_relation_size(C.oid)) AS total_size
     FROM pg_class C
     JOIN pg_namespace N ON (N.oid = C.relnamespace)
     WHERE nspname = 'public'
       AND relkind = 'r'
       AND relname = ANY($1::text[])
     ORDER BY pg_total_relation_size(C.oid) DESC`,
    [...VACUUM_TABLES]
  );

  if (apply) {
    for (const table of VACUUM_TABLES) {
      if (!(await tableExists(prisma, table))) continue;
      await prisma.$executeRawUnsafe(`VACUUM (ANALYZE) ${table}`);
      vacuumedTables.push(table);
    }
  }

  return {
    ok: true,
    mode,
    generatedAt: new Date().toISOString(),
    cleaned,
    skippedTables,
    vacuumedTables,
    tableSizes,
    totals: {
      matched: cleaned.reduce((sum, row) => sum + row.matched, 0),
      deleted: cleaned.reduce((sum, row) => sum + row.deleted, 0)
    }
  };
}

