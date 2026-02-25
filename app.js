// WhatsApp Cloud API Webhook (Express) + Router + OpenAI fallback

const express = require('express');

const app = express();
app.use(express.json({ limit: '1mb' }));

// ================= CONFIG =================
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const graphVersion = process.env.GRAPH_VERSION || 'v22.0';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ======== SIMPLE BUSINESS CONFIG (EDIT) ========
const BUSINESS = {
  name: "Jasper's Market",
  address: "Rua Exemplo, 123 - Maringá",
  hours: "Seg a Sex 08h às 18h",
};

// ================= MEMORY =================
const historyMap = new Map();
const MAX_HISTORY = 10;

function pushHistory(from, role, content) {
  const h = historyMap.get(from) || [];
  h.push({ role, content });
  if (h.length > MAX_HISTORY) h.shift();
  historyMap.set(from, h);
}

function getHistory(from) {
  return historyMap.get(from) || [];
}

// ================= DEDUPE =================
const processedMessageIds = new Set();
const MAX_DEDUPE_SIZE = 5000;

function dedupeSeen(id) {
  if (!id) return false;
  if (processedMessageIds.has(id)) return true;
  processedMessageIds.add(id);
  if (processedMessageIds.size > MAX_DEDUPE_SIZE) processedMessageIds.clear();
  return false;
}

// ================= HELPERS =================
function nowStamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function normalizeBRNumber(n) {
  if (!n) return n;
  n = String(n).replace(/[^\d]/g, '');
  if (n.startsWith('55') && n.length === 12) {
    const ddd = n.slice(2, 4);
    const rest = n.slice(4);
    return `55${ddd}9${rest}`;
  }
  return n;
}

async function getFetch() {
  if (typeof fetch === 'function') return fetch;
  const mod = await import('node-fetch');
  return mod.default;
}

// ================= ROUTER =================
function routeMessage(text) {
  const t = text.toLowerCase();

  if (/humano|atendente|pessoa/.test(t)) {
    return { type: 'handoff', reply: 'Ok 👍 vou chamar um atendente humano.' };
  }

  if (/endereço|localização|onde fica|maps/.test(t)) {
    return { type: 'static', reply: `Nosso endereço é: ${BUSINESS.address}` };
  }

  if (/horário|abre|fecha|funciona/.test(t)) {
    return { type: 'static', reply: `Nosso horário é: ${BUSINESS.hours}` };
  }

  return { type: 'ai' };
}

// ================= OPENAI =================
async function generateAIReply({ from, text }) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');

  const f = await getFetch();

  const history = getHistory(from);

  const messages = [
    {
      role: 'system',
      content: `Você é um atendente educado do ${BUSINESS.name}. Responda curto, claro e útil.`
    },
    ...history,
    { role: 'user', content: text }
  ];

  const resp = await f('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7
    })
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(`OpenAI error: ${JSON.stringify(data)}`);
  }

  const reply = data.choices?.[0]?.message?.content || 'Não consegui responder agora 😅';

  pushHistory(from, 'user', text);
  pushHistory(from, 'assistant', reply);

  return reply;
}

// ================= WHATSAPP SEND =================
async function sendWhatsAppText({ phoneNumberId, to, body }) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error('WHATSAPP_TOKEN missing');

  const f = await getFetch();

  const resp = await f(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
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
    }
  );

  const txt = await resp.text();
  if (!resp.ok) throw new Error(`Graph API error ${resp.status}: ${txt}`);
}

// ================= ROUTES =================
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: nowStamp() });
});

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    console.log(`[${nowStamp()}] WEBHOOK VERIFIED`);
    return res.status(200).send(challenge);
  }

  return res.status(403).end();
});

app.post('/webhook', async (req, res) => {
  res.status(200).end();
  const ts = nowStamp();

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;

    if (!value?.messages?.length) return;

    const msg = value.messages[0];

    const messageId = msg?.id;
    const from = normalizeBRNumber(msg?.from);
    const textBody = msg?.text?.body;
    const type = msg?.type;
    const phoneNumberId = value?.metadata?.phone_number_id;

    if (dedupeSeen(messageId)) return;

    console.log(`[${ts}] Message`, { from, textBody });

    if (type !== 'text' || !textBody) {
      await sendWhatsAppText({
        phoneNumberId,
        to: from,
        body: 'Recebi 👍 mas só entendo texto por enquanto.'
      });
      return;
    }

    const route = routeMessage(textBody);

    let reply;

    if (route.type === 'static' || route.type === 'handoff') {
      reply = route.reply;
    } else {
      reply = await generateAIReply({ from, text: textBody });
    }

    await sendWhatsAppText({ phoneNumberId, to: from, body: reply });

    console.log(`[${ts}] Reply sent`, { to: from });

  } catch (err) {
    console.error(`[${ts}] ERROR`, err.message);
  }
});

app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
