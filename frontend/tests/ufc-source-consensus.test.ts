import assert from 'node:assert/strict';

import { buildUfcSourceConsensus } from '@/services/modeling/ufc-source-consensus';

const consensus = buildUfcSourceConsensus([
  {
    source: 'tapology',
    resolutionScore: 82,
    profile: {
      camp: 'American Top Team',
      wrestlingLevel: 'collegiate',
      age: 29
    }
  },
  {
    source: 'sherdog',
    resolutionScore: 78,
    profile: {
      camp: 'American Top Team',
      wrestlingLevel: 'collegiate',
      age: 29
    }
  },
  {
    source: 'wikipedia',
    resolutionScore: 64,
    profile: {
      camp: 'ATT',
      wrestlingLevel: 'college',
      age: 29
    }
  }
]);

assert.equal(consensus.sourceCount, 3);
assert.equal(consensus.supportingSources.includes('tapology'), true);
assert.equal(consensus.consensusFields.camp, 'American Top Team');
assert.equal(consensus.sourceConfidenceScore > 6, true);

console.log('ufc-source-consensus.test.ts passed');
