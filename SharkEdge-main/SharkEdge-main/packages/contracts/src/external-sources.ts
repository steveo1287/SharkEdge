export type ExternalSourceType = "github" | "openclaw" | "clawhub" | "manual";
export type ExternalSourceDecision = "direct" | "fork" | "reference_only" | "rejected";

export type ExternalRepoRecord = {
  id: string;
  sourceType: ExternalSourceType;
  url: string;
  owner: string;
  name: string;
  license: string | null;
  language: string | null;
  stars: number | null;
  openIssues: number | null;
  lastCommitAt: string | null;
  category: string;
  intendedUse: string;
};

export type ExternalRepoReview = {
  repoId: string;
  codeQualityScore: number;
  securityScore: number;
  maintainabilityScore: number;
  usefulnessScore: number;
  notes: string;
  reviewedCommitSha: string | null;
  reviewedAt: string;
};

export type ExternalRepoApproval = {
  repoId: string;
  decision: ExternalSourceDecision;
  scope: string;
  restrictions: string[];
  provenanceNotes: string[];
  approvedAt: string;
};

export type IntakeChecklist = {
  licenseValidated: boolean;
  dependencyScanComplete: boolean;
  sandboxExecutionComplete: boolean;
  staticAnalysisComplete: boolean;
  secretsIsolationVerified: boolean;
  networkPolicyVerified: boolean;
  provenanceLogged: boolean;
};
