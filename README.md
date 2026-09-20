# flyrank-capstone-widgetplatform

An embeddable widget and lead-capture platform. A customer defines a widget, pastes one `<script>` line into any website, and visitors' submissions come back to a backend that validates them, filters spam, enriches them with location data, stores them, and shows them to the owner through a dashboard API.

> **Status: Phase 1 (Design) complete.** Code arrives in Phase 2. The run steps below are the *target* and will be verified before submission.

## Architecture

```
Widget Owner (JWT)                Customer Website (any origin)         Website Visitor
      │                                    │                                   │
      ▼                                    ▼                                   ▼
/api/widgets CRUD              <script src="widget.js?id=..">          POST /submissions
      │                          → GET /widgets/:id/config             (CORS *, rate-limited)
      ▼                          → renders form (Shadow DOM)                   │
  widgets table                                                                ▼
  (tenant-isolated)                                              honeypot → validate → link-heuristic
      │                                                                        │
      ▼                                                          geo: provider A → B → none (never throws)
/api/dashboard/*  ◄──────────────────────────────────────────────  store in submissions table
  (stats, list)                                                                │
                                                                                ▼
                                                                  enqueue email jobs (Postgres queue,
                                                                  retry w/ backoff, dead-letter + alert)
```

Full design: [`docs/DESIGN.md`](docs/DESIGN.md)

## Run it (target — finalised in Phase 2)

```bash
cp .env.example .env
docker compose up --build       # API + Postgres + worker
docker compose exec app npm run seed
```

Demo customer site (second origin): `npx serve demo -l 5500` then open `http://localhost:5500`.

## Proof

Every requirement has a pasted proof in [`EVIDENCE.md`](EVIDENCE.md). AI usage is logged honestly in [`BUILDLOG.md`](BUILDLOG.md).

## Limitations

See section 12 of the design doc. The short version: in-memory rate limiting (single instance), free geo APIs with quotas, raw IPs stored.

## License

MIT
