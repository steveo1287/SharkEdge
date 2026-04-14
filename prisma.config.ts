import { defineConfig } from "prisma/config";

const DATABASE_ENV_KEYS = ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"] as const;

type DatabaseEnvKey = (typeof DATABASE_ENV_KEYS)[number];

function resolveDatabaseUrl() {
  for (const key of DATABASE_ENV_KEYS) {
    const value = process.env[key];

    if (typeof value === "string" && value.trim().length) {
      return {
        key,
        url: value.trim()
      } satisfies {
        key: DatabaseEnvKey;
        url: string;
      };
    }
  }

  return {
    key: null,
    url: null
  };
}

const resolution = resolveDatabaseUrl();

if (resolution.url && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolution.url;
}

console.info(`[prisma-config] datasource url source: ${resolution.key ?? "none"}`);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  }
});
