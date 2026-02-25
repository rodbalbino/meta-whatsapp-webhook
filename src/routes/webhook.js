const express = require('express');

function createWebhookRouter({
  BUSINESS,
  clearBooking,
  cleanText,
  dedupeSeen,
  detectIntent,
  extractService,
  extractTime,
  generateAIReply,
  getState,
  looksLikeDate,
  looksLikeTime,
  menuText,
  normalizeBRNumber,
  normalizeMenuChoice,
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

      const msg = value.messages[0];
      const messageId = msg?.id;
      const from = normalizeBRNumber(msg?.from);
      const textBody = cleanText(msg?.text?.body);
      const type = msg?.type;
      const phoneNumberId = value?.metadata?.phone_number_id;

      if (dedupeSeen(messageId)) return;

      console.log(`[${ts}] Message`, { from, type, textBody });

      if (type !== 'text' || !textBody) {
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: 'Recebi 👍 Por enquanto eu entendo só mensagens de texto.',
        });
        return;
      }

      const menuChoice = normalizeMenuChoice(textBody);
      const effectiveText = menuChoice || textBody;
      const state = getState(from);

      if (detectIntent(effectiveText) === 'reset') {
        setState(from, { handoff: false, booking: null });
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: `Pronto ✅ resetado. Como posso te ajudar?\n\n${menuText()}`,
        });
        return;
      }

      if (detectIntent(effectiveText) === 'bot_on') {
        setState(from, { handoff: false });
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: `Fechado 🤖 Voltei! Como posso te ajudar?\n\n${menuText()}`,
        });
        return;
      }

      if (BUSINESS.handoff.enabled && state.handoff) {
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: '✅ Entendi. Um atendente humano vai continuar com você por aqui.',
        });
        return;
      }

      if (BUSINESS.booking.enabled && state.booking) {
        const booking = { ...state.booking };

        if (!booking.service) {
          const service = extractService(textBody);
          if (service) booking.service = service.name;
        }
        if (!booking.date && looksLikeDate(textBody)) booking.date = textBody;
        if (!booking.time && looksLikeTime(textBody)) booking.time = extractTime(textBody) || textBody;
        if (!booking.name && textBody.length >= 2 && !looksLikeDate(textBody) && !looksLikeTime(textBody)) {
          booking.name = textBody;
        }

        const missing = [];
        for (const key of BUSINESS.booking.require) {
          if (!booking[key]) missing.push(key);
        }

        if (missing.length === 0) {
          clearBooking(from);
          const summary =
            '✅ Pedido de agendamento:\n' +
            `- Nome: ${booking.name}\n` +
            `- Serviço: ${booking.service}\n` +
            `- Data: ${booking.date}\n` +
            `- Horário: ${booking.time}`;

          await sendWhatsAppText({
            phoneNumberId,
            to: from,
            body: `${summary}\n\n${BUSINESS.booking.confirmText}`,
          });
          return;
        }

        setState(from, { booking });

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

      const intent = detectIntent(effectiveText);

      if (intent === 'menu') {
        await sendWhatsAppText({ phoneNumberId, to: from, body: menuText() });
        return;
      }

      if (intent === 'handoff') {
        setState(from, { handoff: true, booking: null });
        await sendWhatsAppText({ phoneNumberId, to: from, body: BUSINESS.handoff.message });
        return;
      }

      if (intent === 'address') {
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: `Nosso endereço é: ${BUSINESS.address}\nMapa: ${BUSINESS.addressLink}`,
        });
        return;
      }

      if (intent === 'hours') {
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body: `Nosso horário é: ${BUSINESS.hours}`,
        });
        return;
      }

      if (intent === 'price') {
        const service = extractService(textBody);
        if (service && service.price) {
          await sendWhatsAppText({
            phoneNumberId,
            to: from,
            body: `O valor de ${service.name} é R$ ${service.price}.`,
          });
          return;
        }

        const options = (BUSINESS.catalog.services || []).map((x) => `- ${x.name}`).join('\n');
        await sendWhatsAppText({
          phoneNumberId,
          to: from,
          body:
            'Consigo te ajudar 🙂 Qual serviço você quer orçamento?\n\n' +
            `${options}\n\n` +
            BUSINESS.catalog.notes,
        });
        return;
      }

      if (intent === 'booking') {
        setState(from, {
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
        await sendWhatsAppText({ phoneNumberId, to: from, body: BUSINESS.policies.earlyOpen });
        return;
      }

      if (/sábado|sabado|domingo|fim de semana/.test(effectiveText.toLowerCase())) {
        await sendWhatsAppText({ phoneNumberId, to: from, body: BUSINESS.policies.weekend });
        return;
      }

      const reply = await generateAIReply({ from, text: textBody });

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

  return router;
}

module.exports = { createWebhookRouter };
