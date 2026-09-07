#!/usr/bin/env bash
# Backup database Village OS (pg_dump custom format, kompresi)
# Usage: bash scripts/backup-db.sh [output_dir]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$ROOT/backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$OUT_DIR/village_os_$STAMP.dump"

"$ROOT/vendor/pgsql/bin/pg_dump.exe" -Fc \
  -d "postgresql://postgres:villageos@127.0.0.1:54329/village_os" \
  -f "$FILE"

echo "Backup selesai: $FILE"
# Retensi: hapus backup lebih lama dari 14 hari
find "$OUT_DIR" -name "village_os_*.dump" -mtime +14 -delete
echo "Retensi 14 hari diterapkan"
