# Design Document — Embeddable Widget & Lead-Capture Platform

> Phase 1 gate deliverable. Status: **draft v1** — decisions here may change during the build; every change is logged at the bottom.

## 1. Problem

Customers want to put a signup/contact form on *any* website with one line of HTML. Visitors on those sites submit data to our backend, which is exposed directly to browsers we don't control. We must therefore treat every input as hostile, every traffic pattern as a possible flood, and every upstream dependency (geo APIs, email) as something that will eventually fail.

**Three actors, three request paths — kept separate in code:**

| Actor | Path | Trust level |
|---|---|---|
| Widget owner (tenant) | `/admin/*`, `/dashboard/*` | Authenticated (Bearer API key) |
| Customer website | `/widget*.js`, `/widgets/:publicId/config` | Public, cached, CORS |
| Website visitor | `POST /submissions` | Public, CORS, validated, rate-limited |

## 2. Explicit non-goal

**No frontend UI for the owner.** There is no dashboard web page and no drag-and-drop form builder. The dashboard is a JSON API only, and the widget UI is a minimal `<div>` + form. The grade lives in the backend; time goes to the hardening, not the CSS.

## 3. Tech decisions (and why)

| Choice | Why |
|---|---|
| Node 20 + Express, plain JavaScript | Matches the track; fewer moving parts for a first capstone |
| PostgreSQL via Docker, raw SQL with `pg` (no ORM) | Tenant filters stay visible in every query, which makes isolation easy to audit |
| Plain-SQL migrations (`node-pg-migrate`) | Schema is versioned; "schema as migrations" is a shared requirement |
| Zod | Validation at the boundary; can build a schema dynamically from a widget's field list |
| `express-rate-limit` (memory store) | Simple and enough for one instance; the limitation is documented |
| Vitest + Supertest | Deterministic tests for the probes |
| Mailpit / console for email | Email can be fake; only its *failure tolerance* is graded |

## 4. Data model

```sql
tenants(
  id uuid PK, name text, email text UNIQUE,
  api_key_hash text UNIQUE,        -- sha256 of the key; raw key never stored
  created_at timestamptz)

widgets(
  id uuid PK,
  public_id text UNIQUE,           -- short random id used in the snippet (not the PK)
  tenant_id uuid FK -> tenants,
  type text CHECK (type IN ('signup_form','contact_form','cta')),
  title text, description text, button_text text,
  fields jsonb,                    -- [{name,label,type,required,maxLength}] max 10
  options jsonb,                   -- display options
  is_active boolean DEFAULT true,
  created_at, updated_at)
  -- INDEX (tenant_id, created_at DESC)

submissions(
  id uuid PK,
  widget_id uuid FK -> widgets,
  tenant_id uuid FK -> tenants,    -- denormalised so every dashboard query filters on it directly
  data jsonb,                      -- validated field values
  ip_address inet,
  country text, region text, city text,
  geo_provider text NULL,          -- which provider answered; NULL = no enrichment
  idempotency_key text NULL,
  created_at timestamptz)
  -- UNIQUE (widget_id, idempotency_key)        -> retried action happens once
  -- INDEX  (tenant_id, created_at DESC)         -> dashboard list
  -- INDEX  (widget_id, created_at DESC)         -> per-widget stats
  -- INDEX  (tenant_id, country)                 -> geo breakdown

jobs(                              -- transactional outbox for side effects
  id bigserial PK, type text, payload jsonb,
  status text CHECK (status IN ('pending','running','done','dead')),
  attempts int DEFAULT 0, max_attempts int DEFAULT 5,
  run_at timestamptz, last_error text, created_at timestamptz)
  -- INDEX (status, run_at)
```

**Isolation rule:** every repository function takes `tenantId` as a required argument and puts it in the `WHERE` clause. A tenant asking for another tenant's widget gets **404**, not 403, so existence isn't leaked.

## 5. Embed flow

