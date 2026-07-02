# TaskDepot AI — Small Business Consulting Site

Marketing site for TaskDepot AI. Static HTML/CSS/JS, deployed via GitHub Pages
(custom domain set in `CNAME`).

## Running Locally

The site is plain static files, so any static file server works. To preview it
locally, serve the project directory and open the printed URL:

```
npx serve . -l 3000
```

Then visit <http://localhost:3000/index.html>. No build step or install is
required — `npx` fetches the `serve` package on first run.

## Live Demo: Smart Incident Reporting

The [Pre-Built AI Solutions page](pre-built-ai-solutions.html) includes a live,
interactive demo of **Smart Incident Reporting**. A visitor types rough incident
notes into a form and gets back a professionally formatted incident report,
generated in real time by Claude.

### Architecture

```
Browser (pre-built-ai-solutions.html)
        │  POST { datetime, location, incidentType, officer, notes }
        ▼
Cloudflare Worker  ──►  Anthropic Messages API
(incident-report-proxy)      (api.anthropic.com/v1/messages)
        │
        ▼
   JSON report back to the browser, rendered as a styled report card
```

The demo's front-end code lives inline in
[`pre-built-ai-solutions.html`](pre-built-ai-solutions.html) (the `Try It
Yourself` section). It POSTs the raw form fields to the Worker, parses the
JSON the model returns, and renders it into the report card. The prompt, the
model choice, and the token budget all live in the Worker, never in the
browser, so the endpoint cannot be repurposed as a general Claude proxy.

### Why a Cloudflare Worker?

The Anthropic API key must **never** ship in the public site — anything in the
HTML/JS is visible to every visitor and is committed to a public repo. The
Worker acts as a server-side proxy: the browser calls the Worker, and the Worker
attaches the secret key and forwards the request to Anthropic. The key only ever
exists as a Cloudflare secret, never in this repository.

The Worker code is [`worker.js`](worker.js). It:
- handles CORS preflight (`OPTIONS`) and rejects non-`POST` methods,
- rate limits requests per IP (best effort, in-isolate),
- enforces a global daily request budget with a Workers KV counter
  (namespace bound as `RATE_LIMIT_KV`; fails open if the binding is
  missing so the demo never breaks on KV issues),
- validates the form fields (allowlist, string types, length caps),
- builds the incident-report prompt server-side with a hardcoded model
  and `max_tokens`,
- reads the key from `env.ANTHROPIC_API_KEY` (a Cloudflare secret),
- returns the Anthropic response (and upstream status code) to the browser.

## How the Worker Was Deployed

This Worker was deployed **through the Cloudflare dashboard**, not via Git or the
Wrangler CLI. The dashboard's "Start with Hello World" wizard shows a *read-only*
preview of the code — it does **not** let you edit the script during creation.
The trick is that you edit the code **after** the Worker is deployed.

Steps used:

1. **Workers & Pages → Create application → Create Worker.**
2. Choose **Start with Hello World!** and name the Worker
   **`incident-report-proxy`**. Click **Deploy** (this ships the placeholder
   Hello World code — that's expected).
3. Open the deployed Worker and click **Edit Code**. *This* editor is editable
   (unlike the create-wizard preview). Select all, delete the Hello World code,
   paste in the full contents of [`worker.js`](worker.js), and click **Deploy**.
4. In the Worker's **Settings → Variables and Secrets**, add a **Secret** named
   exactly `ANTHROPIC_API_KEY` with your Anthropic API key as the value, then
   **Deploy**. (The label you give the key inside the Anthropic dashboard does
   not matter — only the Cloudflare secret name `ANTHROPIC_API_KEY` does, because
   `worker.js` reads `env.ANTHROPIC_API_KEY`.)

The deployed Worker URL is
`https://incident-report-proxy.chase-gould7.workers.dev`, which matches the
`WORKER_URL` constant in
[`pre-built-ai-solutions.html`](pre-built-ai-solutions.html).

### Updating the Worker later

To change the proxy logic, edit `worker.js` in this repo for the record, then
copy the new contents into the Worker's **Edit Code** view in the Cloudflare
dashboard and **Deploy**. The dashboard Worker is the source of truth for what
is actually running; this repo's `worker.js` is the reference copy.

> **Note:** `wrangler.toml` exists in the repo from an earlier attempt to deploy
> the Worker via a Git-connected build. That path was abandoned in favor of the
> dashboard method above, so `wrangler.toml` is currently unused. It can be kept
> as scaffolding for a future `wrangler deploy`, or removed.
