#!/bin/bash
set -a
. ./.env
set +a

echo "Starting local Lambda server..."
# Run the local server
node local-server.mjs
