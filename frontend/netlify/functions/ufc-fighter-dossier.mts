import type { Config } from '@netlify/functions';

import { buildUfcFighterDossier } from '../../services/modeling/ufc-fighter-dossier-service';

export default async (req: Request) => {
  const url = new URL(req.url);
  const competitorId = url.searchParams.get('competitorId');
  if (!competitorId) {
    return new Response(JSON.stringify({ error: 'Missing competitorId query param.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  const dossier = await buildUfcFighterDossier(competitorId);
  return new Response(JSON.stringify(dossier), {
    headers: { 'content-type': 'application/json' }
  });
};

export const config: Config = {
  path: '/api/ufc/fighter-dossier'
};
