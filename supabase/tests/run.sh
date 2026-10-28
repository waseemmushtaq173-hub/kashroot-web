#!/bin/sh
# KashRoot database security tests: a throwaway Postgres 16 in Docker, the whole
# supabase/RUN_THIS_ONCE.sql, then every test file here inside begin / rollback.
# Fails (exit 1) on the first FAIL. Usage (from the repo): sh supabase/tests/run.sh
set -e
here=$(cd "$(dirname "$0")" && pwd)
name=kr-db-security-test
docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" -e POSTGRES_PASSWORD=test -v "$here:/t:ro" -v "$here/..:/s:ro" postgres:16 >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
i=0; until docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; do i=$((i+1)); [ $i -gt 60 ] && echo "Postgres did not start" && exit 1; sleep 1; done
sleep 2
docker exec "$name" psql -U postgres -q -f /t/00_supabase_stub.sql >/dev/null
docker exec -e PGOPTIONS="-c client_min_messages=warning" "$name" psql -U postgres -q -v ON_ERROR_STOP=1 -f /s/RUN_THIS_ONCE.sql >/dev/null
echo "RUN_THIS_ONCE.sql: loaded"
failed=0
for f in "$here"/[1-9]*.sql; do
  t=$(basename "$f")
  out=$(docker exec "$name" sh -c "{ echo 'begin;'; cat /t/$t; echo 'rollback;'; } | psql -U postgres -q -v ON_ERROR_STOP=1 2>&1") && ok=1 || ok=0
  verdict=$(printf '%s\n' "$out" | grep -E 'PASS|FAIL' | sed -E 's/^(psql:[^ ]+ )?(NOTICE|ERROR): +//' | tail -3)
  if [ $ok = 1 ] && ! printf '%s' "$verdict" | grep -q FAIL; then echo "ok    $t  $verdict"; else echo "FAIL  $t"; printf '%s\n' "$out" | tail -15; failed=1; fi
done
exit $failed
