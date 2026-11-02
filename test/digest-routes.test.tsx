import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

let runsDir: string;

function line(at: string, job: string, status: string, owner: string | null, error?: string) {
  return JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });
}

function app() {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

// Jobs are written out of order on purpose; the owner of mid/job is null.
const NORMAL = [
  line('2026-11-01T23:00:02+01:00', 'zeta/last', 'ok', 'rook'),
  line('2026-11-01T23:00:05+01:00', 'alpha/first', 'retry', 'lane-07', 'timeout'),
  line('2026-11-01T23:10:05+01:00', 'alpha/first', 'ok', 'lane-07'),
  line('2026-11-01T23:20:00+01:00', 'mid/job', 'fail', null, 'boom'),
].join('\n');

const ORDER = ['alpha/first', 'mid/job', 'zeta/last'];

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(runsDir, '2026-11-01.jsonl'), `${NORMAL}\n`);
  writeFileSync(join(runsDir, '2026-11-02.jsonl'), '');
  writeFileSync(
    join(runsDir, '2026-11-03.jsonl'),
    `${line('2026-11-03T01:00:00+01:00', 'zeta/last', 'ok', 'rook')}\nthis is not json\n${line('2026-11-03T02:00:00+01:00', 'alpha/first', 'ok', 'rook')}\n`,
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('renders a table sorted by job, with the lane banner and — for a null owner', async () => {
    const res = await app().request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    const positions = ORDER.map((job) => html.indexOf(job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    const row = html.match(/<tr[^>]*>(?:(?!<\/tr>)[\s\S])*mid\/job[\s\S]*?<\/tr>/);
    expect(row?.[0]).toContain('—');
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app().request('/digest/2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders the rows when a line is bad', async () => {
    const res = await app().request('/digest/2026-11-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha/first');
    expect(html).toContain('zeta/last');
  });

  it('returns 404 for a night with no file', async () => {
    const res = await app().request('/digest/2026-11-30');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a night not shaped YYYY-MM-DD', async () => {
    const res = await app().request('/digest/not-a-night');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns { night, rows, badLines } with rows sorted by job', async () => {
    const res = await app().request('/api/digest/2026-11-01');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-11-01');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(ORDER);
    expect(body.rows.find((r) => r.job === 'mid/job')?.owner).toBeNull();
  });

  it('returns rows: [] for an empty night', async () => {
    const res = await app().request('/api/digest/2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-11-02', rows: [], badLines: 0 });
  });

  it('keeps the rows and counts the bad line', async () => {
    const res = await app().request('/api/digest/2026-11-03');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/first', 'zeta/last']);
  });

  it('returns 404 { error: "no such night" } for a night with no file', async () => {
    const res = await app().request('/api/digest/2026-11-30');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const page = await (await app().request('/digest/2026-11-01')).text();
    const json = (await (await app().request('/api/digest/2026-11-01')).json()) as Night;
    const jobs = json.rows.map((r) => r.job);
    const pageOrder = jobs
      .map((job) => ({ job, at: page.indexOf(job) }))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.job);
    expect(jobs).toEqual(ORDER);
    expect(pageOrder).toEqual(jobs);
  });
});
