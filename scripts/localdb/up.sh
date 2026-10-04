#!/usr/bin/env bash
# Starts Postgres + PostgREST on localhost:54321 for end-to-end tests.
set -euo pipefail
cd "$(dirname "$0")"
SECRET=local-jwt-secret-that-is-at-least-32-chars-long
docker rm -f dci-pg dci-rest >/dev/null 2>&1 || true
docker network create dci-net >/dev/null 2>&1 || true
cp ../../supabase/migrations/20261003000000_signups.sql 10-schema.sql
docker run -d --name dci-pg --network dci-net -e POSTGRES_PASSWORD=pg -p 54322:5432 \
  -v "$PWD/00-roles.sql:/docker-entrypoint-initdb.d/00-roles.sql:ro" \
  -v "$PWD/10-schema.sql:/docker-entrypoint-initdb.d/10-schema.sql:ro" postgres:17-alpine >/dev/null
until docker exec dci-pg pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && docker exec dci-pg psql -U postgres -tAc "select 1 from pg_tables where tablename='signups'" | grep -q 1; do sleep 1; done
docker run -d --name dci-rest --network dci-net -p 54321:3000 \
  -e PGRST_DB_URI=postgres://authenticator:authpass@dci-pg:5432/postgres \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET=$SECRET postgrest/postgrest:latest >/dev/null
until curl -fs localhost:54321/ >/dev/null 2>&1 || [ "$(curl -s -o /dev/null -w '%{http_code}' localhost:54321/)" = "401" ]; do sleep 1; done
echo "SERVICE_KEY=$(node jwt.mjs $SECRET service_role)"
echo "ANON_KEY=$(node jwt.mjs $SECRET anon)"
