> **Current Baseline 2.6.1 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over functional Baseline 2.6.0 and unchanged canonical source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). This patch corrects impossible future CURRENT timestamps and stale findings methodology metadata only. Findings remain 46 total (14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED), with 0 release blockers; product and infrastructure health remain **DEGRADED**. Node remains 276/276 and PostgreSQL 4/4. Baseline commit is `SELF_NOT_RECORDED`; no functional, database, deployment or lifecycle change occurred.

# Dependências externas e integrações

## Bibliotecas declaradas

`package.json` usa faixas `latest` para a maior parte do projeto e `package-lock.json` fixa a instalação. `npm ls --depth=0 --json` observou:

| Pacote | Versão instalada | Uso encontrado |
| --- | ---: | --- |
| `next` | 16.2.6 | App Router, rotas, páginas, build e runtime web |
| `react`, `react-dom` | 19.2.6 | interfaces cliente/servidor |
| `@supabase/supabase-js` | 2.106.1 | acesso ao Postgres/RPCs com cliente administrativo e ferramentas |
| `zod` | 4.4.3 | validação de ambiente e payloads |
| `qrcode` | 1.5.4 | criação de QR de ingresso/combo |
| `sharp` | 0.34.5 | composição das imagens de ingresso, combo e mapa |
| `qr-scanner` | 1.4.2 | leitura via câmera na portaria/cozinha/oferta |
| `server-only` | 0.0.1 | impedir uso cliente de módulos sensíveis |
| `typescript` | 6.0.3 | typecheck |
| `eslint`, `eslint-config-next` | 9.39.4 / 16.2.6 | análise estática |

`npm ls` também encontrou `pg@8.22.0` e dependências associadas, além de `@emnapi/runtime`, como **extraneous** no `node_modules`. Elas não estão declaradas em `package.json`; sua origem e necessidade local são DESCONHECIDAS. Isso descreve a instalação local, não o lockfile oficial.

## Integrações externas identificadas

Esta baseline conta **6 integrações de serviço**. Bibliotecas de renderização e browser não entram nessa contagem.

### 1. Supabase/PostgreSQL

