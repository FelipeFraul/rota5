# Staging Setup

Atualizado em 27/05/2026.

## Objetivo

Validar a Fase 2 de hardening, com tokens de URL trocados por cookies `HttpOnly`, em um ambiente equivalente ao de producao sem dar ao Preview acesso direto aos recursos reais de producao.

Este ambiente deve permitir auditoria completa de admin login, portaria, ticket publico, webhooks e cron usando dados temporarios e credenciais separadas.

## Decisao de Seguranca

Nao copiar secrets reais de `Production` para `Preview`.

Motivo: se secrets reais forem copiados para Preview, qualquer preview deployment do projeto pode acessar Supabase, Z-API e Mercado Pago reais. Isso so seria aceitavel em um projeto totalmente controlado, com apenas branches confiaveis gerando preview, e mesmo assim como excecao temporaria.

O caminho recomendado e um Staging real, com recursos separados e secrets proprios.

## Arquitetura Recomendada

### Vercel Staging/Preview

- usar um deployment de preview ou projeto Vercel separado para staging;
- configurar `APP_BASE_URL` apontando para a URL real do staging/preview;
- cadastrar somente envs de staging;
- nao cadastrar secrets de producao no ambiente `Preview`;
- restringir quem consegue gerar preview deployments, se possivel;
- manter a branch `hardening/http-only-token-phase-2` como origem da validacao.

### Supabase Staging

- criar projeto Supabase separado, preferencialmente;
- alternativa menos ideal: banco separado no mesmo projeto, desde que sem acesso aos dados de producao;
- aplicar todas as migrations do projeto;
- criar dados temporarios para auditoria: admin de teste, eventos, sessoes, tickets, gate sessions e pedidos controlados;
- usar `service_role` exclusivo de staging;
- garantir que nenhuma rotina de staging aponte para banco, storage bucket ou auth de producao;
- limpar dados temporarios ao final dos testes.

### Z-API

- preferir instancia de teste da Z-API;
- usar `ZAPI_BASE_URL`, `ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN` e `ZAPI_CLIENT_TOKEN` proprios de staging;
- se nao houver instancia separada, usar mock local/controlado para auditoria;
- nao enviar mensagens reais durante testes automatizados, salvo teste manual explicitamente autorizado.

### Mercado Pago

- usar credenciais de teste/sandbox;
- configurar webhook para a URL de staging;
- nao usar `MERCADO_PAGO_ACCESS_TOKEN` real de producao;
- testar apenas pagamentos controlados/sandbox.

## Envs Necessarias

Cadastrar no ambiente de staging, sem reutilizar valores de producao:

```text
APP_BASE_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ZAPI_INSTANCE_ID
ZAPI_INSTANCE_TOKEN
ZAPI_CLIENT_TOKEN
ZAPI_BASE_URL
ZAPI_WEBHOOK_SECRET
CHECKOUT_INTERNAL_SECRET
PAYMENT_PROVIDER
MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_SECRET
NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY
ADMIN_WHATSAPP_PHONES
TICKET_RESERVATION_TTL_MINUTES
TICKET_QR_SECRET
SEAT_MAP_STORAGE_BUCKET
GATE_ADMIN_SECRET
GATE_SESSION_SECRET
GATE_SESSION_TTL_MINUTES
CRON_SECRET
```

Opcionais usadas condicionalmente:

```text
MERCADO_PAGO_API_BASE_URL
ADMIN_ROOT_WHATSAPP_PHONES
ADMIN_SESSION_TTL_MINUTES
```

Observacoes:

- `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` e publica no browser por design;
- todas as demais devem ser tratadas como server-side/sensiveis;
- `TICKET_QR_SECRET` e `GATE_SESSION_SECRET` precisam ter pelo menos 32 caracteres;
- `PAYMENT_PROVIDER` deve ser `mercado_pago`;
- `APP_BASE_URL` deve apontar para o staging, nao para producao.

## Como Validar a Fase 2

Com o staging configurado:

1. gerar novo preview deployment da branch `hardening/http-only-token-phase-2`;
2. confirmar que o deployment usa envs de staging;
3. criar fixtures temporarias no Supabase staging;
4. executar auditoria completa de admin e portaria;
5. limpar todos os dados temporarios;
6. revisar logs do staging;
7. rodar validacao local antes de qualquer merge.

Checklist de admin:

- `/admin/login/token-invalido` mostra pagina segura;
- `/admin/login/{token valido}` cria cookie `admin_login_challenge`;
- cookie contem `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` e `Max-Age` curto;
- URL final fica `/admin/login`;
- `/admin/login` sem cookie mostra link invalido/expirado;
- `/api/admin/login/verify` sem cookie retorna `401`;
- senha errada falha com resposta segura;
- senha correta gera codigo unico;
- codigo correto no WhatsApp cria sessao admin;
- reutilizar challenge/cookie consumido falha;
- cliente comum nao recebe acesso admin.