```
Owner: POST /admin/widgets           -> widget created (public_id = "k3x9a2mq7p")
Owner: GET  /admin/widgets/:id/embed -> <script src="{BASE}/widget.<hash>.js?id=k3x9a2mq7p"></script>

Customer page loads the script
  widget.js reads its own ?id= from document.currentScript.src
  -> GET  /widgets/k3x9a2mq7p/config     (public, cached 60s, ETag)
  -> renders <div> + form (+ hidden honeypot field)
  -> on submit: POST /submissions        (Idempotency-Key = UUID made at render)
```

**Versioning:** the bundle URL contains a content hash (`widget.<hash>.js`), served `public, max-age=31536000, immutable`. The stable alias `/widget.js?id=…` 302-redirects to the current hashed file (short cache, 5 min), so the plain-URL example from the brief and any old snippets keep working. New release means new hash, which busts every cache. Config is deliberately *not* immutable: it changes when the owner edits a widget, hence the short `max-age=60` plus `ETag` (a `304` costs almost nothing).

## 6. API surface

Errors always use one shape: `{"error":{"code":"VALIDATION_FAILED","message":"…","details":[…]}}`. **A client fault is never a 500.**

| Method & path | Auth | Purpose | Success / errors |
|---|---|---|---|
| `POST /admin/widgets` | Bearer | Create widget | 201 · 400 · 401 |
| `GET /admin/widgets` | Bearer | List *own* widgets | 200 · 401 |
| `GET/PATCH/DELETE /admin/widgets/:id` | Bearer | Read/update/delete own widget | 200/204 · 401 · 404 |
| `GET /admin/widgets/:id/embed` | Bearer | Returns the `<script>` snippet | 200 · 404 |
| `GET /widget.<hash>.js` | none | Versioned bundle, immutable | 200 |
| `GET /widget.js?id=` | none | Alias, 302 to hashed bundle | 302 |
| `GET /widgets/:publicId/config` | none | Public fields only, cached | 200/304 · 404 |
| `OPTIONS /submissions` | none | CORS preflight | 204 |
| `POST /submissions` | none | Visitor submits | 201 · 400 · 404 · 413 · 415 · 429 |
| `GET /dashboard/submissions` | Bearer | Paginated list (filter by widget/date) | 200 · 401 |
| `GET /dashboard/stats/timeseries` | Bearer | Counts per day | 200 |
| `GET /dashboard/stats/widgets` | Bearer | Per-widget totals | 200 |
| `GET /dashboard/stats/geo` | Bearer | Country/city breakdown | 200 |

**CORS:** the public routes send `Access-Control-Allow-Origin: *` and **never** allow credentials. That is safe because the public endpoints use no cookies and no ambient auth; the API key is only used on `/admin` and `/dashboard`, which get no CORS at all. Preflight replies with allowed method/headers (`Content-Type, Idempotency-Key`) and `Access-Control-Max-Age`.

## 7. The submission pipeline (order matters)

```
POST /submissions
 1. CORS headers
 2. per-IP rate limit ............. flood?           -> 429   (cheapest check first)
 3. body size limit (10 KB) ....... too big?         -> 413
 4. content-type must be JSON ..... wrong?           -> 415
 5. shape validation (Zod) ........ malformed?       -> 400
 6. load widget by publicId ....... missing/inactive -> 404
 7. per-widget rate limit ......... flood?           -> 429
 8. dynamic field validation ...... built from widget.fields -> 400
 9. honeypot filled? .............. -> 201 {ok:true}, store NOTHING, log spam_blocked
10. idempotency check ............. duplicate key?   -> 200 with original result
11. geo enrichment ................ A -> B -> none  (1.5 s timeout each; never throws)
12. BEGIN; INSERT submission; INSERT job(send_confirmation); COMMIT
13. 201 {ok:true}
```

**Side effects via outbox:** the confirmation email is a row in `jobs`, written in the *same transaction* as the submission. A worker (polling with `FOR UPDATE SKIP LOCKED`) sends it, retries with exponential backoff, and after `max_attempts` marks the job `dead` and logs an ALERT line. So the request path never calls the mailer at all, and a mailer failure *cannot* fail a submission by construction.

