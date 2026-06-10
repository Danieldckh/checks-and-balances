import test from 'node:test';
import assert from 'node:assert/strict';
import { datesInRange } from '../scripts/logs.mjs';

test('datesInRange is inclusive of both endpoints', () => {
  assert.deepEqual(datesInRange('2026-06-05', '2026-06-10'), [
    '2026-06-05', '2026-06-06', '2026-06-07',
    '2026-06-08', '2026-06-09', '2026-06-10',
  ]);
});

test('datesInRange handles a single-day range', () => {
  assert.deepEqual(datesInRange('2026-06-10', '2026-06-10'), ['2026-06-10']);
});

test('datesInRange crosses month boundaries in local time (no UTC drift)', () => {
  assert.deepEqual(datesInRange('2026-05-30', '2026-06-02'), [
    '2026-05-30', '2026-05-31', '2026-06-01', '2026-06-02',
  ]);
});
