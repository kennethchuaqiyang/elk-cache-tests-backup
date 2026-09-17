# elk-cache-tests-backup

Backup copy of the ELK (Elasticsearch) test files for [elk-cache-mock-api](https://github.com/kennethchuaqiyang/elk-cache-mock-api), kept here as a standalone safety copy rather than merged into the main test repos.

The actual working, maintained versions of these tests live alongside their Redis/in-memory counterparts:

- **Go:** [`cache_elk_test.go`](https://github.com/kennethchuaqiyang/go-api-cache-mock-tests/blob/main/cache_elk_test.go) in `go-api-cache-mock-tests`
- **Playwright:** [`elk-cache.spec.ts`](https://github.com/kennethchuaqiyang/playwright-api-cache-mock-tests/blob/main/tests/elk-cache.spec.ts) in `playwright-api-cache-mock-tests`

## Why these tests aren't in CI

`elk-cache-mock-api` runs locally only — see [its README](https://github.com/kennethchuaqiyang/elk-cache-mock-api#why-this-isnt-deployed) for why (the Elasticsearch client's incompatibility with free managed OpenSearch tiers, and Elastic Cloud's cost/trial constraints). Jenkins has no access to the local Elasticsearch + Kibana stack these tests need, so they're run manually rather than on every commit.

## Running these

Requires `docker compose up -d elasticsearch kibana` and `elk-cache-mock-api` running locally first (see that repo's README).

```bash
# Go
go mod tidy
go test ./... -v -run '^TestElkCacheBehavior$'

# Playwright
npm ci
npx playwright test elk-cache.spec.ts
```