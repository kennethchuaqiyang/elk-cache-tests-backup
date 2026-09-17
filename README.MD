# elk-cache-mock-api

A mock user API demonstrating the cache-aside pattern backed by Elasticsearch, sitting in front of a real Postgres database.

**Status: local-only.** No live deployment — see [Why this isn't deployed](#why-this-isnt-deployed) below.
**CI:** the [Go](https://github.com/kennethchuaqiyang/go-api-cache-mock-tests) and [Playwright](https://github.com/kennethchuaqiyang/playwright-api-cache-mock-tests) test suites for this API exist and pass locally, but are excluded from their Jenkins pipelines for the same reason.

## What this demonstrates

Elasticsearch has no native per-document TTL (unlike Redis's `EXPIRE`), so this implementation does **lazy expiration**, the same pattern as the [in-memory](https://github.com/kennethchuaqiyang/inmemory-cache-mock-api) variant: each cached document carries a `cached_at` timestamp, and the GET handler compares it against the TTL on every read rather than relying on the store to clean itself up.

On update, the cache document is **explicitly deleted** (`esapi.DeleteRequest`) rather than left to expire naturally — otherwise a reader could still get a `HIT` on stale data until the lazy TTL check happened to catch it.

## Why this isn't deployed

This required more infrastructure exploration than the other two backends:

1. **Bonsai's free tier is OpenSearch, not Elasticsearch.** The official `go-elasticsearch` client does a "product check" on connect and refuses to talk to anything that doesn't identify itself as genuine Elasticsearch (OpenSearch, a fork, doesn't send the expected header). Fixing this would mean switching to `opensearch-project/opensearch-go` — a real, if fairly mechanical, code change.
2. **Elastic Cloud's genuinely-Elasticsearch free tier is a 14-day trial**, not a permanent option, and its paid tier starts around $95+/month for even a small deployment.

Given this was built to demonstrate and test the pattern rather than to run as a permanent service, it stays local — tested thoroughly against real Elasticsearch and Kibana via Docker, documented here rather than glossed over.

## Endpoints

Same contract as the Redis and in-memory variants:

### `GET /api/user?user_id={id}`
Cache-aside read; `X-Cache: HIT`/`MISS`, `X-User-Id`, `X-Browser` headers, `Set-Cookie: cache_key=...`.

### `PUT /api/user/update`
Body: `{"user_id": 2, "salary": 9000}` → `"Success"` (deletes the ES document) / `"No update"` / `"No Success"`.

## Environment variables

| Var | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string (Neon) | required |
| `ES_URL` | Elasticsearch URL | `http://localhost:9200` |
| `ES_INDEX` | index name for cached documents | `user_cache` |
| `PORT` | HTTP port | `8080` |
| `CACHE_TTL_SECONDS` | cache TTL | `30` |

## Running locally

```bash
docker compose up -d elasticsearch kibana   # from the parent cache-mock-servers/ folder
go mod tidy
go run main.go
```

Kibana (http://localhost:5601) → Dev Tools → Console is the easiest way to inspect cached documents directly:
```
GET user_cache/_doc/user-2
```