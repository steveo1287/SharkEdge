import { loadEnvConfig } from "@next/env";
import { Prisma, PrismaClient } from "@prisma/client";

const DATABASE_ENV_KEYS = ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"] as const;

type DatabaseEnvKey = (typeof DATABASE_ENV_KEYS)[number];
type DatabaseResolution = {
  key: DatabaseEnvKey | null;
  url: string | null;
};

declare global {
  var prismaGlobal: PrismaClient | undefined;
  var prismaResolutionLogged: boolean | undefined;
  var sharkedgeEnvLoaded: boolean | undefined;
}

if (!global.sharkedgeEnvLoaded) {
  loadEnvConfig(process.cwd());
  global.sharkedgeEnvLoaded = true;
}

function getEnvValue(key: DatabaseEnvKey) {
  const value = process.env[key];
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

export function getServerDatabaseResolution(): DatabaseResolution {
  for (const key of DATABASE_ENV_KEYS) {
    const value = getEnvValue(key);

    if (value) {
      return {
        key,
        url: value
      };
    }
  }

  return {
    key: null,
    url: null
  };
}

export function hasUsableServerDatabaseUrl() {
  return getServerDatabaseResolution().url !== null;
}

const databaseResolution = getServerDatabaseResolution();
const prismaOptions: Prisma.PrismaClientOptions = {
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
};

if (databaseResolution.url) {
  prismaOptions.datasources = {
    db: {
      url: databaseResolution.url
    }
  };
}

if (!global.prismaResolutionLogged) {
  console.info(
    `[db] Prisma URL source: ${databaseResolution.key ?? "none"}`
  );
  global.prismaResolutionLogged = true;
}

export const prisma =
  global.prismaGlobal ??
  new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}
