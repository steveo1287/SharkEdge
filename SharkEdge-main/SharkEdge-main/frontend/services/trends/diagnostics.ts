import type { TrendsDiagnostics } from "./play-types";

type ProviderStatus = TrendsDiagnostics["providerStatus"];

export class DiagnosticsBuilder {
  private historicalRows = 0;
  private currentRows = 0;
  private discoveredSystems = 0;
  private validatedSystems = 0;
  private activeCandidates = 0;
  private surfacedPlays = 0;
  private providerStatus: ProviderStatus = "down";
  private issues: string[] = [];

  setProviderStatus(status: ProviderStatus) {
    this.providerStatus = status;
  }

  addIssue(issue: string) {
    const trimmed = issue.trim();
    if (!trimmed) return;
    this.issues.push(trimmed);
    this.issues = Array.from(new Set(this.issues));
  }

  bump(field: keyof Pick<
    TrendsDiagnostics,
    | "historicalRows"
    | "currentRows"
    | "discoveredSystems"
    | "validatedSystems"
    | "activeCandidates"
    | "surfacedPlays"
  >, amount: number = 1) {
    const inc = Number.isFinite(amount) ? amount : 0;
    if (field === "historicalRows") this.historicalRows += inc;
    if (field === "currentRows") this.currentRows += inc;
    if (field === "discoveredSystems") this.discoveredSystems += inc;
    if (field === "validatedSystems") this.validatedSystems += inc;
    if (field === "activeCandidates") this.activeCandidates += inc;
    if (field === "surfacedPlays") this.surfacedPlays += inc;
  }

  toObject(): TrendsDiagnostics {
    return {
      historicalRows: Math.max(0, Math.floor(this.historicalRows)),
      currentRows: Math.max(0, Math.floor(this.currentRows)),
      discoveredSystems: Math.max(0, Math.floor(this.discoveredSystems)),
      validatedSystems: Math.max(0, Math.floor(this.validatedSystems)),
      activeCandidates: Math.max(0, Math.floor(this.activeCandidates)),
      surfacedPlays: Math.max(0, Math.floor(this.surfacedPlays)),
      providerStatus: this.providerStatus,
      issues: this.issues
    };
  }
}

export function createDiagnostics() {
  return new DiagnosticsBuilder();
}

