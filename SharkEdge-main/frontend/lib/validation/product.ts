import { z } from "zod";

import {
  ALERT_RULE_STATUSES,
  ALERT_TYPES,
  IMPORT_PROVIDER_KEYS
} from "@/lib/types/product";
import { LEDGER_MARKET_TYPES, LEAGUE_KEYS, SPORT_CODES } from "@/lib/types/ledger";
import { decodeBetIntent } from "@/lib/utils/bet-intelligence";

const sportEnum = z.enum(SPORT_CODES);
const leagueEnum = z.enum(LEAGUE_KEYS);
const marketEnum = z.enum(LEDGER_MARKET_TYPES);
const alertTypeEnum = z.enum(ALERT_TYPES);
const alertStatusEnum = z.enum(ALERT_RULE_STATUSES);
const importProviderEnum = z.enum(IMPORT_PROVIDER_KEYS);

export const watchlistFiltersSchema = z.object({
  sport: z.union([z.literal("ALL"), sportEnum]).default("ALL"),
  league: z.union([z.literal("ALL"), leagueEnum]).default("ALL"),
  market: z.union([z.literal("ALL"), marketEnum]).default("ALL"),
  liveStatus: z.enum(["all", "live", "upcoming", "final", "unavailable"]).default("all"),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE")
});

export const watchlistIntentSchema = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    const intent = decodeBetIntent(value);
    if (!intent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid watchlist payload."
      });
      return z.NEVER;
    }

    return intent;
  });

const lineMovementConfigSchema = z.object({
  type: z.literal("LINE_MOVEMENT_THRESHOLD"),
  threshold: z.number().positive()
});

const propLineChangedConfigSchema = z.object({
  type: z.literal("PROP_LINE_CHANGED"),
  threshold: z.number().positive()
});

const evThresholdConfigSchema = z.object({
  type: z.literal("EV_THRESHOLD_REACHED"),
  thresholdPct: z.number()
});

const bestBookConfigSchema = z.object({
  type: z.literal("BEST_BOOK_CHANGED")
});

const startSoonConfigSchema = z.object({
  type: z.literal("STARTING_SOON"),
  minutesBefore: z.number().int().positive()
});

const availabilityConfigSchema = z.object({
  type: z.literal("AVAILABILITY_RETURNED")
});

const targetLineConfigSchema = z.object({
  type: z.literal("TARGET_NUMBER_CROSSED"),
  targetLine: z.number()
});

const clvTrendConfigSchema = z.object({
  type: z.literal("CLV_TREND"),
  thresholdPct: z.number()
});

export const alertRuleConfigSchema = z.discriminatedUnion("type", [
  lineMovementConfigSchema,
  propLineChangedConfigSchema,
  evThresholdConfigSchema,
  bestBookConfigSchema,
  startSoonConfigSchema,
  availabilityConfigSchema,
  targetLineConfigSchema,
  clvTrendConfigSchema
]);

export const alertRuleCreateSchema = z.object({
  watchlistItemId: z.string().cuid(),
  type: alertTypeEnum,
  name: z.string().min(1).max(120),
  config: alertRuleConfigSchema
});

export const alertRuleUpdateSchema = z.object({
  status: alertStatusEnum.optional(),
  markAllRead: z.boolean().optional(),
  dismiss: z.boolean().optional(),
  mute: z.boolean().optional()
});

export const notificationPreferencesSchema = z.object({
  deliveryChannels: z.array(z.literal("IN_APP")).default(["IN_APP"]),
  quietHours: z.object({
    enabled: z.boolean(),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(0).max(23)
  }),
  sportPreferences: z.record(leagueEnum, z.boolean()),
  alertTypePreferences: z.record(alertTypeEnum, z.boolean())
});

export const csvImportSchema = z.object({
  providerKey: importProviderEnum,
  fileName: z.string().min(1).max(255).optional(),
  csvText: z.string().min(1, "CSV content is required.")
});
