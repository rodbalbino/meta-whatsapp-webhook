# WhatsApp Cloud API Webhook (Node.js + Express)

Servidor simples para integrar com a **WhatsApp Cloud API (Meta)** usando webhook.
Recebe eventos, faz deduplicação básica e responde mensagens de texto automaticamente.

---

## 🚀 Recursos

- Verificação do webhook: `GET /webhook`
- Recebimento de eventos: `POST /webhook`
- Healthcheck: `GET /health`
- Deduplicação em memória por `message.id`
- Resposta automática (echo) via Graph API
- Pronto para deploy no Render.com

---

## 📦 Requisitos

- Node.js 18+
- App na Meta com **WhatsApp Cloud API** configurada
- Token de acesso válido

---

## ⚙️ Instalação

```bash
git clone <repo-url>
cd webhook
npm install
```

---

## 🔐 Variáveis de Ambiente

Crie um `.env` na raiz:

```env
PORT=3000
VERIFY_TOKEN=seu_token_de_verificacao
WHATSAPP_TOKEN=seu_token_de_acesso_meta
GRAPH_VERSION=v19.0
```

> Não versionar o `.env`. Garanta que está no `.gitignore`.

---

## ▶️ Executar

```bash
node app.js
```

Servidor:

```
http://localhost:3000
```

---

## 🔗 Configurar na Meta

Em **Meta Developers → WhatsApp → Configuration**:

**Callback URL**
```
https://SEU_DOMINIO/webhook
```

**Verify Token**
```
(mesmo valor de VERIFY_TOKEN)
```

Assine os eventos:
- `messages`
- `message_status`

---

## 🧪 Teste Rápido

1. Envie uma mensagem para o número conectado.
2. Verifique os logs do servidor.
3. Você deve receber uma resposta:

```
Recebi: "<sua mensagem>" 🚀
```

---

## 🏥 Healthcheck

```
GET /health
```

Resposta:

```json
{ "ok": true }
```

---

## 🧠 Estrutura

```
.
├── app.js
├── README.md
└── .env
```

---

## ☁️ Deploy no Render

1. Conecte o repositório
2. Configure as env vars: `VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `GRAPH_VERSION`
3. Deploy

Webhook final:
```
https://SEU_APP.onrender.com/webhook
```

---

## 🔒 Notas

- A deduplicação atual é em memória (MVP). Para produção, use Redis/Postgres.
- Adicione roteamento de intenções e integração com IA no próximo passo.

---

## 📄 Licença

Uso educacional / protótipo.
