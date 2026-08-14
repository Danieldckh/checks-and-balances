import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hhmmToMin, minutesToClock, localDayLabel, utcToLocal, matchLogProject,
  parseLogEvents, blocksForDay, computeTimesheet, deriveTimesheet,
} from '../scripts/timesheet.mjs';

const RULES = [
  { project: '__EXCLUDE__', any: ['qr-snippet', 'poetry'] },
  { project: 'Mahindra CRM', any: ['mahindra'] },
  { project: 'Agri360', any: ['agri360', 'agri4all'] },
];
const cfg = {
  tzOffsetMinutes: 120,
  blockCapMinutes: 60,
  fallbackProject: 'Life OS / Ops',
  excludeRepos: ['qr-snippet-app'],
  repoToProject: { 'Agri360': 'Agri360', 'mahindra-crm': 'Mahindra CRM', 'qr-snippet-app': 'QR' },
  logRules: RULES,
  dayOverrides: {},
};

test('hhmmToMin / minutesToClock round-trip', () => {
  assert.equal(hhmmToMin('07:00'), 420);
  assert.equal(minutesToClock(420), '07:00');
  assert.equal(minutesToClock(930), '15:30');
});

test('utcToLocal shifts UTC into SAST date+mins', () => {
  assert.deepEqual(utcToLocal('2026-06-22T16:43:00Z', 120), { date: '2026-06-22', mins: 18 * 60 + 43 });
  assert.deepEqual(utcToLocal('2026-06-22T23:30:00Z', 120), { date: '2026-06-23', mins: 90 });
});

test('localDayLabel', () => {
  assert.equal(localDayLabel('2026-06-22'), 'Mon 22 Jun');
  assert.equal(localDayLabel('2026-06-26'), 'Fri 26 Jun');
});

test('matchLogProject: first rule wins, fallback otherwise', () => {
  assert.equal(matchLogProject('Mahindra CRM thing', RULES, 'Life OS / Ops'), 'Mahindra CRM');
  assert.equal(matchLogProject('Agri360 fix', RULES, 'Life OS / Ops'), 'Agri360');
  assert.equal(matchLogProject('Graph cleanup', RULES, 'Life OS / Ops'), 'Life OS / Ops');
  assert.equal(matchLogProject('poetry note', RULES, 'Life OS / Ops'), '__EXCLUDE__');
});

test('parseLogEvents handles both timestamp formats and drops excluded', () => {
  const md = ['## 2026-06-29', '- 04:48 — Agri360 widget', '- 2026-06-29 12:17 — Mahindra thing', '- 05:00 — poetry stuff'].join('\n');
  const evs = parseLogEvents(md, RULES, 'Life OS / Ops');
  assert.equal(evs.length, 2); // poetry excluded
  assert.equal(evs[0].project, 'Agri360');
  assert.equal(evs[0].mins, 288);
  assert.equal(evs[1].project, 'Mahindra CRM');
});

test('blocksForDay: lone event = one cap-length block ending at the event', () => {
  const blocks = blocksForDay([{ mins: 600, project: 'Agri360' }], 60);
  assert.equal(blocks.length, 1);
  assert.deepEqual({ s: blocks[0].startMin, e: blocks[0].endMin, m: blocks[0].minutes }, { s: 540, e: 600, m: 60 });
});

test('blocksForDay: tight events split the gap; wide gap is capped', () => {
  const blocks = blocksForDay([
    { mins: 600, project: 'Agri360' },   // 10:00
    { mins: 630, project: 'Agri360' },   // 10:30  (30-min gap, fully counted)
    { mins: 800, project: 'Mahindra CRM' }, // 13:20 (170-min gap, capped at 60)
  ], 60);
  assert.equal(blocks[0].minutes, 60);                 // 09:00->10:00
  assert.equal(blocks[1].minutes, 30);                 // 10:00->10:30
  assert.equal(blocks[2].minutes, 60);                 // 13:20-60 -> 13:20 (capped)
  const total = blocks.reduce((s, b) => s + b.minutes, 0);
  assert.equal(total, 150);                            // not the full 4h20 span
});

test('override end extends/clamps the last block to the forced end', () => {
  const blocks = blocksForDay([
    { mins: 360, project: 'Agri360' },    // 06:00
    { mins: 695, project: 'Mahindra CRM' }, // 11:35
    { mins: 960, project: 'Agri360' },    // 16:00 dropped (> 12:30)
  ], 60, { end: hhmmToMin('12:30') });
  const last = blocks[blocks.length - 1];
  assert.equal(last.endMin, 750);                      // 12:30
  assert.equal(last.project, 'Mahindra CRM');
  assert.equal(last.minutes, 750 - last.startMin);     // extended to 12:30
});

test('override start forces first block start and drops earlier events', () => {
  const blocks = blocksForDay([
    { mins: 120, project: 'Agri360' },    // 02:00 dropped (< 04:00)
    { mins: 288, project: 'Agri360' },    // 04:48
  ], 60, { start: hhmmToMin('04:00') });
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].startMin, 240);               // 04:00
  assert.equal(blocks[0].minutes, 48);                 // 04:00 -> 04:48
});

test('computeTimesheet: excludes repos, attributes commits, sums per project', () => {
  const data = {
    range: { from: '2026-06-22', to: '2026-06-22' },
    repos: [
      { name: 'Agri360', commits: [{ date: '2026-06-22T07:00:00Z', subject: 'x' }] },      // 09:00 SAST
      { name: 'qr-snippet-app', commits: [{ date: '2026-06-22T08:00:00Z', subject: 'y' }] }, // excluded
    ],
  };
  const ts = computeTimesheet(data, '', cfg);
  assert.equal(ts.projects[0].project, 'Agri360');
  assert.equal(ts.projects[0].minutes, 60);            // lone commit = 1h block
  assert.ok(!ts.projects.some(p => p.project === 'QR'));
  assert.equal(ts.totalHours, 1);
});

test('deriveTimesheet shapes output for the renderer with real start/end', () => {
  const data = {
    range: { from: '2026-06-26', to: '2026-06-26' },
    repos: [{ name: 'Agri360', commits: [
      { date: '2026-06-26T04:00:00Z', subject: 'a' },  // 06:00 SAST
      { date: '2026-06-26T09:35:00Z', subject: 'b' },  // 11:35 SAST
    ] }],
  };
  const cfg2 = { ...cfg, dayOverrides: { '2026-06-26': { end: '12:30' } } };
  const out = deriveTimesheet(data, '', cfg2);
  assert.equal(out.days.length, 1);
  assert.equal(out.days[0].window.end, '12:30');       // override honoured end-to-end
  assert.ok(out.days[0].hours > 0);
  assert.equal(out.days[0].window.start, '05:00');     // 1h before first event
});
