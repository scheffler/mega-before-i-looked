import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import type { RunStatus } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

// Run lines per status for one night.
export type NightCounts = Record<RunStatus, number>;

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: string[];
  // Per night on disk; null when the digest can't vouch for the counts (rendered as `—`).
  counts: Record<string, NightCounts | null>;
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

const isStatus = (s: unknown): s is RunStatus => s === 'ok' || s === 'retry' || s === 'fail';

// DigestRow keeps runs, retries and the last status, which can't separate ok from fail, so the
// per-status split is read off the log lines. The digest's rows gate the result: a night whose
// totals differ from readNight's, or whose reader returns null or throws, has no counts.
export function countNight(runsDir: string, night: string): NightCounts | null {
  try {
    const parsed = readNight(runsDir, night);
    if (!parsed) return null;
    const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
    for (const line of readFileSync(join(runsDir, `${night}.jsonl`), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const run: unknown = JSON.parse(line);
        const status = run && typeof run === 'object' ? (run as { status?: unknown }).status : undefined;
        if (isStatus(status)) counts[status] += 1;
      } catch {
        // a bad line: the digest counts it as such, not as a run
      }
    }
    const runs = parsed.rows.reduce((n, r) => n + r.runs, 0);
    const retries = parsed.rows.reduce((n, r) => n + r.retries, 0);
    if (counts.ok + counts.retry + counts.fail !== runs || counts.retry !== retries) return null;
    return counts;
  } catch {
    return null;
  }
}

export function readStatus(config: RigConfig): Status {
  const nights = nightsOnDisk(config.runsDir);
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
    counts: Object.fromEntries(nights.map((n) => [n, countNight(config.runsDir, n)])),
  };
}
