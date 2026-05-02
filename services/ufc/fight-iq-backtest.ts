export type UfcHistoricalFightRow = {
  fightId: string;
  fightDate: string;
  featureSnapshotAt: string;
  fighterAId: string;
  fighterBId: string;
  winnerId?: string | null;
};

export type UfcWalkForwardSplit = {
  fold: number;
  trainFightIds: string[];
  testFightIds: string[];
  trainEndDate: string;
  testStartDate: string;
  testEndDate: string;
};

function toTime(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) throw new Error(`Invalid date: ${value}`);
  return time;
}

function sortByFightDate(rows: UfcHistoricalFightRow[]) {
  return [...rows].sort((left, right) => toTime(left.fightDate) - toTime(right.fightDate));
}

export function assertNoFutureFeatureLeakage(rows: UfcHistoricalFightRow[]) {
  const offenders = rows.filter((row) => toTime(row.featureSnapshotAt) > toTime(row.fightDate));
  if (offenders.length) {
    const ids = offenders.slice(0, 5).map((row) => row.fightId).join(", ");
    throw new Error(`UFC Fight IQ future-data leakage detected for fightId(s): ${ids}`);
  }
  return true;
}

export function buildUfcWalkForwardSplits(rows: UfcHistoricalFightRow[], options: { minTrainSize?: number; testSize?: number } = {}): UfcWalkForwardSplit[] {
  assertNoFutureFeatureLeakage(rows);
  const sorted = sortByFightDate(rows);
  const minTrainSize = Math.max(1, Math.floor(options.minTrainSize ?? 50));
  const testSize = Math.max(1, Math.floor(options.testSize ?? 10));
  const splits: UfcWalkForwardSplit[] = [];

  for (let trainEnd = minTrainSize; trainEnd < sorted.length; trainEnd += testSize) {
    const train = sorted.slice(0, trainEnd);
    const test = sorted.slice(trainEnd, trainEnd + testSize);
    if (!test.length) break;

    splits.push({
      fold: splits.length + 1,
      trainFightIds: train.map((row) => row.fightId),
      testFightIds: test.map((row) => row.fightId),
      trainEndDate: train[train.length - 1].fightDate,
      testStartDate: test[0].fightDate,
      testEndDate: test[test.length - 1].fightDate
    });
  }

  return splits;
}

export function assertWalkForwardOnly(splits: UfcWalkForwardSplit[], rows: UfcHistoricalFightRow[]) {
  const byId = new Map(rows.map((row) => [row.fightId, row]));

  for (const split of splits) {
    const latestTrain = Math.max(...split.trainFightIds.map((id) => toTime(byId.get(id)?.fightDate ?? "")));
    const earliestTest = Math.min(...split.testFightIds.map((id) => toTime(byId.get(id)?.fightDate ?? "")));
    if (latestTrain >= earliestTest) {
      throw new Error(`UFC walk-forward split ${split.fold} is invalid: train data overlaps or follows test data.`);
    }
  }

  return true;
}