**Spam response:** the honeypot returns the same 201 as a real success, so a bot learns nothing and doesn't adapt.

## 8. Geo enrichment (verified against live docs)

- **Provider A: ip-api.com** is free at 45 req/min, and the free tier is **HTTP-only** (HTTPS needs a paid plan). Fine server-side, but never call it from the browser. It answers `429` past the limit and sends an `X-Rl` header; when `X-Rl` is 0 the client must stop calling for `X-Ttl` seconds or risk a ban. **Design consequence:** the provider adapter reads `X-Rl`/`X-Ttl` and marks itself "cooling down" so it doesn't get our IP banned. Free use is also non-commercial only, which is fine for a capstone.
- **Provider B: ipapi.co** allows about 1,000 lookups/day without signup. Its rate-limit failures can arrive as a JSON body containing `"error": true` instead of a clean HTTP error. **Design consequence:** treat *either* a non-2xx status *or* `error: true` in the body as failure.
- **Private/loopback IPs** (`127.0.0.1`, `10.x`, …) have no geo. Skip the lookup and store none; don't burn quota. For local demos, the mock providers stand in.
- **Client IP:** `req.ip` respects `TRUST_PROXY`. It defaults to **false** so nobody can spoof `X-Forwarded-For` to dodge rate limits.
- **Provider interface:** `lookup(ip) -> {country, region, city} | throws`. Adapters: `ipApi`, `ipapiCo`, `mock`. `GEO_PROVIDER_ORDER` picks the chain. The deterministic proof uses a tiny mock server with `POST /__control/a|b/{up|down}`.

## 9. Layers

```
src/
  routes/       HTTP only: parse -> call service -> format response
  middleware/   auth, cors, rateLimit, errorHandler, bodyLimit
  services/     widgetService, submissionService, enrichmentService, dashboardService
  repos/        SQL only (every function takes tenantId)
  providers/    geo/{ipApi,ipapiCo,mock}, mailer/{console,smtp}
  jobs/         worker.js, handlers/sendConfirmation.js
  config/       env parsing (fails fast on missing vars)
```

Rules: routes never import repos; services never import Express; only `config/` reads `process.env`. Secrets never appear in logs (logger redacts `authorization` and known key names).

## 10. Proof strategy

`npm run attack` is a script that acts as the attacker: malformed payload, oversized payload, burst, honeypot fill, provider A down, both down, forced mailer failure, cross-tenant read. It prints real output, and that output is pasted into `EVIDENCE.md`. Tests (`npm test`) cover the same probes deterministically.

## 11. Requirement → design map

| Section 6 box | Where it lives |
|---|---|
| Auth CRUD + isolation | `middleware/auth`, `repos/*` (tenantId in every WHERE) |
| Snippet, config cache, versioned bundle | `routes/embed`, `routes/delivery` |
| CORS + preflight | `middleware/cors` (public routes only) |
| Validation, 4xx never 500 | pipeline steps 3–5, 8; `errorHandler` |
| Rate limit + spam | steps 2, 7, 9 |
| Fallback chain, degrade | `enrichmentService` (step 11) |
| Failing email doesn't block | outbox + worker (step 12) |
| Shared: background job, idempotency, migrations | `jobs`, `Idempotency-Key`, `migrations/` |

## 12. Known limitations (will go in README)

- Rate-limit counters live in memory: correct for one instance, not for a cluster (would need Redis).
- Free geo APIs are rate-limited and ip-api's free tier is non-commercial.
- Raw visitor IPs are stored (`inet`); a real product would need a retention policy or hashing (GDPR is a stretch goal).
- `Access-Control-Allow-Origin: *` on public routes means any site can embed any widget id; per-widget allowed-origins is a stretch goal.

## 13. Change log

| Date | Change | Why |
|---|---|---|
| — | Initial draft | Phase 1 |
