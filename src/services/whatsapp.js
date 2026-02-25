function createSendWhatsAppText({ getFetch, graphVersion }) {
  return async function sendWhatsAppText({ phoneNumberId, to, body }) {
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
  };
}

module.exports = { createSendWhatsAppText };
