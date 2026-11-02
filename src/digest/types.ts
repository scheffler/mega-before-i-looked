// The digest's contract: one row per job for one night of runs/<night>.jsonl.
// Times stay exactly as logged, offset included (styleguide: never convert to UTC).

export type RunStatus = 'ok' | 'retry' | 'fail';

// One parsed line of a run log.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

export type DigestRow = {
  job: string;
  // null when the log says so; views render it as `—`.
  owner: string | null;
  // Every line for this job, whatever its status.
  runs: number;
  // Lines with status `retry`.
  retries: number;
  lastStatus: RunStatus;
  // The error of the latest line that had one, or null.
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  // Sorted by job.
  rows: DigestRow[];
  // Lines that didn't parse as a run line: counted, never thrown.
  badLines: number;
};

// Reads runsDir/<night>.jsonl. Returns null when the night has no file; an empty file gives
// `rows: []`.
export type ReadNight = (runsDir: string, night: string) => Night | null;
