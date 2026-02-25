// WhatsApp Cloud API Webhook (Express)
// Real attendant v1: router + lead capture + scheduling flow + OpenAI fallback

const express = require('express');

const app = express();
app.use(express.json({ limit: '1mb' }));

// ================= CONFIG =================
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const graphVersion = process.env.GRAPH_VERSION || 'v22.0';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ================= BUSINESS (EDIT THIS) =================
// Deixe isso bem certinho — a IA vai obedecer ao que estiver aqui.
const BUSINESS = {
  name: "Jasper's Market",
  shortDescription: 'Mercado de bairro com atendimento rápido por WhatsApp.',
  address: 'Rua Exemplo, 123 - Maringá',
  addressLink: 'https://maps.google.com/?q=Rua+Exemplo,+123+-+Maring%C3%A1',
  hours: 'Seg a Sex 08h às 18h',
  policies: {
    earlyOpen: 'A gente abre às 08h. Se você precisar muito antes, me diga o motivo e eu verifico com a equipe.',
    weekend: 'No momento não abrimos aos sábados e domingos.',
  },
  handoff: {
    enabled: true,
    message: 'Ok 👍 vou chamar um atendente humano. Enquanto isso, pode me dizer seu nome e o que você precisa?'
  },
  // Serviços/produtos: adapte para seu negócio (mercado/salão/clínica)
  catalog: {
    // Exemplos. Edite ou apague.
    services: [
      { key: 'corte', name: 'Corte de cabelo', price: null },
      { key: 'barba', name: 'Barba', price: null },
      { key: 'corte+barba', name: 'Corte + Barba', price: null },
    ],
    notes: 'Se você me disser o serviço exato, eu te passo o valor certinho (ou confirmo com a equipe).'
  },
  booking: {
    enabled: true,
    // Se for mercado, você pode desabilitar e usar apenas orçamento/pedido.
    require: ['service', 'date', 'time', 'name'],
    confirmText: 'Perfeito! Vou confirmar com a equipe e já te retorno. ✅',
  },
};

// ================= MEMORY / STATE =================
const historyMap = new Map();
const stateMap = new Map();
const MAX_HISTORY = 12;

function getState(from) {
  return stateMap.get(from) || { handoff: false, booking: null };
}

function setState(from, patch) {
  const cur = getState(from);
  stateMap.set(from, { ...cur, ...patch });
}

function clearBooking(from) {
  const cur = getState(from);
  stateMap.set(from, { ...cur, booking: null });
}

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
  // BR mobile without 9: 55 + DDD + 8 digits
  if (n.startsWith('55') && n.length === 12) {
    const ddd = n.slice(2, 4);
    const rest = n.slice(4);
    return `55${ddd}9${rest}`;
  }
  return n;
}

function cleanText(s) {
  return String(s || '').trim();
}

async function getFetch() {
  if (typeof fetch === 'function') return fetch;
  const mod = await import('node-fetch');
  return mod.default;
}

function detectIntent(text) {
  const t = text.toLowerCase();

  if (/^(menu|ajuda|opções|opcoes)$/.test(t)) return 'menu';
  if (/cancelar|cancela|parar|zera|reset/.test(t)) return 'reset';
  if (/voltar pro bot|voltar ao bot|bot on|bot ligado/.test(t)) return 'bot_on';
  if (/humano|atendente|pessoa|suporte/.test(t)) return 'handoff';

  if (/endereço|endereco|localização|localizacao|onde fica|maps/.test(t)) return 'address';
  if (/horário|horario|abre|fecha|funciona/.test(t)) return 'hours';

  // preço/orçamento
  if (/preço|preco|valor|quanto custa|orçamento|orcamento/.test(t)) return 'price';

  // agendamento
  if (/agendar|agenda|marcar|horário\s+para|horario\s+para|reserva/.test(t)) return 'booking';

  // pedido (mercado)
  if (/pedido|comprar|entrega|delivery|retirar|retirada/.test(t)) return 'order';

  return 'ai';
}

function menuText() {
  return (
    `Olá! Eu sou o atendimento do ${BUSINESS.name} 🤖\n\n` +
    `Posso te ajudar com:\n` +
    `1) Endereço\n` +
    `2) Horário\n` +
    `3) Preços / orçamento\n` +
    `4) Agendar\n` +
    `5) Falar com humano\n\n` +
    `Responda com o número ou diga o que você precisa.`
  );
}

function normalizeMenuChoice(text) {
  const t = text.trim();
  if (t === '1') return 'address';
  if (t === '2') return 'hours';
  if (t === '3') return 'price';
  if (t === '4') return 'booking';
  if (t === '5') return 'handoff';
  return null;
}

function extractService(text) {
  const t = text.toLowerCase();
  for (const s of BUSINESS.catalog.services || []) {
    if (s.key && t.includes(s.key)) return s;
    if (s.name && t.includes(s.name.toLowerCase())) return s;
  }
  return null;
}

