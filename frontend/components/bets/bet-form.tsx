"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import type {
  EventOption,
  LedgerBetFormInput,
  SportsbookOption
} from "@/lib/types/ledger";
import { ledgerBetFormSchema } from "@/lib/validation/ledger";
import { getConfidenceTierLabel } from "@/lib/utils/bet-intelligence";
import {
  LEAGUE_LABELS,
  LEAGUE_SPORT_MAP,
  MARKET_LABELS,
  SPORT_LABELS
} from "@/lib/utils/ledger";

type BetFormProps = {
  sportsbooks: SportsbookOption[];
  events: EventOption[];
  marketOptions: Array<{
    value: LedgerBetFormInput["legs"][number]["marketType"];
    label: string;
  }>;
  initialValues: LedgerBetFormInput | null;
  isSaving: boolean;
  onSubmit: (values: LedgerBetFormInput) => Promise<void> | void;
  onCancelEdit: () => void;
};

type FormLegState = {
  eventId: string;
  sportsbookId: string;
  marketType: string;
  marketLabel: string;
  selection: string;
  side: string;
  line: string;
  oddsAmerican: string;
  closingLine: string;
  closingOddsAmerican: string;
  notes: string;
  context: LedgerBetFormInput["legs"][number]["context"];
};

type FormState = {
  id?: string;
  placedAt: string;
  settledAt: string;
  source: string;
  betType: string;
  sport: string;
  league: string;
  sportsbookId: string;
  status: string;
  stake: string;
  notes: string;
  tags: string;
  isLive: boolean;
  context: LedgerBetFormInput["context"];
  legs: FormLegState[];
};

function emptyLeg(defaultBookId: string): FormLegState {
  return {
    eventId: "",
    sportsbookId: defaultBookId,
    marketType: "moneyline",
    marketLabel: MARKET_LABELS.moneyline,
    selection: "",
    side: "",
    line: "",
    oddsAmerican: "-110",
    closingLine: "",
    closingOddsAmerican: "",
    notes: "",
    context: null
  };
}

function toFormState(values: LedgerBetFormInput | null, defaultBookId: string): FormState {
  return {
    id: values?.id,
    placedAt: values?.placedAt ?? new Date().toISOString().slice(0, 16),
    settledAt: values?.settledAt ?? "",
    source: values?.source ?? "MANUAL",
    betType: values?.betType ?? "STRAIGHT",
    sport: values?.sport ?? "BASKETBALL",
    league: values?.league ?? "NBA",
    sportsbookId: values?.sportsbookId ?? defaultBookId,
    status: values?.status ?? "OPEN",
    stake: values?.stake === undefined ? "1" : String(values.stake),
    notes: values?.notes ?? "",
    tags: values?.tags ?? "",
    isLive: values?.isLive ?? false,
    context: values?.context ?? null,
    legs:
      values?.legs.map((leg) => ({
        eventId: leg.eventId ?? "",
        sportsbookId: leg.sportsbookId ?? values.sportsbookId ?? defaultBookId,
        marketType: leg.marketType,
        marketLabel: leg.marketLabel,
        selection: leg.selection,
        side: leg.side ?? "",
        line: leg.line === null || leg.line === undefined ? "" : String(leg.line),
        oddsAmerican: String(leg.oddsAmerican),
        closingLine:
          leg.closingLine === null || leg.closingLine === undefined ? "" : String(leg.closingLine),
        closingOddsAmerican:
          leg.closingOddsAmerican === null || leg.closingOddsAmerican === undefined
            ? ""
            : String(leg.closingOddsAmerican),
        notes: leg.notes ?? "",
        context: leg.context ?? null
      })) ?? [emptyLeg(defaultBookId)]
  };
}

