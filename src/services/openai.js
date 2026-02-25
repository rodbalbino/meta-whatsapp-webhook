function createGenerateAIReply({
  BUSINESS,
  getFetch,
  getHistory,
  openaiApiKey,
  pushHistory,
}) {
  return async function generateAIReply({ from, text }) {
    if (!openaiApiKey) throw new Error('OPENAI_API_KEY missing');

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
${(BUSINESS.catalog.services || []).map((s) => `- ${s.name}${s.price ? `: R$ ${s.price}` : ''}`).join('\n')}
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
        Authorization: `Bearer ${openaiApiKey}`,
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
  };
}

module.exports = { createGenerateAIReply };
