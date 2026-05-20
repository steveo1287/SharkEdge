import assert from "node:assert/strict";

import { canUseActiveUfcWhatIfProfile, evaluateActiveUfcRosterStatus } from "@/services/ufc/active-roster";

const upcoming = evaluateActiveUfcRosterStatus({ hasUpcomingUfcFight: true, payload: {} });
assert.equal(upcoming.active, true);
assert.equal(upcoming.confidence, "high");
assert.ok(upcoming.signals.includes("upcoming_ufc_fight"));

const rosterFlag = evaluateActiveUfcRosterStatus({ payload: { roster: { active: true } } });
assert.equal(rosterFlag.active, true);
assert.ok(rosterFlag.signals.includes("roster_active_flag"));

const inactive = evaluateActiveUfcRosterStatus({ payload: {}, hasUpcomingUfcFight: false, hasRecentUfcFight: false });
assert.equal(inactive.active, false);
assert.ok(inactive.blockers.includes("inactive_or_unproven_active_ufc_roster"));

const ready = canUseActiveUfcWhatIfProfile({ canonicalStatus: "WHAT_IF_READY", whatIfReady: true, completenessScore: 84, activeRoster: upcoming });
assert.equal(ready.ok, true);

const blocked = canUseActiveUfcWhatIfProfile({ canonicalStatus: "WHAT_IF_READY", whatIfReady: true, completenessScore: 84, activeRoster: inactive });
assert.equal(blocked.ok, false);
assert.ok(blocked.blockers.includes("inactive_or_unproven_active_ufc_roster"));

const weak = canUseActiveUfcWhatIfProfile({ canonicalStatus: "RESEARCH_ONLY", whatIfReady: false, completenessScore: 61, activeRoster: upcoming });
assert.equal(weak.ok, false);
assert.ok(weak.blockers.includes("canonical_status:RESEARCH_ONLY"));
assert.ok(weak.blockers.includes("profile_score_below_72"));
