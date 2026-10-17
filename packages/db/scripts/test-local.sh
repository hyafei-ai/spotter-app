#!/usr/bin/env bash
# Runs migrations + SQL tests against a throwaway local Postgres (16+). No Docker or Supabase CLI needed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d)"
PORT="${PGPORT:-54329}"
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown postgres "$DATA"; else RUN=""; fi
cleanup() { $RUN "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
$RUN "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=''" -w start >/dev/null

PSQL=(psql -h /tmp -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -o /dev/null)
"${PSQL[@]}" -f "$HERE/supabase/tests/00_supabase_stub.sql"
for f in "$HERE"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f "$HERE/supabase/tests/01_fixtures.sql"
for f in "$HERE"/supabase/tests/*.test.sql; do
  echo "# $(basename "$f")"
  "${PSQL[@]}" -f "$f" 2>&1 | sed -e 's/^.*NOTICE:  //' -e '/^psql:.*ERROR/!b' -e 's/^psql:[^E]*//'
done
echo "all SQL tests passed"
