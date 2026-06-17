#!/bin/sh
set -e

# Entry point: run migrations then start the app
echo "🔧 Running migrations (if any)..."
MIGRATE_FAIL_ON_ERROR=${MIGRATE_FAIL_ON_ERROR:-false}
if [ -f /app/package.json ]; then
  if npm run migrate; then
    echo "✅ Migrations applied"
  else
    rc=$?
    echo "⚠️ Migrations failed with exit code $rc"
    if [ "$MIGRATE_FAIL_ON_ERROR" = "true" ]; then
      echo "❌ MIGRATE_FAIL_ON_ERROR=true — aborting container start"
      exit $rc
    else
      echo "ℹ️ Continuing to start the server despite migration error (MIGRATE_FAIL_ON_ERROR=false)"
    fi
  fi
fi

echo "🚀 Starting server"
exec node dist/index.js
