import assert from "node:assert/strict";

import {
  buildMlbMicroTendencyFeedsFromStatcast,
  parseMlbStatcastCsv
} from "@/services/simulation/mlb-statcast-micro-feed-builder";
import { normalizeMlbStatcastRowsForMicroFeed } from "@/services/simulation/mlb-statcast-row-normalizer";

const csv = `pitch_type,game_date,player_name,pitcher_name,batter_name,batter,pitcher,events,description,stand,p_throws,home_team,away_team,type,bb_type,balls,strikes,on_3b,on_2b,on_1b,outs_when_up,inning,inning_topbot,hc_x,hc_y,launch_speed,launch_angle,estimated_woba_using_speedangle,woba_value,estimated_slg_using_speedangle,iso_value,zone,delta_run_exp
FF,2026-04-01,Starter,Starter,Power Bat,1001,9001,,called_strike,R,L,HOM,AWY,S,,0,0,,,,0,1,Top,,,,,,,,5,-0.02
FF,2026-04-01,Starter,Starter,Power Bat,1001,9001,single,hit_into_play,R,L,HOM,AWY,X,ground_ball,0,1,,,,0,1,Top,104,155,98,4,0.43,0.9,0.55,0,6,0.11
SL,2026-04-01,Starter,Starter,Power Bat,1001,9001,strikeout,swinging_strike,R,L,HOM,AWY,S,,1,2,,,,1,2,Top,,,,,,,,14,-0.19
CH,2026-04-01,Starter,Starter,Power Bat,1001,9001,home_run,hit_into_play,R,L,HOM,AWY,X,fly_ball,2,0,,7788,,1,3,Top,92,121,106,27,0.88,2,1.95,3,5,1.25
SI,2026-04-01,Starter,Starter,Power Bat,1001,9001,walk,ball,R,L,HOM,AWY,B,,3,1,,,,2,4,Top,,,,,,,,13,0.18
FF,2026-04-01,Starter,Starter,Power Bat,1001,9001,double,hit_into_play,R,L,HOM,AWY,X,line_drive,3,2,,,7788,2,5,Top,101,130,101,14,0.72,1.25,1.25,1,3,0.44
`;

const parsed = parseMlbStatcastCsv(csv);
assert.equal(parsed.length, 6);

const normalized = normalizeMlbStatcastRowsForMicroFeed(parsed);
assert.equal(normalized[0].bat_team, "AWY");
assert.equal(normalized[0].fld_team, "HOM");
assert.equal(normalized[0].batter_name, "Power Bat");
assert.equal(normalized[0].pitcher_name, "Starter");

const feed = buildMlbMicroTendencyFeedsFromStatcast(normalized, {
  sourceLabel: "unit-test-statcast",
  minBatterPitches: 1,
  minPitcherPitches: 1,
  minTerminalEvents: 1,
  generatedAt: "2026-06-07T12:00:00.000Z"
});

assert.equal(feed.modelVersion, "mlb-statcast-micro-feed-builder-v1");
assert.equal(feed.sourceLabel, "unit-test-statcast");
assert.equal(feed.generatedAt, "2026-06-07T12:00:00.000Z");
assert.equal(feed.diagnostics.rawRows, 6);
assert.equal(feed.diagnostics.usableRows, 6);
assert.equal(feed.diagnostics.terminalPitchRows, 5);
assert.equal(feed.diagnostics.battedBallRows, 3);
assert.equal(feed.diagnostics.batterCount, 1);
assert.equal(feed.diagnostics.pitcherCount, 1);

const batter = feed.batters[0];
assert.equal(batter.mlbId, "1001");
assert.equal(batter.team, "AWY");
assert.equal(batter.bats, "R");
assert.ok(Number(batter.pitchTypeRunValue?.FF) > 0);
assert.ok(Number(batter.pitchTypeWhiffRate?.SL) > 0);
assert.ok(Number(batter.pitchTypeHardHitRate?.CH) > 0);
assert.ok(Number(batter.outcomeByBaseState?.["-2-"]?.homeRunRate) > 0);
assert.ok(Number(batter.runnersOnBase?.risp?.expectedWoba) > 0.3);
assert.ok(Number(batter.sprayOverall?.pull) > 0);
assert.ok(Number(batter.clutchIndex) > 0.7);

const pitcher = feed.pitchers[0];
assert.equal(pitcher.mlbId, "9001");
assert.equal(pitcher.team, "HOM");
assert.equal(pitcher.throws, "L");
assert.ok(Number(pitcher.pitchMixOverall.FF) > Number(pitcher.pitchMixOverall.CH));
assert.ok(Number(pitcher.pitchMixByCount?.["0-0"]?.FF) > 0);
assert.ok(Number(pitcher.pitchMixByBatterHand?.R?.FF) > 0);
assert.ok(Number(pitcher.whiffRateByPitch?.SL) > 0);
assert.ok(Number(pitcher.hardHitRateAllowedByPitch?.CH) > 0);
assert.ok(Number(pitcher.outcomeByBatterHand?.R?.homeRunRate) > 0);

console.log("mlb-statcast-micro-feed-builder.test.ts passed");
