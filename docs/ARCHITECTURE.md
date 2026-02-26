# Arquitetura do Projeto

## Visão Geral

Este projeto é um webhook em Node.js/Express para atendimento via **WhatsApp Cloud API**, com:

- roteamento de intenções por regras (regex),
- fluxo de agendamento guiado,
- fallback com IA (OpenAI),
- estado e histórico **em memória** por usuário.

O ponto de entrada é `app.js`, que faz a composição das dependências e injeta funções no router (`src/routes/webhook.js`).

## Objetivo de Arquitetura

- Manter o core simples e modular (funções puras + injeção de dependências).
- Permitir customização do negócio via `src/config/business.js`.
- Isolar integrações externas (Meta/OpenAI) em `src/services/*`.
- Facilitar troca futura de armazenamento em memória por Redis/Postgres.

## Componentes Principais

### 1. Composição da aplicação

- `app.js`
- Responsável por:
- criar o servidor Express;
- configurar parsing JSON;
- instanciar helpers de intenção;
- instanciar serviços (OpenAI e WhatsApp);
- injetar estado/utilitários/config no router.

### 2. Camada HTTP / Webhook

- `src/routes/webhook.js`
- Endpoints:
- `GET /health`: healthcheck com timestamp.
- `GET /webhook`: verificação do webhook da Meta (`hub.*`).
- `POST /webhook`: processamento de mensagens recebidas.

Responsabilidades do `POST /webhook`:

- extrair payload da WhatsApp Cloud API;
- deduplicar por `message.id`;
- normalizar número e texto;
- aplicar intents por regras;
- conduzir fluxo de agendamento (multi-etapas);
- acionar handoff humano;
- usar IA como fallback;
- enviar respostas via Graph API.

### 3. Domínio (intents e parsing)

- `src/domain/intents.js`
- Implementa:
- `detectIntent(text)`: classifica a mensagem (`menu`, `reset`, `address`, `booking`, etc.);
- `normalizeMenuChoice(text)`: converte `1..5` em intents;
- `extractService(text)`: identifica serviço no catálogo;
- `looksLikeDate(text)` / `looksLikeTime(text)`;
- `extractTime(text)`: normaliza formatos como `14h30` -> `14:30`;
- `menuText()`: menu textual baseado em `BUSINESS`.

### 4. Serviços Externos

- `src/services/whatsapp.js`
- Envia mensagens de texto via **Meta Graph API** (`/{phoneNumberId}/messages`).
- Depende de:
- `WHATSAPP_TOKEN` (env)
- `GRAPH_VERSION` (env/config)

- `src/services/openai.js`
- Gera resposta de IA usando `chat/completions`.
- Modelo atual: `gpt-4o-mini`
- Monta prompt de sistema com dados oficiais de `BUSINESS`.
- Usa histórico por usuário (estado em memória).

### 5. Estado em Memória (MVP)

- `src/state/store.js`
- Estruturas:
- `historyMap`: histórico curto de conversa por usuário (IA).
- `stateMap`: estado de atendimento por usuário (`handoff`, `booking`).
- `processedMessageIds`: deduplicação de mensagens recebidas.

Limites atuais:

- `MAX_HISTORY = 12`
- `MAX_DEDUPE_SIZE = 5000` (ao passar, limpa o set inteiro)

### 6. Configuração e Utilitários

- `src/config/business.js`: dados do negócio (nome, endereço, horários, catálogo, políticas, handoff, booking).
- `src/config/env.js`: leitura de variáveis de ambiente.
- `src/utils/text.js`: limpeza/normalização de texto e número BR + timestamp.
- `src/utils/fetch.js`: usa `global.fetch` (Node 18+) ou fallback `node-fetch` (se instalado).

## Fluxo de Requisição (POST /webhook)

