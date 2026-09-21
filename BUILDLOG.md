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
