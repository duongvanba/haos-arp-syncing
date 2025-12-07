#!/usr/bin/env bash
set -euo pipefail

OPTIONS_FILE="/data/options.json" 

if [ -f "$OPTIONS_FILE" ]; then
  MODEM_IP=$(jq -r '.ip // empty' "$OPTIONS_FILE")
  MODEM_USERNAME=$(jq -r '.username // empty' "$OPTIONS_FILE")
  MODEM_PASSWORD=$(jq -r '.password // empty' "$OPTIONS_FILE")
  export MODEM_IP
  export MODEM_USERNAME
  export MODEM_PASSWORD
fi

exec bun run ./src/index.ts