function looksLikeDate(text) {
  return /\b(\d{1,2}\/\d{1,2}(\/\d{2,4})?)\b/.test(text) || /\b(hoje|amanhã|amanha|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)\b/i.test(text);
}

function looksLikeTime(text) {
  return /\b(\d{1,2}:\d{2}|\d{1,2}h(\d{2})?)\b/i.test(text);
}

function extractTime(text) {
  const m1 = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m1) return `${m1[1].padStart(2, '0')}:${m1[2]}`;
  const m2 = text.match(/\b(\d{1,2})h(\d{2})?\b/i);
  if (m2) return `${String(m2[1]).padStart(2, '0')}:${(m2[2] || '00')}`;
  return null;
}

// ================= OPENAI =================
async function generateAIReply({ from, text }) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');

  const f = await getFetch();
  const history = getHistory(from);

  const system = `Você é um atendente do ${BUSINESS.name}.

Informações oficiais (NUNCA invente outras):
- Nome: ${BUSINESS.name}
- Descrição: ${BUSINESS.shortDescription}
- Endereço: ${BUSINESS.address}
- Link do endereço (se pedir mapa): ${BUSINESS.addressLink}
- Horário: ${BUSINESS.hours}
- Política (abrir mais cedo): ${BUSINESS.policies.earlyOpen}
- Política (fim de semana): ${BUSINESS.policies.weekend}

Catálogo (se perguntarem preço/serviço, peça detalhes se necessário):
${(BUSINESS.catalog.services || []).map(s => `- ${s.name}${s.price ? `: R$ ${s.price}` : ''}`).join('\n')}
Observação: ${BUSINESS.catalog.notes}

Regras:
- Endereço/horário: use APENAS os oficiais.
- Nunca invente preços, telefones, links, promoções ou disponibilidade.
- Se o usuário pedir preço e você não tiver o valor, peça o serviço exato e diga que vai confirmar.
- Seja curto, claro e amigável.
- Se o usuário pedir humano, responda que vai chamar um atendente e não continue com IA.\n`;

  const messages = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: text },
  ];

  const resp = await f('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.4,
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`OpenAI error: ${JSON.stringify(data)}`);

  const reply = data.choices?.[0]?.message?.content?.trim() || 'Não consegui responder agora 😅';

  pushHistory(from, 'user', text);
  pushHistory(from, 'assistant', reply);

  return reply;
}

