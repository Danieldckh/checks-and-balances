import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveStats } from '../scripts/stats.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/sample-data.json'), 'utf8'));

test('deriveStats: hero stats reflect commit volume and repo state', () => {
  const stats = deriveStats(fixture);
  assert.equal(stats.heroStats.commitsPushed, 6);
  assert.equal(stats.heroStats.activeWorkdays, 3);
  assert.equal(stats.heroStats.reposShippedTo, 2);
  assert.equal(stats.heroStats.newAppsLaunched, 1);
});

test('deriveStats: daily volume covers every day in range, inclusive', () => {
  const stats = deriveStats(fixture);
  assert.equal(stats.dailyVolume.length, 3);
  assert.deepEqual(stats.dailyVolume.map(d => d.date), [
    '2026-05-01', '2026-05-02', '2026-05-03',
  ]);
  assert.deepEqual(stats.dailyVolume.map(d => d.count), [2, 3, 1]);
  assert.equal(stats.dailyVolume[0].label, 'May 1');
});

test('deriveStats: per-repo and inactive-repo lists separated correctly', () => {
  const stats = deriveStats(fixture);
  assert.deepEqual(
    stats.perRepo.map(r => r.name).sort(),
    ['alpha', 'beta'],
  );
  assert.deepEqual(stats.inactiveRepos, [
    { name: 'gamma', lastPushBeforeRange: '2026-03-10' },
  ]);
});

test('deriveStats: month/year labels and singleMonth flag', () => {
  const stats = deriveStats(fixture);
  assert.equal(stats.monthLabel, 'May');
  assert.equal(stats.yearLabel, '2026');
  assert.equal(stats.singleMonth, true);
});

test('deriveStats: singleMonth is false when range crosses months', () => {
  const data = {
    ...fixture,
    range: { from: '2026-04-28', to: '2026-05-03' },
  };
  const stats = deriveStats(data);
  assert.equal(stats.singleMonth, false);
});

test('deriveStats: newAppsLaunched floor — only counts new repos with ≥3 commits', () => {
  const data = {
    ...fixture,
    repos: [
      {
        name: 'sparse-new',
        private: false,
        isNewInRange: true,
        lastPushBeforeRange: null,
        commits: [
          { sha: 's1', date: '2026-05-01T09:00:00Z', author: { login: 'test' }, subject: 'init', body: '', files: [] },
          { sha: 's2', date: '2026-05-01T10:00:00Z', author: { login: 'test' }, subject: 'more', body: '', files: [] },
        ],
      },
    ],
  };
  const stats = deriveStats(data);
  assert.equal(stats.heroStats.newAppsLaunched, 0);
});
