// A/B subject lines with open and click tracking, for newsletters and
// press releases.
//
//   sql.js     columns on blasts / blast_recipients; blast_links
//   send.js    the tracked send path (tokens, HTML part with pixel and
//              links, A/B groups) — used by blast.send / blast.resend in
//              actions/field.js and by the winner job
//   track.js   public GET /o/<token>.gif and /c/<token>/<n>
//   winner.js  the job that picks the winner and sends it to the rest
//   stats.js   GET /api/blasts/stats (desk only)
export { sql } from './sql.js';
export { publicRoutes } from './track.js';
export { api } from './stats.js';
import { pickWinner } from './winner.js';
import { WINNER_JOB } from './send.js';

export const jobs = { [WINNER_JOB]: pickWinner };

// Open and click counts per send are the desk's, like the sends themselves.
export const deskOnlyReads = ['/blasts/stats'];
