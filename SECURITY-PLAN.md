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
  - Site changes committed; push to GitHub Pages to finish this item.

- [ ] **1e. Add a global daily request budget (Workers KV)**
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
  - [ ] Manual, Cloudflare dashboard: Storage & Databases > KV > create a
    namespace (e.g. `incident-demo-limits`); then in the
    `incident-report-proxy` Worker, Settings > Bindings > add a KV
    Namespace binding with variable name exactly `RATE_LIMIT_KV`.
  - [ ] Re-paste the updated `worker.js` and Deploy.

- [x] **1f. Verify live** (all three passed on 2026-07-02 against the
  deployed Worker)
  - Demo form submission rendered a full report end to end.
  - Old-style `{model, messages}` body returned 400 "Unexpected field:
    model" (the proxy is closed).
  - Requests 6+ within one minute from one IP returned 429.

## Phase 2: Hardening (after Phase 1 is confirmed working)

- [ ] **2a. Lock CORS to the site origin.** Replace
  `Access-Control-Allow-Origin: *` with `https://taskdepot.ai` and reject
  requests whose `Origin` header is present but not allowed.
- [ ] **2b. Sanitize errors.** Return a generic error message to the
  browser; log the real upstream error with `console.error` (visible in
  the Workers dashboard) instead of forwarding Anthropic's response body.
- [ ] **2c. Set a spend cap in the Anthropic Console** (Settings > Limits)
  as a cost backstop. Cheap to do anytime, including today.
- [ ] **2d. Optional: Cloudflare Turnstile** on the demo form, verified in
  the Worker, if bot traffic ever becomes a problem.

## Files involved

- `worker.js` (reference copy; the dashboard Worker is what actually runs)
- `pre-built-ai-solutions.html` (inline demo script and form markup)
- `README.md` (architecture description must match the new request shape)