Checklist de portaria:

- `/gate/session/token-invalido` mostra pagina segura;
- `/gate/session/{token valido}` cria cookie `gate_session`;
- cookie contem `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` e `Max-Age` alinhado a sessao;
- URL final fica `/gate/session`;
- `/gate/session` sem cookie mostra acesso invalido;
- `/api/gate/session/validate` sem cookie retorna `401`;
- `/api/gate/session/scan` sem cookie retorna `401`;
- QR correto retorna `allowed`;
- segunda leitura retorna `already_used`;
- ticket de outro evento retorna `wrong_event`;
- ticket de outra sessao retorna `wrong_session`;
- ticket invalido retorna resposta segura.

Checklist de regressao:

- `/tickets/token-invalido` mostra pagina segura;
- `/api/webhook/zapi` sem segredo retorna `401`;
- `/api/webhook/payment/mercado-pago` sem assinatura retorna `401`;
- `/api/checkout/mercado-pago` sem secret retorna `401`;
- `/api/cron/expire-reservations` sem bearer retorna `401`;
- compra normal em sandbox continua funcionando;
- ticket publico e QR continuam carregando;
- cortesia continua validando, se fixture de cortesia estiver disponivel.

Checklist de seguranca:

- token bruto nao aparece em HTML, props, JSON publico, `localStorage` ou `sessionStorage`;
- token de admin/portaria nao e enviado no body das APIs depois do bootstrap;
- cookies nao sao acessiveis por JavaScript por causa de `HttpOnly`;
- senha aparece apenas no POST do proprio navegador, o que e esperado;
- token do QR continua indo no scan, porque o navegador precisa ler o QR;
- logs nao registram token bruto, senha, QR/base64 ou secrets.

Validacao local obrigatoria:

```bash
npm run lint
npm run typecheck
npm run build
git status --short
```

## Auditoria Automatizada

O script de auditoria de preview pode ser temporario ou permanente.

Se for temporario:

- criar em `/private/tmp` ou `.tools` apenas durante a auditoria;
- remover antes do commit final;
- nunca commitar secrets ou valores reais;
- manter `git status --short` limpo ao final.

Se virar permanente:

- salvar em `.tools/audit_preview_http_only_phase2.mjs`;
- usar apenas nomes de env e valores lidos do ambiente;
- nao conter telefone real, token real, secret real ou URL sensivel;
- usar prefixo de teste claro;
- criar fixtures temporarias;
- executar cleanup completo mesmo em caso de erro;
- falhar se detectar token bruto em HTML/JSON/body indevido.

## Promocao Para Producao

Promover a Fase 2 somente depois que:

- staging estiver equivalente;
- auditoria admin e portaria passar;
- regressao passar;
- lint/typecheck/build passarem;
- `git status --short` estiver limpo;
- nenhum secret de producao tiver sido copiado para Preview;
- nenhuma migration destrutiva tiver sido criada;
- branch estiver revisada.

Fluxo recomendado:

1. abrir PR da branch `hardening/http-only-token-phase-2`;
2. revisar diff;
3. merge para `main`;
4. deploy de producao;
5. testar producao com casos seguros;
6. acompanhar logs.

Smoke pos-deploy de producao:

- `/admin/login/token-invalido`;
- `/gate/session/token-invalido`;
- `/api/webhook/zapi` sem segredo deve retornar `401`;
- `/api/webhook/payment/mercado-pago` sem assinatura deve retornar `401`;
- `/api/checkout/mercado-pago` sem secret deve retornar `401`;
- `/api/cron/expire-reservations` sem bearer deve retornar `401`;
- fluxo admin controlado;
- fluxo portaria controlado.

## Rollback

Rollback seguro ja registrado em `docs/ROLLBACK_PLAN_HTTP_ONLY_PHASE_2.md`.

Ponto seguro:

```text
tag: pre-http-only-token-phase-2
commit: b6f7b97839cb6daf803d3c6676731c88b657c0cc
deployment seguro: dpl_6WphQxzUdwhVU516pXBNWeZ2ttc2
```

Executar rollback se:

- admin nao consegue logar;
- portaria nao abre;
- scan nao valida;
- webhooks deixam de retornar `401` quando sem segredo;
- build/typecheck falha;
- rotas criticas passam a retornar `500`.

## Alternativa Se Staging Demorar

Se o staging separado nao for criado agora, a Fase 2 deve permanecer somente na branch:

```text
hardening/http-only-token-phase-2
```

Nao promover ate existir uma janela controlada de producao com:

- backup/rollback pronto;
- responsavel acompanhando;
- teste admin real;
- teste portaria real;
- logs acompanhados em tempo real;
- possibilidade de rollback imediato para `dpl_6WphQxzUdwhVU516pXBNWeZ2ttc2`.

Essa alternativa e menos segura que staging e deve ser usada apenas se houver decisao operacional explicita.
