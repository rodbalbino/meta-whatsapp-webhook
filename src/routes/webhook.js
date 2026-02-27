const express = require('express');
const { getBusiness } = require('../config/business');
const { resolveTenantIdByPhoneNumberId } = require('../config/tenants');
const { createIntentHelpers } = require('../domain/intents');

function oneLine(data) {
  return JSON.stringify(data);
}

function createWebhookRouter({
  clearBooking,
  cleanText,
  dedupeSeen,
  generateAIReply,
  getState,
  normalizeBRNumber,
  nowStamp,
  sendWhatsAppText,
  setState,
  verifyToken,
}) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, ts: nowStamp() });
  });

  router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
      console.log(`[${nowStamp()}] WEBHOOK VERIFIED`);
      return res.status(200).send(challenge);
    }

    return res.status(403).end();
  });

  router.post('/webhook', async (req, res) => {
    res.status(200).end();
    const ts = nowStamp();

    try {
      const value = req.body?.entry?.[0]?.changes?.[0]?.value;
      if (!value?.messages?.length) return;
      const phoneNumberId = value?.metadata?.phone_number_id;
      const tenantId = resolveTenantIdByPhoneNumberId(phoneNumberId);

      if (!tenantId) {
        console.warn(`[${ts}] Unknown tenant ${oneLine({ phoneNumberId })}`);
        return;
      }

      const business = getBusiness(tenantId);
      const intents = createIntentHelpers(business);

      const msg = value.messages[0];
      const messageId = msg?.id;
      const from = normalizeBRNumber(msg?.from);
      const textBody = cleanText(msg?.text?.body);
      const type = msg?.type;

      if (dedupeSeen(messageId)) {
        console.log(`[${ts}] Deduped ${oneLine({ tenantId, messageId, from, type })}`);
        return;
      }

      console.log(`[${ts}] Message ${oneLine({ tenantId, from, type, textBody })}`);

      if (type !== 'text' || !textBody) {
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: 'Recebi 👍 Por enquanto eu entendo só mensagens de texto.',
        });
        return;
      }

      const menuChoice = intents.normalizeMenuChoice(textBody);
      const effectiveText = menuChoice || textBody;
      const state = getState(tenantId, from);

      if (intents.detectIntent(effectiveText) === 'reset') {
        setState(tenantId, from, { handoff: false, booking: null });
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: `Pronto ✅ resetado. Como posso te ajudar?\n\n${intents.menuText()}`,
        });
        return;
      }

      if (intents.detectIntent(effectiveText) === 'bot_on') {
        setState(tenantId, from, { handoff: false });
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: `Fechado 🤖 Voltei! Como posso te ajudar?\n\n${intents.menuText()}`,
        });
        return;
      }

      if (business.handoff.enabled && state.handoff) {
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: '✅ Entendi. Um atendente humano vai continuar com você por aqui.',
        });
        return;
      }

      if (business.booking.enabled && state.booking) {
        const booking = { ...state.booking };

        if (!booking.service) {
          const service = intents.extractService(textBody);
          if (service) booking.service = service.name;
        }
        if (!booking.date && intents.looksLikeDate(textBody)) booking.date = textBody;
        if (!booking.time && intents.looksLikeTime(textBody)) booking.time = intents.extractTime(textBody) || textBody;
        if (!booking.name && textBody.length >= 2 && !intents.looksLikeDate(textBody) && !intents.looksLikeTime(textBody)) {
          booking.name = textBody;
        }

        const missing = [];
        for (const key of business.booking.require) {
          if (!booking[key]) missing.push(key);
        }

        if (missing.length === 0) {
          clearBooking(tenantId, from);
          const summary =
            '✅ Pedido de agendamento:\n' +
            `- Nome: ${booking.name}\n` +
            `- Serviço: ${booking.service}\n` +
            `- Data: ${booking.date}\n` +
            `- Horário: ${booking.time}`;

          await sendWhatsAppText({
            phoneNumberId,
            to: from,
            body: `${summary}\n\n${business.booking.confirmText}`,
          });
          return;
        }

        setState(tenantId, from, { booking });

        const next = missing[0];
        if (next === 'service') {
          await sendWhatsAppText({
            phoneNumberId,
            to: from,
            body: 'Qual serviço você quer agendar? (ex: corte, barba, corte+barba)',
          });
          return;
        }
        if (next === 'date') {
          await sendWhatsAppText({
            phoneNumberId,
            to: from,
            body: 'Para qual data? (ex: 25/02 ou amanhã)',
          });
          return;
        }
        if (next === 'time') {
          await sendWhatsAppText({
            phoneNumberId,
            to: from,
            body: 'Qual horário você prefere? (ex: 14:30)',
          });
          return;
        }
        if (next === 'name') {
          await sendWhatsAppText({
            phoneNumberId,
            to: from,
            body: 'Qual seu nome? 🙂',
          });
          return;
        }

        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: `Só mais uma informação pra eu finalizar: ${missing.join(', ')}`,
        });
        return;
      }

      const intent = intents.detectIntent(effectiveText);

      if (intent === 'menu') {
        await sendWhatsAppText({ phoneNumberId, to: from, body: intents.menuText() });
        return;
      }

      if (intent === 'handoff') {
        setState(tenantId, from, { handoff: true, booking: null });
        await sendWhatsAppText({ phoneNumberId, to: from, body: business.handoff.message });
        return;
      }

      if (intent === 'address') {
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: `Nosso endereço é: ${business.address}\nMapa: ${business.addressLink}`,
        });
        return;
      }

      if (intent === 'hours') {
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: `Nosso horário é: ${business.hours}`,
        });
        return;
      }

      if (intent === 'price') {
        const service = intents.extractService(textBody);
        if (service && service.price) {
          await sendWhatsAppText({
            phoneNumberId,
            to: from,
            body: `O valor de ${service.name} é R$ ${service.price}.`,
          });
          return;
        }

        const options = (business.catalog.services || []).map((x) => `- ${x.name}`).join('\n');
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body:
            'Consigo te ajudar 🙂 Qual serviço você quer orçamento?\n\n' +
            `${options}\n\n` +
            business.catalog.notes,
        });
        return;
      }

      if (intent === 'booking') {
        setState(tenantId, from, {
          booking: { service: null, date: null, time: null, name: null },
        });

        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: 'Fechado! Vamos agendar ✅\nQual serviço você quer agendar? (ex: corte, barba, corte+barba)',
        });
        return;
      }

      if (intent === 'order') {
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body:
            'Perfeito! Você quer *entrega* ou *retirar*?\n' +
            'Me envie a lista do que precisa (pode ser em uma mensagem só).',
        });
        return;
      }

      if (/mais cedo|cedo|antes das|antes de\s*0?8/.test(effectiveText.toLowerCase())) {
        await sendWhatsAppText({ phoneNumberId, to: from, body: business.policies.earlyOpen });
        return;
      }

      if (/sábado|sabado|domingo|fim de semana/.test(effectiveText.toLowerCase())) {
        await sendWhatsAppText({ phoneNumberId, to: from, body: business.policies.weekend });
        return;
      }

      const reply = await generateAIReply({ tenantId, business, from, text: textBody });

      if (/humano|atendente|pessoa|suporte/i.test(textBody)) {
        setState(tenantId, from, { handoff: true, booking: null });
        await sendWhatsAppText({ phoneNumberId, to: from, body: business.handoff.message });
        return;
      }

      await sendWhatsAppText({ phoneNumberId, to: from, body: reply });
    } catch (err) {
      console.error(`[${ts}] ERROR ${oneLine({ message: err?.message || String(err) })}`);
    }
  });

  return router;
}

module.exports = { createWebhookRouter };