// ================= WHATSAPP SEND =================
async function sendWhatsAppText({ phoneNumberId, to, body }) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error('WHATSAPP_TOKEN missing');

  const f = await getFetch();

  const resp = await f(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
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
    const textBody = cleanText(msg?.text?.body);
    const type = msg?.type;
    const phoneNumberId = value?.metadata?.phone_number_id;

    if (dedupeSeen(messageId)) return;

    console.log(`[${ts}] Message`, { from, type, textBody });

    // Only text for now
    if (type !== 'text' || !textBody) {
      await sendWhatsAppText({
        phoneNumberId,
        to: from,
        body: 'Recebi 👍 Por enquanto eu entendo só mensagens de texto.'
      });
      return;
    }

    // Menu numeric shortcuts
    const menuChoice = normalizeMenuChoice(textBody);
    const effectiveText = menuChoice ? menuChoice : textBody;

    // Handle state first
    const state = getState(from);

    // Reset
    if (detectIntent(effectiveText) === 'reset') {
      setState(from, { handoff: false, booking: null });
      await sendWhatsAppText({ phoneNumberId, to: from, body: 'Pronto ✅ resetado. Como posso te ajudar?\n\n' + menuText() });
      return;
    }

    // Turn bot back on
    if (detectIntent(effectiveText) === 'bot_on') {
      setState(from, { handoff: false });
      await sendWhatsAppText({ phoneNumberId, to: from, body: 'Fechado 🤖 Voltei! Como posso te ajudar?\n\n' + menuText() });
      return;
    }

    // Persistent handoff: once on, stop responding with AI/router (except reset/bot_on)
    if (BUSINESS.handoff.enabled && state.handoff) {
      await sendWhatsAppText({
        phoneNumberId,
        to: from,
        body: '✅ Entendi. Um atendente humano vai continuar com você por aqui.'
      });
      return;
    }

    // Booking flow continuation
    if (BUSINESS.booking.enabled && state.booking) {
      const b = { ...state.booking };

      // Fill missing fields from message
      if (!b.service) {
        const s = extractService(textBody);
        if (s) b.service = s.name;
      }
      if (!b.date && looksLikeDate(textBody)) b.date = textBody;
      if (!b.time && looksLikeTime(textBody)) b.time = extractTime(textBody) || textBody;
      if (!b.name && textBody.length >= 2 && !looksLikeDate(textBody) && !looksLikeTime(textBody)) {
        // naive name capture
        b.name = textBody;
      }

      // Determine next question
      const missing = [];
      for (const k of BUSINESS.booking.require) {
        if (!b[k]) missing.push(k);
      }

      if (missing.length === 0) {
        // Completed
        clearBooking(from);
        const summary = `✅ Pedido de agendamento:\n- Nome: ${b.name}\n- Serviço: ${b.service}\n- Data: ${b.date}\n- Horário: ${b.time}`;
        await sendWhatsAppText({ phoneNumberId, to: from, body: summary + '\n\n' + BUSINESS.booking.confirmText });
        return;
      }

      setState(from, { booking: b });

      const next = missing[0];
      if (next === 'service') {
        await sendWhatsAppText({ phoneNumberId, to: from, body: 'Qual serviço você quer agendar? (ex: corte, barba, corte+barba)' });
        return;
      }
      if (next === 'date') {
        await sendWhatsAppText({ phoneNumberId, to: from, body: 'Para qual data? (ex: 25/02 ou amanhã)' });
        return;
      }
      if (next === 'time') {
        await sendWhatsAppText({ phoneNumberId, to: from, body: 'Qual horário você prefere? (ex: 14:30)' });
        return;
      }
      if (next === 'name') {
        await sendWhatsAppText({ phoneNumberId, to: from, body: 'Qual seu nome? 🙂' });
        return;
      }

      await sendWhatsAppText({ phoneNumberId, to: from, body: 'Só mais uma informação pra eu finalizar: ' + missing.join(', ') });
      return;
    }

    // Router
    const intent = detectIntent(effectiveText);

    // MENU
    if (intent === 'menu') {
      await sendWhatsAppText({ phoneNumberId, to: from, body: menuText() });
      return;
    }

    // HANDOFF
    if (intent === 'handoff') {
      setState(from, { handoff: true, booking: null });
      await sendWhatsAppText({ phoneNumberId, to: from, body: BUSINESS.handoff.message });
      return;
    }

    // ADDRESS
    if (intent === 'address') {
      await sendWhatsAppText({
        phoneNumberId,
        to: from,
        body: `Nosso endereço é: ${BUSINESS.address}\nMapa: ${BUSINESS.addressLink}`
      });
      return;
    }

    // HOURS
    if (intent === 'hours') {
      await sendWhatsAppText({ phoneNumberId, to: from, body: `Nosso horário é: ${BUSINESS.hours}` });
      return;
    }

    // PRICE
    if (intent === 'price') {
      const s = extractService(textBody);
      if (s && s.price) {
        await sendWhatsAppText({ phoneNumberId, to: from, body: `O valor de ${s.name} é R$ ${s.price}.` });
        return;
      }

      // If service not specified or price unknown
      const options = (BUSINESS.catalog.services || []).map(x => `- ${x.name}`).join('\n');
      await sendWhatsAppText({
        phoneNumberId,
        to: from,
        body:
          `Consigo te ajudar 🙂 Qual serviço você quer orçamento?\n\n` +
          `${options}\n\n` +
          `${BUSINESS.catalog.notes}`
      });
      return;
    }

    // BOOKING
    if (intent === 'booking') {
      // Start booking flow
      setState(from, {
        booking: { service: null, date: null, time: null, name: null }
      });

      await sendWhatsAppText({
        phoneNumberId,
        to: from,
        body: 'Fechado! Vamos agendar ✅\nQual serviço você quer agendar? (ex: corte, barba, corte+barba)'
      });
      return;
    }

    // ORDER (market)
    if (intent === 'order') {
      await sendWhatsAppText({
        phoneNumberId,
        to: from,
        body:
          'Perfeito! Você quer *entrega* ou *retirar*?\n' +
          'Me envie a lista do que precisa (pode ser em uma mensagem só).'
      });
      return;
    }

    // EARLY OPEN question (simple heuristic)
    if (/mais cedo|cedo|antes das|antes de\s*0?8/.test(effectiveText.toLowerCase())) {
      await sendWhatsAppText({ phoneNumberId, to: from, body: BUSINESS.policies.earlyOpen });
      return;
    }

    // Weekend
    if (/sábado|sabado|domingo|fim de semana/.test(effectiveText.toLowerCase())) {
      await sendWhatsAppText({ phoneNumberId, to: from, body: BUSINESS.policies.weekend });
      return;
    }

    // Fallback to OpenAI (controlled)
    const reply = await generateAIReply({ from, text: textBody });

    // Safety: if user asked for human, force handoff
    if (/humano|atendente|pessoa|suporte/i.test(textBody)) {
      setState(from, { handoff: true, booking: null });
      await sendWhatsAppText({ phoneNumberId, to: from, body: BUSINESS.handoff.message });
      return;
    }

    await sendWhatsAppText({ phoneNumberId, to: from, body: reply });

  } catch (err) {
    console.error(`[${ts}] ERROR`, err?.message || String(err));
  }
});

app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
