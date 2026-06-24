#!/usr/bin/env bash
set -euo pipefail

# Build the static site and deploy it to Cloudflare Pages.
#
# Serves at: https://how-llms-work.rightspeed.pages.dev
# (a `how-llms-work` branch alias under the shared `rightspeed` Pages project).
#
# Credentials are read from the environment first, falling back to the local
# files the publish-html skill already maintains. NOTHING SECRET is committed —
# this script only reads tokens, never writes them into the repo.

CRED_DIR="$HOME/.claude/publish-html"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f "$CRED_DIR/api_token" ]; then
  CLOUDFLARE_API_TOKEN="$(tr -d '[:space:]' < "$CRED_DIR/api_token")"
fi
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ] && [ -f "$CRED_DIR/account_id" ]; then
  CLOUDFLARE_ACCOUNT_ID="$(tr -d '[:space:]' < "$CRED_DIR/account_id")"
fi
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "error: no Cloudflare credentials." >&2
  echo "  set CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID), or place them at" >&2
  echo "  $CRED_DIR/api_token and $CRED_DIR/account_id" >&2
  exit 1
fi

pnpm build
npx --yes wrangler pages deploy dist \
  --project-name=rightspeed \
  --branch=how-llms-work \
  --commit-dirty=true
