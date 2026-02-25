function createIntentHelpers(BUSINESS) {
  function detectIntent(text) {
    const t = text.toLowerCase();

    if (/^(menu|ajuda|opções|opcoes)$/.test(t)) return 'menu';
    if (/cancelar|cancela|parar|zera|reset/.test(t)) return 'reset';
    if (/voltar pro bot|voltar ao bot|bot on|bot ligado/.test(t)) return 'bot_on';
    if (/humano|atendente|pessoa|suporte/.test(t)) return 'handoff';
    if (/endereço|endereco|localização|localizacao|onde fica|maps/.test(t)) return 'address';
    if (/horário|horario|abre|fecha|funciona/.test(t)) return 'hours';
    if (/preço|preco|valor|quanto custa|orçamento|orcamento/.test(t)) return 'price';
    if (/agendar|agenda|marcar|horário\s+para|horario\s+para|reserva/.test(t)) return 'booking';
    if (/pedido|comprar|entrega|delivery|retirar|retirada/.test(t)) return 'order';

    return 'ai';
  }

  function menuText() {
    return (
      `Olá! Eu sou o atendimento do ${BUSINESS.name} 🤖\n\n` +
      'Posso te ajudar com:\n' +
      '1) Endereço\n' +
      '2) Horário\n' +
      '3) Preços / orçamento\n' +
      '4) Agendar\n' +
      '5) Falar com humano\n\n' +
      'Responda com o número ou diga o que você precisa.'
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
    for (const service of BUSINESS.catalog.services || []) {
      if (service.key && t.includes(service.key)) return service;
      if (service.name && t.includes(service.name.toLowerCase())) return service;
    }
    return null;
  }

  function looksLikeDate(text) {
    return /\b(\d{1,2}\/\d{1,2}(\/\d{2,4})?)\b/.test(text) ||
      /\b(hoje|amanhã|amanha|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)\b/i.test(text);
  }

  function looksLikeTime(text) {
    return /\b(\d{1,2}:\d{2}|\d{1,2}h(\d{2})?)\b/i.test(text);
  }

  function extractTime(text) {
    const m1 = text.match(/\b(\d{1,2}):(\d{2})\b/);
    if (m1) return `${m1[1].padStart(2, '0')}:${m1[2]}`;

    const m2 = text.match(/\b(\d{1,2})h(\d{2})?\b/i);
    if (m2) return `${String(m2[1]).padStart(2, '0')}:${m2[2] || '00'}`;

    return null;
  }

  return {
    detectIntent,
    extractService,
    extractTime,
    looksLikeDate,
    looksLikeTime,
    menuText,
    normalizeMenuChoice,
  };
}

module.exports = { createIntentHelpers };
