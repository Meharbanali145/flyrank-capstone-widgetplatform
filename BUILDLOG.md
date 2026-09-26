# BUILDLOG — AI usage log

Honesty is graded, perfection is not. For each phase: what the AI did, what I checked, what was wrong, what I changed.

---

## Phase 1 — Design

**Tool:** Claude (chat).

**What I asked for:** a design doc, repo skeleton, and evidence/log templates from the capstone brief.

**What the AI produced:** `docs/DESIGN.md`, the data model, API surface, submission pipeline order, layer sketch, and the skeleton files.

**What the AI verified externally:** the ip-api.com and ipapi.co free-tier limits. Findings that changed the design:
- ip-api free tier is HTTP-only, 45 req/min, and sends `X-Rl`/`X-Ttl` headers -> the adapter must respect them.
- ipapi.co can report rate limiting inside a JSON body (`error: true`) -> treat body errors as failures too.

**Miscount corrected:** the AI first said the brief had 14 requirement boxes; there are actually 15 (R1-R15 in EVIDENCE.md).

**What I (the intern) reviewed and changed:** <!-- FILL IN: at least one decision you challenged or changed, and why -->

**Something I can explain to an evaluator in my own words:** <!-- FILL IN -->

---

## Phase 2 — hardened submission path

Continued from the Phase 1 design (API-key tenant auth, node-pg-migrate, the outbox `jobs`
table already in the schema, `ip-api`/`ipapi-co` as the provider names). Built and tested
against a real local Postgres, not mocked.

### What I checked/questioned before building
- Confirmed the transactional-outbox choice from Phase 1 has a real cost I hadn't fully
  weighed: because `submissionService.submit()` writes the submission row and enqueues both
  jobs inside ONE transaction, a broken `jobs` table causes the *whole submission* to roll
  back (verified with a test that renames `jobs` away mid-test — it gets a 500, not a 201).
  This is different from "the email provider is down," which the outbox handles correctly
  (probe 5: the job is enqueued fine, the ASYNC worker's send attempt fails, retries, and
  dead-letters — the visitor still gets 201 the whole time). Kept the outbox as-is: the
  brief's requirement is specifically about a failing *side effect*, not a failing queue
  table, and losing atomicity between the row and its jobs felt like the worse trade-off.
  Flagging this explicitly because an evaluator picking these lines should hear the reasoning,
  not discover the edge case themselves.
- Re-tested the geo fallback with `X-Forwarded-For` + `TRUST_PROXY=1` after noticing my first
  manual curl tests all returned no geo data — because I was curling from `127.0.0.1`, and
  `isPublicIp()` correctly refuses to "geolocate" a loopback address. Not a bug; just made
  sure the manual proof used a real public-looking IP so the fallback chain was actually
  exercised, not silently skipped.
- Verified the honeypot claim by hand: after tripping it, queried `submissions` directly and
  confirmed the row count didn't move, rather than trusting the 201 response alone.

