#!/usr/bin/env bash
# Restarts `wrangler dev` (Worker + static assets) on :8788 in the background, logging to $WRANGLER_LOG.
LOG=${WRANGLER_LOG:-/tmp/claude-1000/wrangler.log}
for pid in $(pgrep -f "wrangler (pages )?dev") $(pgrep -f "workerd serve"); do kill "$pid" 2>/dev/null; done
sleep 1
nohup npx wrangler dev --port 8788 > "$LOG" 2>&1 &
for _ in $(seq 1 40); do curl -s -o /dev/null localhost:8788/ && exit 0; sleep 1; done
echo "wrangler did not start" >&2; exit 1
