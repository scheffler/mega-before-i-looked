import type { Night } from '../digest/types.js';

const DASH = '—';

export function DigestPage({ night }: { night: Night }) {
  return (
    <>
      <h1>{night.night}</h1>
      {night.badLines > 0 && (
        <p class="warn">
          {night.badLines} {night.badLines === 1 ? 'line' : 'lines'} did not parse
        </p>
      )}
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {[...night.rows]
              .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0))
              .map((r) => (
                <tr class={r.retries >= 3 || r.lastStatus === 'fail' ? 'warn' : undefined}>
                  <td>{r.job}</td>
                  <td>{r.owner ?? DASH}</td>
                  <td>{r.runs}</td>
                  <td>{r.retries}</td>
                  <td>{r.lastStatus}</td>
                  <td>{r.lastError ?? DASH}</td>
                  <td>{r.firstAt}</td>
                  <td>{r.lastAt}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </>
  );
}
