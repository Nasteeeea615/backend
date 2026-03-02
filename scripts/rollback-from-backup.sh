#!/usr/bin/env bash
# Template rollback script to restore a gzipped SQL dump to the database.
# Usage: ./rollback-from-backup.sh /path/to/backup.sql.gz

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /path/to/backup.sql.gz" >&2
  exit 2
fi

BACKUP_PATH="$1"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL must be set to restore the DB" >&2
  exit 3
fi

echo "Restoring ${BACKUP_PATH} to DATABASE_URL"
gzip -dc "${BACKUP_PATH}" | psql "${DATABASE_URL}"
echo "Restore completed"
