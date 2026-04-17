import assert from 'node:assert/strict';

import { getUfcDivisionDefinition, normalizeUfcDivisionKey } from '@/services/modeling/ufc-division-catalog';

assert.equal(normalizeUfcDivisionKey('Lightweight'), 'M155');
assert.equal(normalizeUfcDivisionKey("Women's Strawweight"), 'W115');
assert.equal(getUfcDivisionDefinition('M170')?.label, 'Welterweight');

console.log('ufc-division-catalog.test.ts passed');
