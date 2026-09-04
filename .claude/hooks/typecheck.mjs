#!/usr/bin/env node
/**
 * PostToolUse hook (Edit | Write | MultiEdit) — incremental type-check after every TS/TSX edit.
 *
 * Why: the "green" bar is tsc-clean. Catching a type error the moment it is introduced
 * is far cheaper than discovering it at /ship-check. tsconfig has `incremental: true`,
 * so after the first run this usually completes in a few seconds.
 *
 * Exit 2 feeds the error list back to Claude (non-blocking for the user's session).
 */
import { spawnSync } from 'node:child_process';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  let filePath = '';
  try {
    filePath = JSON.parse(input)?.tool_input?.file_path ?? '';
  } catch {
    process.exit(0);
  }
  if (!/\.(ts|tsx)$/.test(filePath)) process.exit(0);
  if (/\.d\.ts$/.test(filePath) || /node_modules/.test(filePath)) process.exit(0);

  const result = spawnSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
    encoding: 'utf8',
    cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    timeout: 110_000,
  });
  if (result.status === 0) process.exit(0);

  const lines = (result.stdout + result.stderr).split('\n').filter((l) => /error TS\d+/.test(l));
  const shown = lines.slice(0, 15).join('\n');
  const more = lines.length > 15 ? `\n…and ${lines.length - 15} more` : '';
  process.stderr.write(
    `tsc reports ${lines.length} error(s) after editing ${filePath}:\n${shown}${more}\n` +
      `Fix these before moving on — the green bar is tsc-clean.\n`
  );
  process.exit(2);
});
