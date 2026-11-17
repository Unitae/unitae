# Captures of the in-app help

An article shows a capture of the app as `![what it shows](capture:<id>)`. Each capture exists in French and in
English, in the light and the dark theme: `public/help-captures/<locale>/<id>.webp` and `<id>.dark.webp`. Their size
and date are in `app/features/help/content/captures.json`. All of it is written by `scripts/capture-help.ts`, from the
demo congregation, never from real data.

The tests refuse an image that is not a capture, a capture without alt text or missing in one language, and a
capture that no article shows. A new capture is a shot in `shots.ts` (the account, the page, what to do there, the
elements to frame) and a line in the article, in both languages.

Run everything on the same day: the demo is dated from today.

## 1. Two scratch databases

```bash
docker exec docker-postgres-1 psql -U unitae -d postgres -c "CREATE DATABASE unitae_help_captures OWNER unitae"
export DB_URL="${DB_URL%/*}/unitae_help_captures" DB_RUNTIME_URL="${DB_RUNTIME_URL%/*}/unitae_help_captures"
export UNITAE_STORAGE_PATH=/tmp/help-captures-uploads   # the demo's PDFs land here
pnpm prisma migrate deploy && pnpm prisma db seed && pnpm db:seed:marketing
docker exec -i docker-postgres-1 psql -v ON_ERROR_STOP=1 -U unitae -d unitae_help_captures \
  < scripts/help-captures/stage-demo.sql

docker exec docker-postgres-1 psql -U unitae -d postgres -c "CREATE DATABASE unitae_help_captures_en OWNER unitae"
docker exec docker-postgres-1 sh -c "pg_dump -U unitae unitae_help_captures | psql -q -U unitae unitae_help_captures_en"
docker exec -i docker-postgres-1 psql -v ON_ERROR_STOP=1 -U unitae -d unitae_help_captures_en \
  < scripts/help-captures/translate-demo-en.sql
cp -R /tmp/help-captures-uploads/. /tmp/help-captures-uploads-en/
```

`stage-demo.sql` adds what some captures need beyond the seed, each line saying which capture it is for: a BANO
file, a document with two versions. The English copy exists because names, parts, sections and document titles are
data, not messages; it points at the same files, hence the copied uploads. Both SQL files refuse a database whose
name does not say `captures`. `docker-postgres-1` is an example: `docker ps` shows the name of your Postgres
container.

## 2. Two apps on them

Each app has its own Redis (the app caches the congregation there) and its own uploads:

```bash
docker run -d --rm --name help-captures-redis -p 127.0.0.1:6390:6379 redis:7-alpine
docker run -d --rm --name help-captures-redis-en -p 127.0.0.1:6391:6379 redis:7-alpine

DB_URL="${DB_URL%/*}/unitae_help_captures" DB_RUNTIME_URL="${DB_RUNTIME_URL%/*}/unitae_help_captures" \
  REDIS_HOST=127.0.0.1 REDIS_PORT=6390 UNITAE_STORAGE_PATH=/tmp/help-captures-uploads NODE_ENV=development \
  ./node_modules/.bin/react-router dev --host 127.0.0.1 --port 5182 --strictPort &

DB_URL="${DB_URL%/*}/unitae_help_captures_en" DB_RUNTIME_URL="${DB_RUNTIME_URL%/*}/unitae_help_captures_en" \
  REDIS_HOST=127.0.0.1 REDIS_PORT=6391 UNITAE_STORAGE_PATH=/tmp/help-captures-uploads-en NODE_ENV=development \
  ./node_modules/.bin/react-router dev --host 127.0.0.1 --port 5183 --strictPort &
```

`HELP_CAPTURE_URL_FR` and `HELP_CAPTURE_URL_EN` point the script elsewhere.

## 3. Capture

```bash
HELP_CAPTURE_PASSWORD=… pnpm build:help-captures                 # every capture
HELP_CAPTURE_PASSWORD=… pnpm build:help-captures --only absences-new --locale fr
```

The password is the demo accounts’ one (`app/database/seed-marketing.ts`). `--only` retakes some captures and leaves
the others untouched: a full run changes every file, since the demo moves with today’s date. `--raw <dir>` also keeps
each whole page, to frame a new shot. A first sign-in on a cold dev server can time out: run that capture again.

A shot frames the elements its step names. Keep the crop narrow: the side panel is about 400 px wide, so a wide crop
shrinks there. A shot can set its own window (`viewport`), narrower for a row or a title with its control, taller for
a long form; `margin: -1` trims an element's own border line.

Look at each new image before committing it, in both languages: the English copy translates the demo data a
capture was made for, so a new screen can still show a French name.

## 4. Clean up

```bash
docker stop help-captures-redis help-captures-redis-en
docker exec docker-postgres-1 psql -U unitae -d postgres -c "DROP DATABASE unitae_help_captures"
docker exec docker-postgres-1 psql -U unitae -d postgres -c "DROP DATABASE unitae_help_captures_en"
```
