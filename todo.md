# TODO

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
