// WhatsApp Cloud API Webhook (Express)
// - GET  /webhook  : Meta verification (hub.challenge)
// - POST /webhook  : Receive events (messages)
// - GET  /health   : Healthcheck

const express = require('express');

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// Config
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const graphVersion = process.env.GRAPH_VERSION || 'v19.0';

if (!verifyToken) {
  console.warn('[WARN] VERIFY_TOKEN is not set. Webhook verification will fail.');
}

// In-memory dedupe (OK for MVP). For production, move to Redis/Postgres.
const processedMessageIds = new Set();
const MAX_DEDUPE_SIZE = 5000;

function dedupeSeen(id) {
  if (!id) return false;
  if (processedMessageIds.has(id)) return true;
  processedMessageIds.add(id);
  // Prevent unbounded growth
  if (processedMessageIds.size > MAX_DEDUPE_SIZE) {
    // naive trim: clear all (good enough for MVP)
    processedMessageIds.clear();
  }
  return false;
}

function nowStamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// Node 18+ has global fetch. Provide a fallback if needed.
async function getFetch() {
  if (typeof fetch === 'function') return fetch;
  // Lazy-load node-fetch if the runtime is older
  const mod = await import('node-fetch');
  return mod.default;
}

async function sendWhatsAppText({ phoneNumberId, to, body }) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) {
    throw new Error('WHATSAPP_TOKEN is not set');
  }
  if (!phoneNumberId) {
    throw new Error('phoneNumberId is missing');
  }
  if (!to) {
    throw new Error('recipient (to) is missing');
  }

  const f = await getFetch();
  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

  const resp = await f(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Graph API error ${resp.status}: ${text}`);
  }

  return text;
}

// Healthcheck
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, ts: nowStamp() });
});

// Webhook verification (Meta)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && token === verifyToken) {
    console.log(`[${nowStamp()}] WEBHOOK VERIFIED`);
    return res.status(200).send(challenge);
  }

  console.warn(`[${nowStamp()}] WEBHOOK VERIFICATION FAILED`, {
    mode,
    token_present: Boolean(token),
  });
  return res.status(403).end();
});

// Webhook receiver
app.post('/webhook', async (req, res) => {
  // ACK fast
  res.status(200).end();

  const ts = nowStamp();

  try {
    const body = req.body;

    // Safely walk the payload
    const value = body?.entry?.[0]?.changes?.[0]?.value;

    // Ignore non-message updates (e.g., statuses)
    if (!value?.messages || !Array.isArray(value.messages) || value.messages.length === 0) {
      // Useful for debugging, but not too noisy
      const hasStatuses = Boolean(value?.statuses?.length);
      console.log(`[${ts}] Event received (ignored)`, { hasStatuses });
      return;
    }

    const msg = value.messages[0];

    const messageId = msg?.id;
    const from = msg?.from;
    const type = msg?.type;
    const textBody = msg?.text?.body;
    const phoneNumberId = value?.metadata?.phone_number_id;

    if (dedupeSeen(messageId)) {
      console.log(`[${ts}] Duplicate message ignored`, { messageId });
      return;
    }

    console.log(`[${ts}] Message received`, {
      messageId,
      from,
      type,
      phoneNumberId,
      text: textBody,
    });

    // MVP: respond only to text messages
    if (type !== 'text' || !textBody) {
      await sendWhatsAppText({
        phoneNumberId,
        to: from,
        body: 'Recebi sua mensagem 👍 (por enquanto eu respondo só texto).',
      });
      console.log(`[${ts}] Reply sent (non-text fallback)`, { to: from, messageId });
      return;
    }

    // Simple echo reply (replace with router + LLM later)
    const reply = `Recebi: "${textBody}" 🚀`;

    await sendWhatsAppText({
      phoneNumberId,
      to: from,
      body: reply,
    });

    console.log(`[${ts}] Reply sent`, { to: from, messageId });
  } catch (err) {
    console.error(`[${ts}] Webhook processing error`, {
      error: err?.message || String(err),
    });
  }
});

// Root (optional)
app.get('/', (_req, res) => {
  res.status(200).send('OK');
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}`);
  console.log(`Webhook verify: GET  /webhook`);
  console.log(`Webhook events: POST /webhook`);
  console.log(`Healthcheck:    GET  /health\n`);
});