export function BetForm({
  sportsbooks,
  events,
  marketOptions,
  initialValues,
  isSaving,
  onSubmit,
  onCancelEdit
}: BetFormProps) {
  const defaultBookId = sportsbooks[0]?.id ?? "";
  const [values, setValues] = useState<FormState>(toFormState(initialValues, defaultBookId));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues(toFormState(initialValues, defaultBookId));
  }, [defaultBookId, initialValues]);

  const filteredEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.sportCode === values.sport &&
          (values.league === "ALL" || event.leagueKey === values.league)
      ),
    [events, values.league, values.sport]
  );

  function updateField(
    field: keyof Omit<FormState, "legs" | "isLive" | "context">,
    value: string
  ) {
    setValues((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateLeg(
    index: number,
    field: keyof Omit<FormLegState, "context">,
    value: string
  ) {
    setValues((current) => ({
      ...current,
      legs: current.legs.map((leg, legIndex) =>
        legIndex === index
          ? {
              ...leg,
              [field]:
                field === "marketType" && value in MARKET_LABELS
                  ? value
                  : value
            }
          : leg
      )
    }));
  }

  function updateLegMarket(index: number, marketType: string) {
    setValues((current) => ({
      ...current,
      legs: current.legs.map((leg, legIndex) =>
        legIndex === index
          ? {
              ...leg,
              marketType,
              marketLabel:
                marketType in MARKET_LABELS
                  ? MARKET_LABELS[marketType as keyof typeof MARKET_LABELS]
                  : marketType
            }
          : leg
      )
    }));
  }

  function addLeg() {
    setValues((current) => ({
      ...current,
      betType: "PARLAY",
      legs: [...current.legs, emptyLeg(values.sportsbookId || defaultBookId)]
    }));
  }

  function removeLeg(index: number) {
    setValues((current) => {
      const nextLegs = current.legs.filter((_, legIndex) => legIndex !== index);
      return {
        ...current,
        betType: nextLegs.length <= 1 ? "STRAIGHT" : current.betType,
        legs: nextLegs.length ? nextLegs : [emptyLeg(values.sportsbookId || defaultBookId)]
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = ledgerBetFormSchema.safeParse({
      id: values.id,
      placedAt: values.placedAt,
      settledAt: values.settledAt || null,
      source: values.source,
      betType: values.betType,
      sport: values.sport,
      league: values.league,
      eventId: values.legs[0]?.eventId || null,
      sportsbookId: values.sportsbookId || null,
      status: values.status,
      stake: Number(values.stake),
      notes: values.notes,
      tags: values.tags,
      isLive: values.isLive,
      context: values.context ?? null,
      legs: values.legs.map((leg) => ({
        eventId: leg.eventId || null,
        sportsbookId: leg.sportsbookId || values.sportsbookId || null,
        marketType: leg.marketType,
        marketLabel: leg.marketLabel,
        selection: leg.selection,
        side: leg.side || null,
        line: leg.line.trim() === "" ? null : Number(leg.line),
        oddsAmerican: Number(leg.oddsAmerican),
        closingLine: leg.closingLine.trim() === "" ? null : Number(leg.closingLine),
        closingOddsAmerican:
          leg.closingOddsAmerican.trim() === "" ? null : Number(leg.closingOddsAmerican),
        notes: leg.notes,
        context: leg.context ?? null
      }))
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0] ?? "form")] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    await onSubmit(parsed.data);
    setValues(toFormState(null, defaultBookId));
  }

  const isEditing = Boolean(values.id);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-display text-2xl font-semibold text-white">
            {isEditing ? "Edit Ledger Entry" : "Add Ledger Entry"}
          </div>
          <div className="mt-1 text-sm text-slate-400">
            Manual today, durable enough for future sportsbook sync, live grading, and CLV review.
          </div>
        </div>

        {isEditing ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-2xl border border-line px-4 py-2 text-sm text-slate-300"
          >
            Cancel edit
          </button>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input
            type="datetime-local"
            value={values.placedAt}
            onChange={(event) => updateField("placedAt", event.target.value)}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          />

          <select
            value={values.betType}
            onChange={(event) => updateField("betType", event.target.value)}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          >
            <option value="STRAIGHT">Straight</option>
            <option value="PARLAY">Parlay</option>
          </select>

          <select
            value={values.sport}
            onChange={(event) => {
              const sport = event.target.value;
              const league =
                Object.entries(LEAGUE_SPORT_MAP).find(([, code]) => code === sport)?.[0] ?? "NBA";
              setValues((current) => ({
                ...current,
                sport,
                league
              }));
            }}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          >
            {Object.entries(SPORT_LABELS)
              .filter(([code]) => code !== "OTHER")
              .map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
          </select>

          <select
            value={values.league}
            onChange={(event) => updateField("league", event.target.value)}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          >
            {Object.entries(LEAGUE_LABELS)
              .filter(([leagueKey]) => LEAGUE_SPORT_MAP[leagueKey as keyof typeof LEAGUE_SPORT_MAP] === values.sport)
              .map(([leagueKey, label]) => (
                <option key={leagueKey} value={leagueKey}>
                  {label}
                </option>
              ))}
          </select>

          <select
            value={values.status}
            onChange={(event) => updateField("status", event.target.value)}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          >
            <option value="OPEN">Open</option>
            <option value="WIN">Win</option>
            <option value="LOSS">Loss</option>
            <option value="PUSH">Push</option>
            <option value="VOID">Void</option>
            <option value="CASHED_OUT">Cashed Out</option>
          </select>

          <input
            value={values.stake}
            onChange={(event) => updateField("stake", event.target.value)}
            placeholder="Stake"
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select
            value={values.sportsbookId}
            onChange={(event) => updateField("sportsbookId", event.target.value)}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          >
            {sportsbooks.map((book) => (
              <option key={book.id} value={book.id}>
                {book.name}
              </option>
            ))}
          </select>

          <input
            value={values.settledAt}
            onChange={(event) => updateField("settledAt", event.target.value)}
            type="datetime-local"
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          />

          <input
            value={values.tags}
            onChange={(event) => updateField("tags", event.target.value)}
            placeholder="Tags"
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          />

          <label className="flex items-center gap-3 rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={values.isLive}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  isLive: event.target.checked
                }))
              }
              className="accent-sky-400"
            />
            Mark as live bet
          </label>
        </div>

        <textarea
          value={values.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder="Notes, tag logic, why you liked the number, or anything you want to audit later."
          className="min-h-24 rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        />

        {values.context ? (
          <div className="rounded-3xl border border-line/80 bg-slate-950/55 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Bet Context</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-line px-3 py-1 text-xs text-slate-300">
                {values.context.sourceLabel}
              </span>
              <span className="rounded-full border border-line px-3 py-1 text-xs text-slate-300">
                {values.context.eventLabel}
              </span>
              {typeof values.context.expectedValuePct === "number" ? (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                  Market EV {values.context.expectedValuePct > 0 ? "+" : ""}
                  {values.context.expectedValuePct.toFixed(2)}%
                </span>
              ) : (
                <span className="rounded-full border border-line px-3 py-1 text-xs text-slate-400">
                  EV unavailable
                </span>
              )}
              {typeof values.context.edgeScore === "number" ? (
                <span className="rounded-full border border-line px-3 py-1 text-xs text-slate-300">
                  Edge {values.context.edgeScore} {values.context.edgeLabel ?? ""}
                </span>
              ) : null}
              {values.context.confidenceTier ? (
                <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
                  {getConfidenceTierLabel(values.context.confidenceTier)}
                </span>
              ) : null}
            </div>
            <div className="mt-3 text-sm leading-7 text-slate-400">
              {values.context.supportNote ??
                "Closing-line value and performance diagnostics will only populate when SharkEdge has the right closing inputs or linked event state."}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4">
          {values.legs.map((leg, index) => (
            <div key={index} className="rounded-3xl border border-line/80 bg-slate-950/55 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Leg {index + 1}
                </div>
                {values.legs.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeLeg(index)}
                    className="text-sm text-rose-300"
                  >
                    Remove leg
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 xl:grid-cols-6">
                <select
                  value={leg.eventId}
                  onChange={(event) => updateLeg(index, "eventId", event.target.value)}
                  className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white xl:col-span-2"
                >
                  <option value="">No event linked</option>
                  {filteredEvents.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.label} | {new Date(event.startTime).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}
                    </option>
                  ))}
                </select>

                <select
                  value={leg.marketType}
                  onChange={(event) => updateLegMarket(index, event.target.value)}
                  className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
                >
                  {marketOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <input
                  value={leg.marketLabel}
                  onChange={(event) => updateLeg(index, "marketLabel", event.target.value)}
                  placeholder="Market label"
                  className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
                />

                <input
                  value={leg.selection}
                  onChange={(event) => updateLeg(index, "selection", event.target.value)}
                  placeholder="Selection"
                  className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
                />

                <select
                  value={leg.sportsbookId}
                  onChange={(event) => updateLeg(index, "sportsbookId", event.target.value)}
                  className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
                >
                  {sportsbooks.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.name}
                    </option>
                  ))}
                </select>

                <input
                  value={leg.side}
                  onChange={(event) => updateLeg(index, "side", event.target.value)}
                  placeholder="Side (Over, Under, Team, Fighter)"
                  className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
                />

                <input
                  value={leg.line}
                  onChange={(event) => updateLeg(index, "line", event.target.value)}
                  placeholder="Line"
                  className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
                />

                <input
                  value={leg.oddsAmerican}
                  onChange={(event) => updateLeg(index, "oddsAmerican", event.target.value)}
                  placeholder="Odds"
                  className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
                />

                <input
                  value={leg.closingLine}
                  onChange={(event) => updateLeg(index, "closingLine", event.target.value)}
                  placeholder="Closing line"
                  className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
                />

                <input
                  value={leg.closingOddsAmerican}
                  onChange={(event) =>
                    updateLeg(index, "closingOddsAmerican", event.target.value)
                  }
                  placeholder="Closing odds"
                  className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
                />

                <input
                  value={leg.notes}
                  onChange={(event) => updateLeg(index, "notes", event.target.value)}
                  placeholder="Leg notes"
                  className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white xl:col-span-2"
                />
              </div>

              {leg.context ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                  {typeof leg.context.expectedValuePct === "number" ? (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                      Market EV {leg.context.expectedValuePct > 0 ? "+" : ""}
                      {leg.context.expectedValuePct.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="rounded-full border border-line px-3 py-1">
                      EV unavailable
                    </span>
                  )}
                  {typeof leg.context.marketDeltaAmerican === "number" ? (
                    <span className="rounded-full border border-line px-3 py-1">
                      Delta {leg.context.marketDeltaAmerican > 0 ? "+" : ""}
                      {leg.context.marketDeltaAmerican}
                    </span>
                  ) : null}
                  {leg.context.valueFlag && leg.context.valueFlag !== "NONE" ? (
                    <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-amber-200">
                      {leg.context.valueFlag.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={addLeg}
            className="rounded-2xl border border-line px-4 py-3 text-sm text-slate-300"
          >
            Add leg
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-5 py-3 text-sm font-medium text-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : isEditing ? "Save changes" : "Add bet"}
          </button>
        </div>
      </form>

      {Object.keys(errors).length ? (
        <div className="mt-4 text-sm text-rose-300">{Object.values(errors).join(" ")}</div>
      ) : null}
    </Card>
  );
}
