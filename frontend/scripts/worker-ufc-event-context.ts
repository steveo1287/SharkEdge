import { getNumberArg, getStringArg, logStep, parseArgs } from './_runtime-utils';
import { refreshUpcomingUfcEventContexts } from '@/services/modeling/ufc-event-context-service';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const eventIdsArg = getStringArg(args, 'eventIds');
  const limit = getNumberArg(args, 'limit', 30);
  const eventIds = eventIdsArg ? eventIdsArg.split(',').map((value) => value.trim()).filter(Boolean) : undefined;
  logStep('worker:ufc-event-context:start', { eventIds, limit });
  const result = await refreshUpcomingUfcEventContexts({ eventIds, limit });
  logStep('worker:ufc-event-context:done', result);
}

main().catch((error) => {
  console.error('[runtime] worker:ufc-event-context:error', error);
  process.exitCode = 1;
});
