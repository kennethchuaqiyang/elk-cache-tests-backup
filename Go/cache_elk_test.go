package cacheapi_test

// Covers elk-cache-mock-api, which runs locally only (see the caching
// portfolio notes for why: the go-elasticsearch client rejects Bonsai's
// OpenSearch-based free tier, and Elastic Cloud's genuine-Elasticsearch
// free tier is a time-limited trial rather than a permanent option).
//
// Requires, running locally before these tests execute:
//   - Elasticsearch + Kibana via docker compose up -d (from cache-mock-servers/)
//   - elk-cache-mock-api itself: go run main.go, with ES_URL, ES_INDEX,
//     DATABASE_URL, PORT set
//
// Same three cases as the Redis/in-memory suite, against a single target.
// Run with:
//   go test ./... -v -run TestElkCacheBehavior
// Env vars (optional):
//   ELK_BASE_URL (default http://localhost:8082), TEST_USER_ID (default 2)

import (
	"net/http"
	"os"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func elkBaseURL() string {
	return getenvDefault("ELK_BASE_URL", "http://localhost:8082")
}

func elkTestUserID() int {
	if v := os.Getenv("TEST_USER_ID"); v != "" {
		if id, err := strconv.Atoi(v); err == nil {
			return id
		}
	}
	return 2
}

func TestElkCacheBehavior(t *testing.T) {
	baseURL := elkBaseURL()

	t.Run("GET_first_time_is_cache_miss", func(t *testing.T) {
		// Guarantee empty cache before asserting MISS.
		forceCacheInvalidation(t, baseURL, elkTestUserID())

		status, cache, user := getUser(t, baseURL, elkTestUserID())
		assert.Equal(t, http.StatusOK, status)
		assert.Equal(t, "MISS", cache)
		assert.Equal(t, elkTestUserID(), user.UserID)

		// Leave it invalidated for whatever runs next.
		forceCacheInvalidation(t, baseURL, elkTestUserID())
	})

	t.Run("GET_second_time_is_cache_hit", func(t *testing.T) {
		status1, cache1, _ := getUser(t, baseURL, elkTestUserID())
		require.Equal(t, http.StatusOK, status1)
		require.Equal(t, "MISS", cache1)

		status2, cache2, _ := getUser(t, baseURL, elkTestUserID())
		assert.Equal(t, http.StatusOK, status2)
		assert.Equal(t, "HIT", cache2)

		forceCacheInvalidation(t, baseURL, elkTestUserID())
	})

	t.Run("PUT_after_cache_set_invalidates_it", func(t *testing.T) {
		getUser(t, baseURL, elkTestUserID()) // MISS, populates
		_, cache, _ := getUser(t, baseURL, elkTestUserID())
		require.Equal(t, "HIT", cache, "cache should be populated before testing invalidation")

		newSalary := forceCacheInvalidation(t, baseURL, elkTestUserID())

		status, cacheAfter, user := getUser(t, baseURL, elkTestUserID())
		assert.Equal(t, http.StatusOK, status)
		assert.Equal(t, "MISS", cacheAfter)
		assert.Equal(t, newSalary, user.Salary)
	})
}
