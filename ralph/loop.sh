#!/usr/bin/env bash
#
# Ralph loop — build the remaining LLM-internals lessons, one per iteration.
#
# Each iteration invokes `claude -p` with ralph/PROMPT.md. That prompt claims the first
# `todo` row in ralph/PROGRESS.md, builds exactly one lesson (write -> review -> rewrite ->
# verify -> finalize), commits it locally, and stops. This script then loops to the next.
#
# The loop ends when no `todo` rows remain (the prompt writes ralph/DONE), or the hard
# iteration cap is hit (a runaway backstop), whichever comes first.
#
# AUTONOMY: this runs Claude with `--dangerously-skip-permissions`. Headless `claude -p` has
# no human to answer permission prompts, and `acceptEdits` only auto-approves file edits — NOT
# the npm/git/node commands each iteration must run. So full skip is what actually works
# unattended. It will edit files, build, and commit LOCALLY. It will NOT push (the prompt
# forbids it, and this script never pushes). Read PROMPT.md before trusting this unattended.
#
# SAFER ALTERNATIVE: instead of skip-all, add an allowlist to .claude/settings.local.json for
# exactly `npm run build`, `git add/commit`, `node scripts/verify-lesson.mjs`, then switch the
# flag below to `--permission-mode acceptEdits`. See PERMS below.
#
# Usage:
#   ./ralph/loop.sh           # run until done or cap
#   CAP=5 ./ralph/loop.sh     # at most 5 iterations this session
#   PERMS='--permission-mode acceptEdits' ./ralph/loop.sh   # if you set up an allowlist instead
#
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1   # repo root
ROOT="$(pwd)"

CAP="${CAP:-25}"                    # hard backstop on iterations
PERMS="${PERMS:---dangerously-skip-permissions}"   # autonomy flag (override to use an allowlist)
PROGRESS="ralph/PROGRESS.md"
DONE="ralph/DONE"
PROMPT="ralph/PROMPT.md"
LOGDIR="ralph/logs"
mkdir -p "$LOGDIR"

if ! command -v claude >/dev/null 2>&1; then
  echo "FATAL: 'claude' CLI not found on PATH." >&2
  exit 1
fi

# Pre-flight: each iteration does `git add -A && git commit`, so any pre-existing uncommitted
# work would get swept into the first lesson's commit. Refuse to start on a dirty tree unless
# the operator explicitly opts in.
if [ -z "${ALLOW_DIRTY:-}" ] && [ -n "$(git status --porcelain)" ]; then
  echo "FATAL: working tree is dirty. The loop commits with 'git add -A' and would bundle your" >&2
  echo "       uncommitted changes into a lesson commit. Commit or stash them first, e.g.:" >&2
  echo "         git stash   # or: git add -A && git commit -m 'wip'" >&2
  echo "       Then re-run. To override (you accept the bundling), set ALLOW_DIRTY=1." >&2
  exit 1
fi

iter=0
while :; do
  if [ -f "$DONE" ]; then
    echo "==> ralph/DONE present — all lessons built. Stopping."
    break
  fi
  if ! grep -qE '\|\s*todo\s*\|' "$PROGRESS"; then
    echo "==> No 'todo' rows left in $PROGRESS — nothing to do. Stopping."
    break
  fi
  if [ "$iter" -ge "$CAP" ]; then
    echo "==> Hit iteration cap ($CAP). Stopping. Re-run to continue."
    break
  fi

  iter=$((iter + 1))
  ts="$(date +%Y%m%d-%H%M%S)"
  log="$LOGDIR/iter-${iter}-${ts}.log"
  echo "==> Iteration $iter/$CAP — $(date) — logging to $log"

  # One lesson per invocation. $PERMS grants the autonomy to edit + build + commit unattended.
  claude -p "$(cat "$PROMPT")" \
    $PERMS \
    2>&1 | tee "$log"

  echo "==> Iteration $iter finished. HEAD: $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null)"
  echo
done

echo "==> Ralph loop exited after $iter iteration(s)."
echo "    Progress:"
grep -E '^\|\s*[0-9]' "$PROGRESS" | awk -F'|' '{printf "      %-26s %s\n", $3, $5}'
