# EVIDENCE

One pasted proof per box. Claims without evidence score as **not done**.
Paste real output (curl transcript, test name + result, or log line). Status: ⬜ todo · ✅ done.

## Section 6 requirements

| # | Requirement | Status | Proof |
|---|---|---|---|
| R1 | Authenticated CRUD; unauthenticated requests rejected | ⬜ | |
| R2 | Tenant isolation: A cannot read/modify B's widgets or submissions | ⬜ | |
| R3 | Embed snippet generated per widget | ⬜ | |
| R4 | Public config endpoint: small payload, correct cache headers | ⬜ | |
| R5 | Widget JS served as versioned bundle | ⬜ | |
| R6 | Widget renders on a page from a different origin | ⬜ | |
| R7 | Cross-origin submit works: CORS + OPTIONS preflight | ⬜ | |
| R8 | Malformed/oversized payloads -> clean 4xx JSON | ⬜ | |
| R9 | Valid submissions stored, linked to right widget and tenant | ⬜ | |
| R10 | Rate limit returns 429 on burst; normal request still succeeds | ⬜ | |
| R11 | At least one spam control blocks a spam submission | ⬜ | |
| R12 | Provider A down -> B enriches | ⬜ | |
| R13 | All providers down -> stored without geo | ⬜ | |
| R14 | Failing email/webhook does not prevent storing | ⬜ | |
| R15 | README (diagram, setup, API docs) + required files present | ⬜ | |

## Acceptance probes

| Probe | What | Status | Proof |
|---|---|---|---|
| 1 | Valid submission from second origin -> 2xx, visible in dashboard | ⬜ | |
| 2 | Malformed + oversized -> 4xx JSON, never 500 | ⬜ | |
| 3 | Burst -> 429s, then a normal request succeeds | ⬜ | |
| 4 | A down -> B; both down -> stored anyway | ⬜ | |
| 5 | Email throws -> submission still succeeds | ⬜ | |
| 6 | Honeypot filled -> silently dropped/rejected | ⬜ | |

## Shared requirements

| # | Requirement | Status | Proof |
|---|---|---|---|
| S1 | Layered architecture | ⬜ | |
| S2 | Validation at boundary | ⬜ | |
| S3 | Background job with retries + failure alert | ⬜ | |
| S4 | Persistence: migrations, indexes, isolated tenants | ⬜ | |
| S5 | Idempotency (retried action happens once) | ⬜ | |
| S6 | Secrets clean (env only, never logged) | ⬜ | |
| S7 | Cost tracking | n/a | No AI calls at runtime |
