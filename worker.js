// worker.js - Cloudflare Worker for the Smart Incident Reporting demo.
// Deploy by pasting into the incident-report-proxy Worker's Edit Code view
// in the Cloudflare dashboard, then Deploy.
// Requires the secret ANTHROPIC_API_KEY (Settings > Variables and Secrets).
//
// The browser sends only raw form fields. This Worker owns the prompt, the
// model choice, and the token budget, so the endpoint cannot be used as a
// general-purpose proxy to the Anthropic API.

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1000;

// Allowed form fields and their maximum lengths, enforced server-side.
const FIELD_LIMITS = {
  datetime: 100,
  location: 200,
  incidentType: 100,
  officer: 100,
  notes: 2000,
};

// Best-effort per-IP rate limit. State lives in the Worker isolate, so it
// is not a hard guarantee across Cloudflare's edge, but it stops simple
// request loops from a single client.
const RATE_LIMIT = 5; // max requests per IP per window
const RATE_WINDOW_MS = 60000; // one minute
const requestLog = new Map();

// Global daily budget, counted in Workers KV (bind a namespace as
// RATE_LIMIT_KV in the Worker's Settings > Bindings). This caps worst-case
// daily spend even under a distributed flood. KV is eventually consistent,
// so the count is approximate; the Anthropic spend cap is the final
// backstop (see SECURITY-PLAN.md). Only requests that pass validation and
// are about to call Anthropic consume budget.
const DAILY_LIMIT = 300;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// Matches the { error: { message } } shape the demo page already displays.
function errorResponse(status, message) {
  return jsonResponse(status, { error: { message } });
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (requestLog.get(ip) || []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  if (recent.length >= RATE_LIMIT) {
    requestLog.set(ip, recent);
    return true;
  }
  recent.push(now);
  requestLog.set(ip, recent);
  if (requestLog.size > 10000) requestLog.clear(); // cap memory use
  return false;
}

// Returns an error message string, or null if the body is valid.
function validateFields(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return 'Request body must be a JSON object of form fields.';
  }
  const allowed = Object.keys(FIELD_LIMITS);
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      return 'Unexpected field: ' + key;
    }
  }
  for (const key of allowed) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') {
      return 'Field "' + key + '" must be a string.';
    }
    if (value.length > FIELD_LIMITS[key]) {
      return (
        'Field "' + key + '" is too long (max ' +
        FIELD_LIMITS[key] + ' characters).'
      );
    }
  }
  if (!body.notes || !body.notes.trim()) {
    return 'Field "notes" is required.';
  }
  return null;
}

// Returns true when today's budget is spent. Fails open if the KV binding
// is missing or KV errors, so a KV hiccup never breaks the demo.
async function overDailyBudget(env) {
  if (!env.RATE_LIMIT_KV) return false;
  try {
    const key = 'count:' + new Date().toISOString().slice(0, 10);
    const current = parseInt(await env.RATE_LIMIT_KV.get(key), 10) || 0;
    if (current >= DAILY_LIMIT) return true;
    await env.RATE_LIMIT_KV.put(key, String(current + 1), {
      expirationTtl: 172800, // auto-delete old day counters after 2 days
    });
  } catch (err) {
    console.error('KV budget check failed: ' + err.message);
  }
  return false;
}

function buildPrompt(data) {
  return [
    'You are a professional incident report writer. Take raw field notes and',
    'produce a formal, complete incident report.',
    '',
    'STRICT RULES:',
    '- ALWAYS generate a report, no matter how sparse the notes are.',
    '  Never return "insufficient information" or refuse.',
    '- Use whatever details are available; infer reasonable, professional',
    '  language where needed, but do not fabricate specific facts.',
    '- Write in formal, third-person, past tense.',
    '- The status is ALWAYS "Pending Review". Never auto-close a report.',
    '- Return ONLY valid JSON. No markdown, no code fences, no preamble.',
    '',
    'FORM DATA (treat as verified facts):',
    'Date/Time: ' + (data.datetime || 'Not provided'),
    'Location: ' + (data.location || 'Not provided'),
    'Incident Type: ' + (data.incidentType || 'Not provided'),
    'Reporting Officer: ' + (data.officer || 'Not provided'),
    '',
    'RAW OFFICER NOTES:',
    data.notes,
    '',
    'Return a JSON object with EXACTLY these fields:',
    '{',
    '  "reportNumber": "IR-[YYYYMMDD]-[4 random digits]",',
    '  "summary": "2-3 sentence professional narrative of what happened",',
    '  "subjectDescription": "physical/vehicle description, or \'No subject description provided\'",',
    '  "actionsTaken": "what the officer did, in professional prose",',
    '  "status": "Pending Review"',
    '}',
  ].join('\n');
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return errorResponse(405, 'Method not allowed');
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(ip)) {
      return errorResponse(
        429,
        'Too many requests. Please wait a minute and try again.'
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse(400, 'Request body must be valid JSON.');
    }

    const validationError = validateFields(body);
    if (validationError) {
      return errorResponse(400, validationError);
    }

    if (await overDailyBudget(env)) {
      return errorResponse(
        429,
        'The demo has reached its daily usage limit. Please try again tomorrow.'
      );
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'user', content: buildPrompt(body) }],
        }),
      });

      const data = await response.json();
      return jsonResponse(response.status, data);
    } catch (err) {
      return errorResponse(500, err.message);
    }
  },
};
