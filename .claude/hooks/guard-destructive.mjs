#!/usr/bin/env node
/**
 * PreToolUse hook (Bash) — block history-rewriting and work-destroying commands.
 *
 * Why: this repo routinely carries large uncommitted feature work between commits.
 * A stray `git reset --hard` or `git checkout -- .` would erase days of it. Force-pushes
 * rewrite the shared main branch. These stay human-only decisions.
 *
 * Exit 2 blocks the call and returns the reason to Claude.
 */
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  let cmd = '';
  try {
    cmd = JSON.parse(input)?.tool_input?.command ?? '';
  } catch {
    process.exit(0);
  }

  const rules = [
    { re: /\bgit\s+push\b[^|;&]*(\s--force\b|\s-f\b|\s--force-with-lease\b)/, why: 'force-push rewrites shared history' },
    { re: /\bgit\s+reset\s+--hard\b/, why: 'reset --hard discards uncommitted work' },
    { re: /\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, why: 'restoring the whole tree discards uncommitted work' },
    { re: /\bgit\s+clean\s+-[a-zA-Z]*f/, why: 'git clean -f deletes untracked files (new features live there until committed)' },
    { re: /\bgit\s+branch\s+-D\b/, why: 'force-deleting a branch loses unmerged commits' },
    { re: /\bgit\s+stash\s+(drop|clear)\b/, why: 'dropping stashes loses work' },
    { re: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+(\/|~|\.|\.\.|\*|\$HOME)(\s|$)/, why: 'recursive delete of a root/home/project path' },
  ];
  for (const { re, why } of rules) {
    if (re.test(cmd)) {
      process.stderr.write(
        `Blocked by .claude/hooks/guard-destructive.mjs: ${why}.\nCommand: ${cmd}\n` +
          `If this is genuinely intended, the user should run it themselves.\n`
      );
      process.exit(2);
    }
  }
  process.exit(0);
});
