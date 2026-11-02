import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('gives 5 jobs sorted by job and counts the 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night!.night).toBe('2026-10-28');
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('fixtures/refresh: 3 retries, ends ok, keeps the last error', () => {
    const row = night!.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('notes/backup fails with "quota exceeded"', () => {
    const row = night!.rows.find((r) => r.job === 'notes/backup');
    expect(row?.lastStatus).toBe('fail');
    expect(row?.lastError).toBe('quota exceeded');
    expect(row?.owner).toBe('lane-07');
  });

  it('digest/render keeps its row with owner null', () => {
    const row = night!.rows.find((r) => r.job === 'digest/render');
    expect(row).toBeDefined();
    expect(row!.owner).toBeNull();
    expect(row!.lastError).toBeNull();
  });

  it('keeps times exactly as logged, offset included', () => {
    const row = night!.rows.find((r) => r.job === 'lane/sync');
    expect(row?.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(row?.lastAt).toBe('2026-10-29T05:00:04+01:00');
    expect(row?.retries).toBe(1);
  });
});

describe('readNight on a temp runs dir', () => {
  let dir: string;
  const write = (night: string, lines: string[]) =>
    writeFileSync(join(dir, `${night}.jsonl`), lines.join('\n'));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is a path', () => {
    expect(readNight(dir, '../etc/passwd')).toBeNull();
  });

  it('gives rows: [] for an empty file', () => {
    write('2026-01-02', []);
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('counts bad JSON, missing fields and unknown statuses without throwing', () => {
    write('2026-01-03', [
      '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      'not json',
      '[]',
      'null',
      '{"job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-03T02:00:00+01:00","status":"ok","owner":"x"}',
      '{"at":"2026-01-03T02:00:00+01:00","job":"a","owner":"x"}',
      '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"ok"}',
      '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"skipped","owner":"x"}',
      '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"ok","owner":7}',
      '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"ok","owner":"x","error":5}',
      '',
      '   ',
    ]);
    const night = readNight(dir, '2026-01-03');
    expect(night?.badLines).toBe(10);
    expect(night?.rows).toHaveLength(1);
    expect(night?.rows[0]?.runs).toBe(1);
  });

  it('takes lastStatus from the latest line and lastError from the latest line with one', () => {
    write('2026-01-04', [
      '{"at":"2026-01-04T01:00:00-05:00","job":"j","status":"fail","owner":"x","error":"first"}',
      '{"at":"2026-01-04T02:00:00-05:00","job":"j","status":"retry","owner":"x","error":"second"}',
      '{"at":"2026-01-04T03:00:00-05:00","job":"j","status":"ok","owner":"x"}',
    ]);
    const row = readNight(dir, '2026-01-04')?.rows[0];
    expect(row?.lastStatus).toBe('ok');
    expect(row?.lastError).toBe('second');
    expect(row?.firstAt).toBe('2026-01-04T01:00:00-05:00');
    expect(row?.lastAt).toBe('2026-01-04T03:00:00-05:00');
  });

  it('uses file order for first and last, not string order across offsets', () => {
    write('2026-01-05', [
      '{"at":"2026-01-05T09:00:00+09:00","job":"j","status":"ok","owner":"x"}',
      '{"at":"2026-01-05T01:30:00+00:00","job":"j","status":"ok","owner":"x"}',
    ]);
    const row = readNight(dir, '2026-01-05')?.rows[0];
    expect(row?.firstAt).toBe('2026-01-05T09:00:00+09:00');
    expect(row?.lastAt).toBe('2026-01-05T01:30:00+00:00');
  });

  it('owner: the latest line that names one wins; null only if none does', () => {
    write('2026-01-06', [
      '{"at":"t1","job":"a","status":"ok","owner":"first"}',
      '{"at":"t2","job":"a","status":"ok","owner":"second"}',
      '{"at":"t3","job":"a","status":"ok","owner":null}',
      '{"at":"t1","job":"b","status":"ok","owner":null}',
      '{"at":"t2","job":"b","status":"ok","owner":null}',
    ]);
    const rows = readNight(dir, '2026-01-06')?.rows;
    expect(rows?.map((r) => [r.job, r.owner])).toEqual([
      ['a', 'second'],
      ['b', null],
    ]);
  });

  it('handles CRLF line endings and a trailing newline', () => {
    writeFileSync(
      join(dir, '2026-01-07.jsonl'),
      '{"at":"t1","job":"a","status":"ok","owner":"x"}\r\n{"at":"t2","job":"a","status":"retry","owner":"x"}\r\n',
    );
    const night = readNight(dir, '2026-01-07');
    expect(night?.badLines).toBe(0);
    expect(night?.rows[0]?.runs).toBe(2);
    expect(night?.rows[0]?.retries).toBe(1);
  });
});
