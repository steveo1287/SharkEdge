import { readFile } from 'node:fs/promises';

import { getStringArg, logStep, parseArgs } from './_runtime-utils';
import { importUfcRankingSnapshot, type RawUfcRankingSnapshot } from '@/services/modeling/ufc-rankings-service';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = getStringArg(args, 'input');
  if (!input) {
    throw new Error('Missing required --input=/path/to/ufc-rankings.json argument.');
  }
  const raw = await readFile(input, 'utf8');
  const snapshot = JSON.parse(raw) as RawUfcRankingSnapshot;
  logStep('worker:ufc-rankings:start', { input, division: snapshot.division });
  const result = await importUfcRankingSnapshot(snapshot);
  logStep('worker:ufc-rankings:done', result);
}

main().catch((error) => {
  console.error('[runtime] worker:ufc-rankings:error', error);
  process.exitCode = 1;
});
