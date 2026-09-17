import { test, expect, APIRequestContext } from '@playwright/test';

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
// Run with: npx playwright test elk-cache.spec.ts
// Env vars (optional): ELK_BASE_URL (default http://localhost:8082), TEST_USER_ID (default 2)

interface UserResponse {
  user_id: number;
  username: string;
  location: string;
  salary: number;
}

interface UpdateResponse {
  message: string;
}

const TEST_USER_ID = Number(process.env.TEST_USER_ID ?? 2);
const BASE_URL = process.env.ELK_BASE_URL ?? 'http://localhost:8082';

async function getUser(
  request: APIRequestContext,
  userId: number
): Promise<{ status: number; cache: string | null; body: Partial<UserResponse> }> {
  const res = await request.get(`${BASE_URL}/api/user`, { params: { user_id: userId } });
  let body: Partial<UserResponse> = {};
  try {
    body = await res.json();
  } catch {
    // error responses may not be shaped like UserResponse; that's fine
  }
  return { status: res.status(), cache: res.headers()['x-cache'] ?? null, body };
}

async function putSalary(
  request: APIRequestContext,
  userId: number,
  salary: number
): Promise<{ status: number; body: UpdateResponse }> {
  const res = await request.put(`${BASE_URL}/api/user/update`, {
    data: { user_id: userId, salary },
  });
  const body: UpdateResponse = await res.json();
  return { status: res.status(), body };
}

async function currentSalary(request: APIRequestContext, userId: number): Promise<number> {
  const { body } = await getUser(request, userId);
  return body.salary ?? 0;
}

// Keeps bumping the candidate salary and retrying until the API confirms
// a genuine update ("Success"), instead of accepting a coincidental
// no-op ("No update") as if the test had done something.
async function forceCacheInvalidation(request: APIRequestContext, userId: number): Promise<number> {
  let candidate = await currentSalary(request, userId);

  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    candidate += 1000 + attempt;
    const { status, body } = await putSalary(request, userId, candidate);
    expect(status, `unexpected status on update attempt ${attempt}: ${JSON.stringify(body)}`).toBe(200);

    if (body.message === 'Success') return candidate;
    if (body.message === 'No Success') {
      throw new Error(`update failed unexpectedly on attempt ${attempt}: ${JSON.stringify(body)}`);
    }
    // "No update": candidate coincided with the current value; loop and try a bigger jump.
  }
  throw new Error(`could not force a real update after ${maxAttempts} attempts`);
}

test.describe.serial('cache behavior — elk (local)', () => {
  test('GET first time is a cache miss', async ({ request }) => {
    await forceCacheInvalidation(request, TEST_USER_ID);

    const { status, cache, body } = await getUser(request, TEST_USER_ID);
    expect(status).toBe(200);
    expect(cache).toBe('MISS');
    expect(body.user_id).toBe(TEST_USER_ID);

    await forceCacheInvalidation(request, TEST_USER_ID);
  });

  test('GET second time is a cache hit', async ({ request }) => {
    const first = await getUser(request, TEST_USER_ID);
    expect(first.status).toBe(200);
    expect(first.cache).toBe('MISS');

    const second = await getUser(request, TEST_USER_ID);
    expect(second.status).toBe(200);
    expect(second.cache).toBe('HIT');

    await forceCacheInvalidation(request, TEST_USER_ID);
  });

  test('PUT after cache is set invalidates it', async ({ request }) => {
    await getUser(request, TEST_USER_ID); // MISS, populates
    const primed = await getUser(request, TEST_USER_ID);
    expect(primed.cache, 'cache should be populated before testing invalidation').toBe('HIT');

    const newSalary = await forceCacheInvalidation(request, TEST_USER_ID);

    const after = await getUser(request, TEST_USER_ID);
    expect(after.status).toBe(200);
    expect(after.cache).toBe('MISS');
    expect(after.body.salary).toBe(newSalary);
  });
});
