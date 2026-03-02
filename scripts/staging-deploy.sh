#!/usr/bin/env bash
# Template staging deploy script.
# Requires the following env vars to be set in CI or local env:
#  - SSH_USER, SSH_HOST, SSH_PORT (optional)
#  - SSH_PRIVATE_KEY (used by CI runner to SSH)
#  - REMOTE_PROJECT_DIR (path on remote server where docker-compose.yml lives)
#  - DATABASE_URL (remote DB connection string used for pg_dump)

set -euo pipefail

if [ -z "${SSH_USER:-}" ] || [ -z "${SSH_HOST:-}" ] || [ -z "${REMOTE_PROJECT_DIR:-}" ]; then
  echo "SSH_USER, SSH_HOST and REMOTE_PROJECT_DIR must be set" >&2
  exit 2
fi

TIMESTAMP=$(date -u +%Y%m%d%H%M%S)
BACKUP_FILE="/tmp/db_backup_${TIMESTAMP}.sql.gz"

echo "Creating DB backup on remote host..."
ssh -o StrictHostKeyChecking=no -p "${SSH_PORT:-22}" "${SSH_USER}@${SSH_HOST}" \
  "bash -lc 'set -e; if command -v pg_dump >/dev/null 2>&1; then pg_dump \"${DATABASE_URL}\" | gzip > ${BACKUP_FILE}; echo "Saved ${BACKUP_FILE}"; else echo pg_dump not found; fi'"

echo "Pulling new images and restarting services"
ssh -o StrictHostKeyChecking=no -p "${SSH_PORT:-22}" "${SSH_USER}@${SSH_HOST}" \
  "bash -lc 'cd ${REMOTE_PROJECT_DIR} && docker-compose pull && docker-compose up -d --remove-orphans --build'"

echo "Running migrations on remote (if available)"
ssh -o StrictHostKeyChecking=no -p "${SSH_PORT:-22}" "${SSH_USER}@${SSH_HOST}" \
  "bash -lc 'cd ${REMOTE_PROJECT_DIR} && if [ -f ./backend/dist/migrate.js ] || [ -f ./backend/migrate.ts ]; then docker-compose exec -T backend npm run migrate || true; else echo no migrate script found; fi'"

echo "Staging deploy finished. Backup: ${BACKUP_FILE}"
echo "If you need to rollback, run the rollback script with the backup path."
