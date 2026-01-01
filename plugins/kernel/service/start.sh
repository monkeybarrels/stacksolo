#!/bin/sh
set -e

echo "Starting NATS server..."
nats-server --jetstream --store_dir /data &
NATS_PID=$!

# Wait for NATS to be ready
echo "Waiting for NATS to start..."
sleep 2

# Check if NATS is running
if ! kill -0 $NATS_PID 2>/dev/null; then
  echo "NATS failed to start"
  exit 1
fi

echo "NATS server started (PID: $NATS_PID)"

# Start Node.js service
echo "Starting kernel service..."
exec node dist/index.js