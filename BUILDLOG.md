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
