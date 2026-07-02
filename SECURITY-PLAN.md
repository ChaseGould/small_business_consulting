# Security Plan: Smart Incident Reporting Demo

## Problem

The Cloudflare Worker (`worker.js`) currently forwards any JSON body it
receives to the Anthropic Messages API with our API key attached. The Worker
URL is public (visible in the source of `pre-built-ai-solutions.html`), so
anyone can use it as a free, unauthenticated Claude API proxy: they choose the
model, the token limits, and the prompts. There is also no rate limiting, so
even the legitimate demo can be hammered in a loop. Both problems land on our
Anthropic bill.

What is already fine: the API key lives only in a Cloudflare secret (never in
the repo or browser), and the report output is rendered with `textContent`,
so there is no XSS path from model output.

## Phase 1: Close the open proxy and add rate limiting (do first)

The core principle: the Worker owns the prompt, the model, and the token
budget. The browser only sends raw form fields.

- [x] **1a. Rewrite `worker.js`**
  - Accept only `POST` with a JSON body of exactly these fields:
    `datetime`, `location`, `incidentType`, `officer`, `notes`.
  - Reject unknown fields, non-string values, and over-length values
    (100-200 chars for short fields, 2000 for notes). `notes` is required.
  - Build the incident-report prompt server-side (moved from the page).
  - Hardcode `model: claude-haiku-4-5-20251001` and `max_tokens: 1000`.
  - Add a best-effort per-IP rate limiter in the Worker (5 requests per
    minute, keyed on `CF-Connecting-IP`, in-isolate memory). Return `429`
    with a friendly message the existing client error path can display.

- [x] **1b. Update `pre-built-ai-solutions.html`**
  - The form submit handler sends only the form fields to the Worker
    (no more `model` / `max_tokens` / `messages` in the browser).
  - Remove the client-side `buildPrompt` function.
  - Add `maxlength` attributes to the form inputs matching the server caps
    (good UX; the Worker remains the enforcement point).

- [x] **1c. Verify locally** (16/16 tests passed on 2026-07-02)
  - Node test harness that imports `worker.js` with a stubbed upstream
    `fetch` and asserts: old-style proxy bodies are rejected (400),
    valid form data produces a request with the hardcoded model and
    token cap, oversized/invalid fields are rejected (400), and the
    6th request in a minute from one IP gets a 429.

- [x] **1d. Deploy (manual, Cloudflare dashboard)**
  - Worker deployed via dashboard on 2026-07-02.
  - Site changes committed and pushed to GitHub Pages on 2026-07-02.

- [x] **1e. Add a global daily request budget (Workers KV)**
  - WAF rate limiting was dropped: it is a paid add-on on our plan, and
    zone WAF rules would not cover direct `workers.dev` traffic anyway
    (they attach to a domain proxied through Cloudflare, which
    `taskdepot.ai` is not).
  - Replacement: the Worker counts successful generations per UTC day in
    a KV namespace and returns 429 past `DAILY_LIMIT` (300). This bounds
    worst-case daily spend even under a distributed flood. KV is
    eventually consistent, so the cap is approximate; the Anthropic spend
    cap (2c) is the final backstop.
  - [x] Code added to `worker.js` (fails open if the binding is missing
    or KV errors, so deploy order does not matter). Covered by local
    tests.
  - [x] KV namespace `incident-demo-limits` created and bound as
    `RATE_LIMIT_KV` (2026-07-02).
  - [x] Updated `worker.js` deployed; counter write confirmed live via
    the `count:2026-07-02` key (2026-07-02). Phase 1 complete.

- [x] **1f. Verify live** (all three passed on 2026-07-02 against the
  deployed Worker)
  - Demo form submission rendered a full report end to end.
  - Old-style `{model, messages}` body returned 400 "Unexpected field:
    model" (the proxy is closed).
  - Requests 6+ within one minute from one IP returned 429.

## Phase 2: Hardening (after Phase 1 is confirmed working)

- [x] **2a. Lock CORS to the site origin.** Implemented 2026-07-02:
  origin allowlist (`taskdepot.ai`, `www.taskdepot.ai`, plus
  `localhost:3000` / `127.0.0.1:3000` for the local preview). Requests
  with a disallowed `Origin` header get 403 before any other work.
- [x] **2b. Sanitize errors.** Implemented 2026-07-02: upstream errors
  and network failures are logged with `console.error` (visible in the
  Workers dashboard) and replaced with a generic message. Success
  responses are trimmed to the report text only (no id/model/usage
  metadata).
- [ ] **Deploy 2a + 2b**: re-paste `worker.js` into the Worker's Edit
  Code view and Deploy, then confirm the live demo still generates a
  report.
- [x] **2c. Set a spend cap in the Anthropic Console** (Settings > Limits)
  as a cost backstop. Already configured (confirmed 2026-07-02).
- [ ] **2d. Optional: Cloudflare Turnstile** on the demo form, verified in
  the Worker, if bot traffic ever becomes a problem.

## Files involved

- `worker.js` (reference copy; the dashboard Worker is what actually runs)
- `pre-built-ai-solutions.html` (inline demo script and form markup)
- `README.md` (architecture description must match the new request shape)
