"use client";

import { type FormEvent, useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import type { BetFormInput, SportsbookRecord } from "@/lib/types/domain";
import { betFormSchema } from "@/lib/validation/bet";

type BetFormProps = {
  sportsbooks: SportsbookRecord[];
  initialValues: BetFormInput | null;
  onSubmit: (values: BetFormInput) => void;
};

type FormState = {
  date: string;
  sport: string;
  league: string;
  marketType: string;
  side: string;
  line: string;
  oddsAmerican: string;
  sportsbookId: string;
  stake: string;
  notes: string;
  tags: string;
  gameId?: string;
  playerId?: string;
};

function toState(values: BetFormInput | null): FormState {
  return {
    date: values?.date ?? new Date().toISOString().slice(0, 16),
    sport: values?.sport ?? "BASKETBALL",
    league: values?.league ?? "NBA",
    marketType: values?.marketType ?? "spread",
    side: values?.side ?? "",
    line: values?.line === null || values?.line === undefined ? "" : String(values.line),
    oddsAmerican:
      values?.oddsAmerican === undefined ? "-110" : String(values.oddsAmerican),
    sportsbookId: values?.sportsbookId ?? "book_dk",
    stake: values?.stake === undefined ? "1" : String(values.stake),
    notes: values?.notes ?? "",
    tags: values?.tags ?? "",
    gameId: values?.gameId,
    playerId: values?.playerId
  };
}

export function BetForm({ sportsbooks, initialValues, onSubmit }: BetFormProps) {
  const fallbackBookId = sportsbooks[0]?.id ?? "book_dk";
  const [values, setValues] = useState<FormState>({
    ...toState(initialValues),
    sportsbookId: initialValues?.sportsbookId ?? fallbackBookId
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues({
      ...toState(initialValues),
      sportsbookId: initialValues?.sportsbookId ?? fallbackBookId
    });
  }, [fallbackBookId, initialValues]);

  function updateField(field: keyof FormState, value: string) {
    setValues((current) => ({
      ...current,
      [field]: value
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = betFormSchema.safeParse({
      date: values.date,
      sport: values.sport,
      league: values.league,
      marketType: values.marketType,
      side: values.side,
      line: values.line.trim() === "" ? null : Number(values.line),
      oddsAmerican: Number(values.oddsAmerican),
      sportsbookId: values.sportsbookId,
      stake: Number(values.stake),
      notes: values.notes,
      tags: values.tags,
      gameId: values.gameId,
      playerId: values.playerId
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
    onSubmit(parsed.data);
    setValues({
      ...toState(initialValues),
      sportsbookId: initialValues?.sportsbookId ?? fallbackBookId
    });
  }

  return (
    <Card className="p-5">
      <div className="mb-4">
        <div className="font-display text-2xl font-semibold text-white">Manual Entry</div>
        <div className="mt-1 text-sm text-slate-400">
          Built for manual logging now, with clean hooks for future sportsbook sync.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="gameId" value={values.gameId ?? ""} />
        <input type="hidden" name="playerId" value={values.playerId ?? ""} />
        <input type="hidden" name="sport" value={values.sport} />

        <input
          name="date"
          type="datetime-local"
          value={values.date}
          onChange={(event) => updateField("date", event.target.value)}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        />
        <select
          name="league"
          value={values.league}
          onChange={(event) => updateField("league", event.target.value)}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        >
          <option value="NBA">NBA</option>
          <option value="NCAAB">NCAAB</option>
        </select>
        <select
          name="marketType"
          value={values.marketType}
          onChange={(event) => updateField("marketType", event.target.value)}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        >
          <option value="spread">Spread</option>
          <option value="moneyline">Moneyline</option>
          <option value="total">Total</option>
          <option value="player_points">Player Points</option>
          <option value="player_rebounds">Player Rebounds</option>
          <option value="player_assists">Player Assists</option>
          <option value="player_threes">Player Threes</option>
        </select>
        <select
          name="sportsbookId"
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
          name="side"
          placeholder="Side"
          value={values.side}
          onChange={(event) => updateField("side", event.target.value)}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        />
        <input
          name="line"
          placeholder="Line"
          value={values.line}
          onChange={(event) => updateField("line", event.target.value)}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        />
        <input
          name="oddsAmerican"
          placeholder="Odds"
          value={values.oddsAmerican}
          onChange={(event) => updateField("oddsAmerican", event.target.value)}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        />
        <input
          name="stake"
          placeholder="Stake (units)"
          value={values.stake}
          onChange={(event) => updateField("stake", event.target.value)}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        />

        <input
          name="notes"
          placeholder="Notes"
          value={values.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white xl:col-span-2"
        />
        <input
          name="tags"
          placeholder="Tags"
          value={values.tags}
          onChange={(event) => updateField("tags", event.target.value)}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        />
        <button
          type="submit"
          className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300"
        >
          Add bet
        </button>
      </form>

      {Object.keys(errors).length ? (
        <div className="mt-4 text-sm text-rose-300">
          {Object.values(errors).join(" ")}
        </div>
      ) : null}
    </Card>
  );
}
