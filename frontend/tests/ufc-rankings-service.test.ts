import assert from 'node:assert/strict';

import { normalizeUfcRankingSnapshot } from '@/services/modeling/ufc-rankings-service';

const snapshot = normalizeUfcRankingSnapshot({
  source: 'manual',
  division: 'Lightweight',
  championName: 'Islam Makhachev',
  entries: [
    { rank: 1, fighterName: 'Arman Tsarukyan' },
    { rank: 2, fighterName: 'Charles Oliveira' },
    { rank: 3, fighterName: 'Justin Gaethje' }
  ]
});

assert.equal(snapshot.divisionKey, 'M155');
assert.equal(snapshot.entries.length, 3);
assert.equal(snapshot.divisionLabel, 'Lightweight');

console.log('ufc-rankings-service.test.ts passed');
