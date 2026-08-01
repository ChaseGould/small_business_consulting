# TODO

## Ops-software repositioning follow-ups (branch: ops-repositioning)

- [x] Get USS approval for the drafted testimonial. Approved by the USS
  owner (relayed by Chase, 2026-08-01), running with title-only
  attribution ("Owner, Unlimited Security Specialists"). Live in the
  USS card in `index.html`.
- [x] Add a founder photo to the "Who you're working with" block. Done
  2026-08-01: `assets/founder-chase.jpg`, mechanical crop/resize of
  Chase's chosen headshot, no filters.
- [ ] Section-depth visit tracking (landing-page-craft Part 1 step 10):
  needs a small endpoint (likely a Cloudflare Worker) to receive
  sendBeacon milestones. Not built yet; site currently has no analytics.
- [ ] hero-bg.mp4 and hero-bg-poster.jpg are no longer referenced by
  index.html after the redesign. Delete them (or repurpose) once the
  redesign ships.
- [ ] LinkedIn assets (logo, banner, OG image) and the site now share the
  dark navy palette; if the palette shifts, regenerate og-image.png and
  favicon.png to match.

- [ ] Investigate the native Cloudflare "Rate limiter" binding for the
  incident-report-proxy Worker. It appears in the dashboard under
  Worker > Settings > Bindings > Add a binding (same list as KV
  namespace), so it seems available on our plan even though WAF rate
  limiting is a paid add-on. If it works, it could replace the
  in-memory per-IP limiter in `worker.js` with proper cross-isolate
  enforcement. Things to figure out before adopting it:
  - Whether it can be configured entirely from the dashboard, or needs
    a `wrangler` deploy (our Worker is deployed by pasting code in the
    dashboard; see README).
  - Its cost and limits on the free plan.
  - How its keying works for a per-IP limit (`CF-Connecting-IP`).
  Not investigated or implemented yet, tracked here on purpose.

- [ ] Set up Wrangler CLI deploys for the incident-report-proxy Worker
  so updates are one command (`npx wrangler deploy`) instead of pasting
  code into the dashboard's Edit Code view. Steps when we do this:
  - Create `wrangler.toml` declaring the Worker name, `main: worker.js`,
    account id, compatibility date, and the KV binding (`RATE_LIMIT_KV`
    -> the `incident-demo-limits` namespace id).
  - IMPORTANT: a Wrangler deploy replaces the Worker's config, and any
    binding not declared in `wrangler.toml` is silently removed. The
    budget check fails open, so the daily cap would vanish without
    breaking the demo. Declare the KV binding BEFORE the first CLI
    deploy, and verify it survives (check the `count:` key still
    increments after deploying).
  - One-time auth: either `npx wrangler login` (browser OAuth) or a
    `CLOUDFLARE_API_TOKEN` env var using the "Edit Cloudflare Workers"
    token template. The `ANTHROPIC_API_KEY` secret persists across
    deploys and stays in the dashboard.
  - Alternative worth comparing while at it: Git-connected Workers
    Builds (auto-deploy on push to main), which the README notes was
    attempted once and abandoned.
