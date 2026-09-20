# flyrank-capstone-widgetplatform

An embeddable widget and lead-capture platform. A customer defines a widget, pastes one `<script>` line into any website, and visitors' submissions come back to a backend that validates them, filters spam, enriches them with location data, stores them, and shows them to the owner through a dashboard API.

> **Status: Phase 1 (Design) complete.** Code arrives in Phase 2. The run steps below are the *target* and will be verified before submission.

## Architecture

```
Widget Owner --(Bearer key)--> /admin/* ---> Widgets (tenant-isolated)  --> embed snippet
Customer Site --> <script src=widget.<hash>.js?id=..> --> GET /widgets/:id/config (cached)
Visitor --> POST /submissions
              CORS -> rate limit -> validate -> honeypot -> idempotency
              -> geo (A -> B -> none) -> INSERT submission + INSERT job (one transaction)
                                             |
                                    worker -> email/webhook (retries; failure never blocks)
Widget Owner --(Bearer key)--> /dashboard/* <-- submissions + stats
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