### What's proven (all against a live server + Vitest)
- Multi-tenant isolation (B gets 404 on A's widget, never leaks into list)
- Cross-origin submission with CORS headers (probe 1)
- Malformed JSON / oversized body / unknown widget / unknown field -> clean 4xx, never 5xx (probe 2)
- Burst of submissions -> 429s, service keeps serving other widgets/health (probe 3)
- Geo fallback: ip-api up -> ip-api; ip-api down -> ipapi-co; both down -> stored, no geo (probe 4)
- Email forced down -> submission still 201; job retries with doubling backoff, dead-letters
  after JOB_MAX_ATTEMPTS (probe 5)
- Honeypot filled -> fake 201, row never written (probe 6)
- Idempotency key replay -> one row, second response is a 200 with `Idempotent-Replay: true`

19/19 Vitest tests passing (`npm test`).

## Test fix — resilience.test.js drain() timing bug

Found while testing on a real (non-sandbox) machine: `PROBE 5` failed intermittently.
`drain()` looped calling `worker.runOnce()` with no actual wait between iterations, so
when a job was scheduled to retry in the future (e.g. `run_at = now() + 40ms`), the loop
could exhaust its 50 attempts and return `false` (nothing claimable *right now*) before
that 40ms had actually elapsed — the test then checked job status too early and saw
`'pending'` instead of the expected `'dead'`.

Not a bug in the app itself — `claimNext()` correctly respects `run_at`, and the app's
own backoff/dead-letter logic is what the test *proved* was correct once given enough
real time to run. Fixed by adding a short `sleep(15)` in `drain()` whenever there was
nothing immediately claimable, so the loop actually waits out the backoff delay instead
of just polling too fast to see it complete. Re-ran the full suite 3x after the fix with
no flakiness.

## Phase 2 — hardened submission path

Continued from the Phase 1 design (API-key tenant auth, node-pg-migrate, the outbox `jobs`
table already in the schema, `ip-api`/`ipapi-co` as the provider names). Built and tested
against a real local Postgres, not mocked.

### What I checked/questioned before building
- Confirmed the transactional-outbox choice from Phase 1 has a real cost I hadn't fully
  weighed: because `submissionService.submit()` writes the submission row and enqueues both
  jobs inside ONE transaction, a broken `jobs` table causes the *whole submission* to roll
  back (verified with a test that renames `jobs` away mid-test — it gets a 500, not a 201).
  This is different from "the email provider is down," which the outbox handles correctly
  (probe 5: the job is enqueued fine, the ASYNC worker's send attempt fails, retries, and
  dead-letters — the visitor still gets 201 the whole time). Kept the outbox as-is: the
  brief's requirement is specifically about a failing *side effect*, not a failing queue
  table, and losing atomicity between the row and its jobs felt like the worse trade-off.
  Flagging this explicitly because an evaluator picking these lines should hear the reasoning,
  not discover the edge case themselves.
- Re-tested the geo fallback with `X-Forwarded-For` + `TRUST_PROXY=1` after noticing my first
  manual curl tests all returned no geo data — because I was curling from `127.0.0.1`, and
  `isPublicIp()` correctly refuses to "geolocate" a loopback address. Not a bug; just made
  sure the manual proof used a real public-looking IP so the fallback chain was actually
  exercised, not silently skipped.
- Verified the honeypot claim by hand: after tripping it, queried `submissions` directly and
  confirmed the row count didn't move, rather than trusting the 201 response alone.

### What's proven (all against a live server + Vitest)
- Multi-tenant isolation (B gets 404 on A's widget, never leaks into list)
- Cross-origin submission with CORS headers (probe 1)
- Malformed JSON / oversized body / unknown widget / unknown field -> clean 4xx, never 5xx (probe 2)
- Burst of submissions -> 429s, service keeps serving other widgets/health (probe 3)
- Geo fallback: ip-api up -> ip-api; ip-api down -> ipapi-co; both down -> stored, no geo (probe 4)
- Email forced down -> submission still 201; job retries with doubling backoff, dead-letters
  after JOB_MAX_ATTEMPTS (probe 5)
- Honeypot filled -> fake 201, row never written (probe 6)
- Idempotency key replay -> one row, second response is a 200 with `Idempotent-Replay: true`

19/19 Vitest tests passing (`npm test`).

## Phase 3 — delivery, dashboard & proof

### What I found and fixed
- **Real bug in the embed snippet**: `embed.js` was deriving the API's own base URL from
  `config.PUBLIC_BASE_URL` (a value from the server's `.env`) instead of from where the
  script itself was actually loaded from. This broke immediately in the jsdom cross-origin
  test (the test server runs on a random port, not `:3000`), and would have broken in any
  real deployment too if `PUBLIC_BASE_URL` were ever stale or the API were reached via a
  different domain/proxy than what's configured. Fixed by deriving `apiBase` from
  `document.currentScript.src` at load time — the same trick real CDN snippets use — so the
  embed always knows its own origin regardless of server config. Caught by actually running
  the jsdom browser test rather than trusting that it would work.
- **Probe 5 evidence was capturing a mid-retry snapshot, not the real outcome**: the first
  version of `scripts/attack.js` slept a fixed 1.5s after forcing the email provider down,
  which isn't long enough for the configured backoff (`JOB_BACKOFF_BASE_S=1`, 3 attempts:
  ~1s + 2s + 4s) to actually reach dead-letter. The generated `EVIDENCE.md` showed jobs
  still `"status":"pending"` — technically true at that instant, but not the strongest proof
  of the requirement ("degrade, never fail... eventually dead-lettered"). Changed the script
  to poll `/__control/state` until it actually observes both jobs reach `"status":"dead"`
  (or times out), so the evidence file shows the real terminal outcome.

### What's now proven (owner dashboard)
- `GET /api/dashboard/stats` — totals, per-widget counts, a day-by-day series over N days,
  geo breakdown — all scoped by `tenant_id` in the query itself, not filtered client-side.
- `GET /api/dashboard/submissions` — paginated, filterable by widget, same tenant scoping.
- Tenant isolation re-verified at the dashboard layer specifically (not just widget CRUD):
  tenant A's stats/list never include tenant B's rows even when both submitted around the
  same time.

### Customer demo site
`demo/customer-site/index.html` + `scripts/serve-site.js`: a real second HTTP origin
(`:5500` by default) serving a page whose ONLY widget-related content is the one `<script>`
tag the API's `/api/widgets/:id/embed` endpoint actually returns — never hand-typed. The
jsdom browser test loads this exact file to prove the widget renders and submits across a
genuinely different origin, including a real preflight-eligible CORS request.

### Evidence
`EVIDENCE.md` is regenerated from a live server by `npm run attack` — every block in it is
real captured output, not written by hand. All 6 probes plus the multi-tenant isolation
requirement are covered.

27/27 Vitest tests passing (`npm test`): 9 submission, 9 resilience, 1 rate-limit,
3 browser (jsdom cross-origin), 5 dashboard.