- Estado: **PARCIALMENTE CONFIRMADO**.
- Cliente: `src/lib/supabase/admin.ts`, usando `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
- Chamadores: serviços em `src/lib/tickets/services/**`, rotas API, scripts e `.tools/`.
- Banco versionado: 83 migrations em `supabase/migrations/`, 45 tabelas e 44 nomes de função SQL.
- Segurança versionada: RLS, revogações de `public`/`anon`/`authenticated` e grants a `service_role`.
- `SUPABASE_ANON_KEY` é exigida por `src/lib/env.ts`, mas na varredura foi consumida diretamente apenas por auditorias/testes de negação. O runtime principal encontrado usa o cliente service role.
- Não validado: projeto remoto vinculado nesta execução, migrations aplicadas, catálogo real, policies/grants efetivos, dados, backups e buckets.

### 2. Z-API / WhatsApp

- Estado: **PARCIALMENTE CONFIRMADO**.
- Entrada: `src/app/api/webhook/zapi/route.ts`.
- Transporte: `src/lib/zapi/client.ts`; payloads e texto em `format.ts` e `textEncoding.ts`.
- Variáveis: `ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN`, `ZAPI_BASE_URL`, `ZAPI_WEBHOOK_SECRET`.
- Comportamentos estáticos confirmados: validação do segredo de webhook, limite de corpo, descarte de grupos/self, idempotência por mensagem do provedor, persistência inbound/outbound, roteamento e envio.
- Não validado: webhook registrado, instância conectada, limites reais, entrega/callbacks e credenciais.

### 3. Mercado Pago

- Estado: **PARCIALMENTE CONFIRMADO**.
- Cliente: `src/lib/mercado-pago/client.ts`, com base padrão da API Mercado Pago e bearer access token.
- Assinatura: `src/lib/mercado-pago/webhook.ts`.
- Entradas: APIs de pagamento de ingresso/combo e `/api/webhook/payment/mercado-pago`.
- Frontend: checkout carrega o SDK web do Mercado Pago e usa a chave pública.
- Variáveis: `PAYMENT_PROVIDER=mercado_pago`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `MERCADO_PAGO_API_BASE_URL`, `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY`, `CHECKOUT_INTERNAL_SECRET`.
- Comportamentos estáticos confirmados: criação Pix, consulta de pagamento, validação de assinatura, idempotência via `payment_events`, confirmação de pedido e disparo de entrega.
- Não validado: aplicação/credenciais atuais, URL cadastrada de webhook, pagamentos reais, reconciliação e ambiente sandbox/produção.

### 4. Vercel

- Estado: **PARCIALMENTE CONFIRMADO**.
- Configuração: `vercel.json`, `.vercelignore`, variáveis `VERCEL_URL` e `VERCEL_GIT_COMMIT_SHA` referenciadas no código.
- Cron versionado: expiração de reservas e processamento de batches a cada minuto.
- `next.config.ts` emite headers de segurança e contém `Access-Control-Allow-Origin` para uma URL Black House nos assets `/_next/static/*`.
- Não validado: projeto realmente vinculado, ambientes/variáveis atuais, domínio, cron ativo, plano compatível, último deploy e correspondência com o commit.

### 5. GitHub Issues

- Estado: **PARCIALMENTE CONFIRMADO**.
- Implementação: `src/lib/github/issues.ts`; chamado pelo webhook Z-API por meio de `src/lib/tickets/codexRequests.ts`.
- Endpoint: API de issues do GitHub.
- Variáveis: `GITHUB_ISSUES_REPOSITORY` ou fallback `GITHUB_REPOSITORY`; `GITHUB_ISSUES_TOKEN`.
- O fallback de repositório e o `User-Agent` contêm nomes históricos (`ticketeira` e `black-house-codex-whatsapp`).
- Não validado: token, permissões, repositório de destino e criação real de issue.

### 6. Codex CLI local

- Estado: **PARCIALMENTE CONFIRMADO**.
- Implementação: `scripts/codex-local-runner.mjs`; entrada NPM `codex:runner`.
- Fluxo: consulta pedidos aprovados no Supabase, inicia o binário `codex`, captura logs e pode enviar resultado pela Z-API.
- Variáveis: `CODEX_CLI_PATH`, `CODEX_RUNNER_POLL_SECONDS`, `CODEX_WHATSAPP_PHONES`; a listagem avulsa aceita `CODEX_WHATSAPP_PHONE`.
- Estado local do runner: diretório `.codex-whatsapp-runner` sob o perfil do usuário.
- Não validado: runner ativo, autorização operacional, versão/configuração do CLI e política de execução.

## Interfaces locais de browser e processamento

- `qr-scanner` usa câmera/browser nas interfaces de portaria, cozinha e leitor de ofertas. Permissões reais de câmera são NÃO VALIDADAS.
- `qrcode` e `sharp` compõem imagens localmente usando templates/fontes em `public/`; a presença dos consumidores é CONFIRMADA.
- `src/lib/tickets/services/pngImage.ts` gera PNG em memória com compressão; não é serviço externo.
- Nenhum SDK de observabilidade dedicado foi encontrado. Logs estruturados vão para `console` por `src/lib/logger.ts`, com mascaramento de chaves sensíveis e telefones. Destino, retenção e alertas de produção são DESCONHECIDOS.

## Contrato de variáveis de ambiente

Valores não foram registrados. O quadro lista somente nomes e referências versionadas.

### Validadas centralmente por `src/lib/env.ts`

`APP_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN`, `ZAPI_BASE_URL`, `ZAPI_WEBHOOK_SECRET`, `CHECKOUT_INTERNAL_SECRET`, `PAYMENT_PROVIDER`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `MERCADO_PAGO_API_BASE_URL` (opcional), `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY`, `ADMIN_SESSION_TTL_MINUTES` (opcional), `TICKET_RESERVATION_TTL_MINUTES`, `TICKET_QR_SECRET`, `SEAT_MAP_STORAGE_BUCKET`, `GATE_ADMIN_SECRET`, `GATE_SESSION_SECRET`, `GATE_SESSION_TTL_MINUTES`.

### Lidas diretamente fora do schema central

| Variável | Uso encontrado |
| --- | --- |
| `CRON_SECRET` | autenticação das duas rotas cron |
| `CONVERSATION_INACTIVITY_TTL_MINUTES` | webhook e finalizador de conversa |
| `ADMIN_WEB_SESSION_TTL_MINUTES` | TTL da sessão web administrativa |
| `COMBO_OFFER_DELAY_MINUTES` | atraso da oferta pós-entrega |
| `CODEX_CLI_PATH`, `CODEX_RUNNER_POLL_SECONDS` | runner local |
| `CODEX_WHATSAPP_PHONE`, `CODEX_WHATSAPP_PHONES` | filtro de pedidos Codex |
| `GITHUB_REPOSITORY`, `GITHUB_ISSUES_REPOSITORY`, `GITHUB_ISSUES_TOKEN` | issue GitHub |
| `DATABASE_URL` | teste real de capacidade de setor |
| `FULL_INTENT_AUDIT` | expansão da saída de auditoria de intenções |
| `NODE_ENV` | cookies seguros e comportamento de ambiente |
| `VERCEL_URL`, `VERCEL_GIT_COMMIT_SHA` | URL/base e metadado de deploy |
| `USERPROFILE`, `PATH` | runner/auditorias locais |

### Diferenças de `.env.example`

- The unused historical brand-specific WhatsApp variable was removed from the active environment schema; the remaining central schema names are listed.
- Usadas diretamente e ausentes do exemplo: `ADMIN_WEB_SESSION_TTL_MINUTES`, `COMBO_OFFER_DELAY_MINUTES`, `CODEX_CLI_PATH`, `CODEX_RUNNER_POLL_SECONDS`, `CODEX_WHATSAPP_PHONE`, `GITHUB_REPOSITORY`, `DATABASE_URL` e `FULL_INTENT_AUDIT`.
- Presentes no exemplo fora do schema central: `CRON_SECRET`, `CONVERSATION_INACTIVITY_TTL_MINUTES`, `CODEX_WHATSAPP_PHONES`, `GITHUB_ISSUES_REPOSITORY`, `GITHUB_ISSUES_TOKEN`.
- `SEAT_MAP_STORAGE_BUCKET` é exigida pelo schema e repetida nas ferramentas, mas não foi encontrada chamada a Supabase Storage no código versionado.

## Autenticação e autorização observadas

- Admin WhatsApp: usuários, hash de senha, tentativas/bloqueio, challenge e sessão em tabelas próprias; permissões avaliadas em `adminAuth.ts`.
- Admin web: link/código tokenizado, cookies assinados HTTP-only e token CSRF; validação em APIs administrativas.
- Portaria: acessos por telefone/evento e acessos fixos; tokens de sessão com hash/segredo.
- Cozinha: sessão vinculada a dispositivo e cookie de dispositivo.
- Checkout/ingresso: identificadores e tokens assinados/rotacionados pelos serviços.
- Banco: aplicação opera com service role; migrations retiram acesso de papéis públicos. O catálogo efetivo remoto não foi validado.

## Armazenamento

Assets de template são lidos do filesystem do deploy. `seat_map_renders.storage_path` e `SEAT_MAP_STORAGE_BUCKET` sugerem um desenho de armazenamento de mapas, mas não há chamada `.storage`, upload ou download no código auditado. O mapa oficial atual é lido de `public/mapa_mesas.webp` e suas coordenadas são persistidas na tabela `official_table_map_places`.
