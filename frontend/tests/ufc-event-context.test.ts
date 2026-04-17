import assert from 'node:assert/strict';

import { buildUfcEventContext } from '@/services/modeling/ufc-event-context-service';

const context = buildUfcEventContext({
  eventId: 'event_1',
  name: 'Topuria vs Holloway',
  metadataJson: {
    division: 'Featherweight'
  },
  participants: [
    {
      role: 'COMPETITOR_A',
      competitor: {
        id: 'a',
        name: 'Ilia Topuria',
        metadataJson: {
          ufcDivision: 'M145',
          ufcRanking: 0,
          ufcChampionStatus: 'champion',
          ufcFighterDossier: { ready: true }
        }
      }
    },
    {
      role: 'COMPETITOR_B',
      competitor: {
        id: 'b',
        name: 'Max Holloway',
        metadataJson: {
          ufcDivision: 'M145',
          ufcRanking: 2,
          ufcChampionStatus: 'rank_2'
        }
      }
    }
  ]
});

assert.equal(context.divisionKey, 'M145');
assert.equal(context.titleFight, true);
assert.equal(context.rankedFight, true);
assert.equal(context.fighters[0]?.dossierReady, true);

console.log('ufc-event-context.test.ts passed');
