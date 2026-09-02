#!/bin/sh
set -eu
AUTH_DIR="${WHATSAPP_AUTH_DIR:-/data/whatsapp}"
mkdir -p "$AUTH_DIR"
chown -R node:node /data
exec gosu node "$@"
