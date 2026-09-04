#!/usr/bin/env bash
#
# enable-ci-push.sh — one-time, interactive setup so this repo can always push
# GitHub Actions workflows (and stop storing a token in the remote URL).
#
# What it does:
#   1. Switches gh to the account that owns this repo.
#   2. Adds the `workflow` (+`repo`) scope to that account — interactive browser/device prompt.
#   3. Makes gh git's credential helper (no more token in the remote URL).
#   4. Rewrites `origin` to a clean, token-free HTTPS URL.
#   5. Moves ci/ci.yml -> .github/workflows/ci.yml, commits, and pushes.
#
# Run it from the repo root:   bash scripts/enable-ci-push.sh
#
set -euo pipefail

HOST=github.com

command -v gh >/dev/null 2>&1 || { echo "GitHub CLI not found. Install it:  brew install gh"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "git not found."; exit 1; }

# Derive owner/repo from the current origin URL (works with or without an embedded token).
ORIGIN_URL="$(git remote get-url origin)"
SLUG="$(printf '%s' "$ORIGIN_URL" | sed -E 's#^.*github\.com[:/]+##; s#\.git$##')"   # e.g. pyhrishi/api-dashboard
OWNER="${SLUG%%/*}"
REPO="${SLUG#*/}"
[ -n "$OWNER" ] && [ -n "$REPO" ] || { echo "Could not parse owner/repo from: $ORIGIN_URL"; exit 1; }
echo "Repo: $OWNER/$REPO"

# 1. Make sure the owner account is the active gh account (it has push rights to its own repo).
if gh auth status --hostname "$HOST" 2>/dev/null | grep -q "account $OWNER"; then
  echo "Switching active GitHub CLI account to '$OWNER'…"
  gh auth switch --hostname "$HOST" --user "$OWNER" || true
else
  echo "'$OWNER' is not logged in to gh yet — starting login (interactive)…"
  gh auth login --hostname "$HOST" --git-protocol https --web -s workflow -s repo
fi

# 2. Add the workflow scope (interactive: enter the one-time code shown, in your browser).
echo
echo ">>> A browser/device prompt will appear. Approve the 'workflow' + 'repo' scopes for '$OWNER'."
gh auth refresh --hostname "$HOST" -s workflow -s repo

# 3. Let gh serve git's HTTPS credentials.
gh auth setup-git

# 4. Strip any embedded token from origin.
CLEAN_URL="https://$HOST/$OWNER/$REPO.git"
git remote set-url origin "$CLEAN_URL"
echo "origin is now: $CLEAN_URL  (no token stored)"

# 5. Move the CI workflow into place, if it's still parked in ci/.
if [ -f ci/ci.yml ]; then
  mkdir -p .github/workflows
  git mv ci/ci.yml .github/workflows/ci.yml
  git rm -q --ignore-unmatch ci/README.md
  rmdir ci 2>/dev/null || true
  git commit -q -m "ci: activate GitHub Actions workflow at .github/workflows/ci.yml

Now that the credential has the 'workflow' scope, the pipeline lives at its
canonical path and runs on every push and PR.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
  echo "Moved ci/ci.yml -> .github/workflows/ci.yml and committed."
else
  echo "No ci/ci.yml to move (already activated?) — continuing."
fi

# 6. Push.
git push origin main
echo
echo "✓ Done. CI is at .github/workflows/ci.yml, the token is out of the remote URL,"
echo "  and future workflow pushes will just work."
