import type { PrismaClient } from "@prisma/client";

export type PostgresSpaceRepairMode = "dry-run" | "apply";

type CleanupRule = {
  table: string;
  label: string;
  predicate: (columns: Set<string>) => string | null;
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
    label: "event market snapshots older than 14d",
    predicate: (columns) => olderThanPredicate(columns, ["capturedAt", "captured_at"], "14 days")
  },
  {
    table: "market_snapshots",
    label: "market snapshots older than 14d",
    predicate: (columns) => olderThanPredicate(columns, ["capturedAt", "captured_at"], "14 days")
  },
  {
    table: "edge_explanation_snapshots",
    label: "edge explanation snapshots older than 30d",
    predicate: (columns) => olderThanPredicate(columns, ["createdAt", "created_at"], "30 days")
  },
  {
    table: "simulation_cache",
    label: "expired/stale simulation cache",
    predicate: (columns) => {
      const expires = pickColumn(columns, ["expiresAt", "expires_at"]);
      const created = pickColumn(columns, ["createdAt", "created_at"]);
      const parts = [
        expires ? `(${quoteIdent(expires)} IS NOT NULL AND ${quoteIdent(expires)} < NOW())` : null,
        created ? `${quoteIdent(created)} < NOW() - INTERVAL '7 days'` : null
      ].filter(Boolean);
      return parts.length ? parts.join(" OR ") : null;
    }
  },
  {
    table: "trend_cache",
    label: "expired trend cache",
    predicate: (columns) => olderThanPredicate(columns, ["expiresAt", "expires_at"], "1 day")
  },
  {
    table: "saved_trend_snapshots",
    label: "saved trend snapshots older than 45d",
    predicate: (columns) => olderThanPredicate(columns, ["createdAt", "created_at"], "45 days")
  },
  {
    table: "discovered_trend_system_snapshots",
    label: "discovered trend snapshots older than 45d",
    predicate: (columns) => olderThanPredicate(columns, ["createdAt", "created_at"], "45 days")
  },
  {
    table: "sim_predictions",
    label: "settled sim predictions older than 90d",
    predicate: (columns) => {
      const created = pickColumn(columns, ["createdAt", "created_at"]);
      if (!created || !columns.has("result")) return null;
      return `result <> 'OPEN' AND ${quoteIdent(created)} < NOW() - INTERVAL '90 days'`;
    }
  }
];

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function pickColumn(columns: Set<string>, candidates: string[]) {
  return candidates.find((candidate) => columns.has(candidate)) ?? null;
}

function olderThanPredicate(columns: Set<string>, candidates: string[], interval: string) {
  const column = pickColumn(columns, candidates);
  return column ? `${quoteIdent(column)} < NOW() - INTERVAL '${interval}'` : null;
}

async function tableExists(prisma: PrismaClient, table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: string | null }>>(
    "SELECT to_regclass($1)::text AS exists",
    `public.${table}`
  );
  return Boolean(rows[0]?.exists);
}

async function getColumns(prisma: PrismaClient, table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1`,
    table
  );
  return new Set(rows.map((row) => row.column_name));
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

    const columns = await getColumns(prisma, rule.table);
    const predicateSql = rule.predicate(columns);
    if (!predicateSql) {
      skippedTables.push(`${rule.table}:missing_retention_columns`);
      continue;
    }

    const countRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM ${rule.table} WHERE ${predicateSql}`
    );
    const matched = Number(countRows[0]?.count ?? BigInt(0));
    let deleted = 0;

    if (apply && matched > 0) {
      const deletedRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `WITH deleted AS (
           DELETE FROM ${rule.table}
           WHERE ${predicateSql}
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
