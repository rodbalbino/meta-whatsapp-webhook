const express = require('express');
const { graphVersion, openaiApiKey, port, verifyToken, webhookDebugLogs } = require('./src/config/env');
const { createWebhookRouter } = require('./src/routes/webhook');
const { createGenerateAIReply } = require('./src/services/openai');
const { createSendWhatsAppText } = require('./src/services/whatsapp');
const memoryStore = require('./src/state/memoryStore');
const { createPgStore } = require('./src/state/pgStore');

const store = process.env.STORE_DRIVER === 'pg'
  ? createPgStore()
  : memoryStore;
const { getFetch } = require('./src/utils/fetch');
const { cleanText, normalizeBRNumber, nowStamp } = require('./src/utils/text');

const app = express();
app.use(express.json({ limit: '1mb' }));

const generateAIReply = createGenerateAIReply({
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
    clearBooking: store.clearBooking,
    cleanText,
    dedupeSeen: store.dedupeSeen,
    generateAIReply,
    getState: store.getState,
    normalizeBRNumber,
    nowStamp,
    sendWhatsAppText,
    setState: store.setState,
    verifyToken,
    webhookDebugLogs,
  }),
);

app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