1. Meta envia evento para `POST /webhook`.
2. API responde `200` imediatamente (ack) e processa de forma assíncrona.
3. Extrai `message`, `from`, `text`, `type`, `phone_number_id`.
4. Deduplica por `message.id`.
5. Se não for texto, responde com mensagem de limitação.
6. Normaliza escolha de menu (`1..5`) e detecta intent.
7. Aplica regras prioritárias:
- `reset`
- `bot_on`
- `handoff` ativo
- fluxo de `booking` em andamento
8. Se não houver fluxo ativo, executa intent:
- menu, endereço, horário, preço, agendamento, pedido, handoff
- políticas específicas (cedo/fim de semana)
9. Fallback para OpenAI (`generateAIReply`).
10. Envia resposta via Graph API.

## Fluxo de Agendamento (estado conversacional)

Quando intent = `booking`:

- cria estado `booking` com campos nulos:
- `service`, `date`, `time`, `name`

Em mensagens seguintes:

- tenta preencher os campos com heurísticas:
- serviço via catálogo
- data via regex/termos (`amanhã`, dias da semana etc.)
- horário via regex + normalização
- nome por exclusão (texto >= 2 chars que não parece data/hora)

Quando todos os campos de `BUSINESS.booking.require` são preenchidos:

- limpa `booking` do estado;
- envia resumo do pedido;
- informa texto de confirmação do negócio.

Observação: o projeto **não grava** o agendamento em banco; apenas confirma e delega retorno para equipe.

## Dependências Externas e Integrações

- **Meta WhatsApp Cloud API**
- Entrada: webhook (`GET/POST /webhook`)
- Saída: envio de mensagens (`POST /{phoneNumberId}/messages`)

- **OpenAI API**
- Usada apenas no fallback (intent `ai`)
- Respostas condicionadas por prompt de sistema com dados oficiais do negócio

## Variáveis de Ambiente Relevantes

- `PORT` (default `3000`)
- `VERIFY_TOKEN` (verificação webhook Meta)
- `WHATSAPP_TOKEN` (env usado por `src/services/whatsapp.js`)
- `GRAPH_VERSION` (default `v22.0`)
- `OPENAI_API_KEY` (fallback de IA)

## Estrutura de Diretórios (atual)

```text
.
├── app.js
├── src/
│   ├── config/
│   │   ├── business.js
│   │   └── env.js
│   ├── domain/
│   │   └── intents.js
│   ├── routes/
│   │   └── webhook.js
│   ├── services/
│   │   ├── openai.js
│   │   └── whatsapp.js
│   ├── state/
│   │   └── store.js
│   └── utils/
│       ├── fetch.js
│       └── text.js
└── docs/
    └── ARCHITECTURE.md
```

## Decisões de Projeto (atuais)

- **Injeção de dependências por fábrica** (`createX`) para facilitar testes e troca de implementações.
- **Estado em memória** para simplicidade (MVP).
- **Roteamento por regex** antes da IA para reduzir custo/latência e manter previsibilidade.
- **Ack imediato do webhook** para evitar retries desnecessários da Meta durante processamento.

## Limitações Conhecidas

- Sem persistência (reinício do processo perde histórico/estado/dedup).
- Sem fila/retry estruturado para falhas em Graph/OpenAI.
- Sem assinatura/validação criptográfica do payload da Meta.
- Sem observabilidade estruturada (logs simples via `console`).
- `src/utils/fetch.js` prevê `node-fetch`, mas `package.json` atual não declara essa dependência (ok em Node 18+ com `fetch` global).

## Evolução Recomendada (próximos passos)

1. Trocar `src/state/store.js` por Redis (estado + dedup + histórico com TTL).
2. Persistir agendamentos/pedidos em banco (Postgres) antes de confirmar ao cliente.
3. Adicionar validação de assinatura do webhook (`X-Hub-Signature-256`).
4. Separar orquestração do `POST /webhook` em casos de uso (ex.: `handleIncomingMessage`).
5. Adicionar testes unitários para `intents.js` e fluxo de agendamento.
6. Incluir logs estruturados e correlação por `message.id`/`from`.

