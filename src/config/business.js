module.exports = {
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
    message: 'Ok 👍 vou chamar um atendente humano. Enquanto isso, pode me dizer seu nome e o que você precisa?',
  },
  catalog: {
    services: [
      { key: 'corte', name: 'Corte de cabelo', price: null },
      { key: 'barba', name: 'Barba', price: null },
      { key: 'corte+barba', name: 'Corte + Barba', price: null },
    ],
    notes: 'Se você me disser o serviço exato, eu te passo o valor certinho (ou confirmo com a equipe).',
  },
  booking: {
    enabled: true,
    require: ['service', 'date', 'time', 'name'],
    confirmText: 'Perfeito! Vou confirmar com a equipe e já te retorno. ✅',
  },
};
