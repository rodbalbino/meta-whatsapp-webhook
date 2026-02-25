const express = require('express');
const BUSINESS = require('./src/config/business');
const { graphVersion, openaiApiKey, port, verifyToken } = require('./src/config/env');
const { createIntentHelpers } = require('./src/domain/intents');
const { createWebhookRouter } = require('./src/routes/webhook');
const { createGenerateAIReply } = require('./src/services/openai');
const { createSendWhatsAppText } = require('./src/services/whatsapp');
const store = require('./src/state/store');
const { getFetch } = require('./src/utils/fetch');
const { cleanText, normalizeBRNumber, nowStamp } = require('./src/utils/text');

const app = express();
app.use(express.json({ limit: '1mb' }));

const intentHelpers = createIntentHelpers(BUSINESS);

const generateAIReply = createGenerateAIReply({
  BUSINESS,
  getFetch,
  getHistory: store.getHistory,
  openaiApiKey,
  pushHistory: store.pushHistory,
});

const sendWhatsAppText = createSendWhatsAppText({
  getFetch,
  graphVersion,
});

app.use(
  createWebhookRouter({
    BUSINESS,
    clearBooking: store.clearBooking,
    cleanText,
    dedupeSeen: store.dedupeSeen,
    detectIntent: intentHelpers.detectIntent,
    extractService: intentHelpers.extractService,
    extractTime: intentHelpers.extractTime,
    generateAIReply,
    getState: store.getState,
    looksLikeDate: intentHelpers.looksLikeDate,
    looksLikeTime: intentHelpers.looksLikeTime,
    menuText: intentHelpers.menuText,
    normalizeBRNumber,
    normalizeMenuChoice: intentHelpers.normalizeMenuChoice,
    nowStamp,
    sendWhatsAppText,
    setState: store.setState,
    verifyToken,
  }),
);

app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
