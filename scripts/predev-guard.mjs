#!/usr/bin/env node
/**
 * predev guard — refuse to start a SECOND `next dev` server.
 *
 * Multiple dev servers share one `.next` build directory and overwrite each other's
 * compiled chunks, which makes pages 404 their JS intermittently (blank / won't-open
 * pages). npm runs this automatically before `npm run dev`.
 */
import { execSync } from 'node:child_process';

let running = '';
try {
  // A live server shows up as `next-server`; the launcher shows as `next dev`.
  running = execSync('pgrep -f "next-server" || true', { encoding: 'utf8' }).trim();
} catch {
  process.exit(0); // pgrep unavailable — don't block
}

if (running) {
  const pids = running.split('\n').filter(Boolean).join(', ');
  console.error('\n\x1b[33m⚠  A Next dev server is already running (pid ' + pids + ').\x1b[0m');
  console.error('   Starting a second one corrupts the shared .next and makes pages 404 intermittently.');
  console.error('   → Reuse the running server, or stop it first:');
  console.error('       pkill -f "next dev"; rm -rf .next; npm run dev\n');
  process.exit(1);
}
process.exit(0);
