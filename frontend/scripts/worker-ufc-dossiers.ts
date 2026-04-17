import { getNumberArg, getStringArg, logStep, parseArgs } from './_runtime-utils';
import { refreshUfcFighterDossiers } from '@/services/modeling/ufc-fighter-dossier-service';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const competitorIdsArg = getStringArg(args, 'competitorIds');
  const limit = getNumberArg(args, 'limit', 30);
  const competitorIds = competitorIdsArg ? competitorIdsArg.split(',').map((value) => value.trim()).filter(Boolean) : undefined;

  logStep('worker:ufc-dossiers:start', { competitorIds, limit });
  const result = await refreshUfcFighterDossiers({ competitorIds, limit });
  logStep('worker:ufc-dossiers:done', result);
}

main().catch((error) => {
  console.error('[runtime] worker:ufc-dossiers:error', error);
  process.exitCode = 1;
});
