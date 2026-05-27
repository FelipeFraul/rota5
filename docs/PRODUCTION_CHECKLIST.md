# Production Checklist

## Status

- Ponto 1 a Ponto 12 implementados e auditados com Supabase real.
- Ponto 13 adiciona a auditoria de fechamento `TEST_SYSTEM_CLOSURE`.
- Em 26/05/2026, uma compra real/controlada validou o ciclo completo: busca do evento, reserva, checkout Mercado Pago, pagamento concluído, webhook processado, pedido/reserva confirmados, ticket emitido e QRCode enviado ao comprador.
- Uso recomendado: operação real controlada com público real, acompanhando logs, webhooks, pagamentos e entregas de QRCode nas primeiras vendas.

## Envs

Somente `.env.example` deve ser versionado. `.env`, `.env.local`, `.env.production` e `.vercel` não devem entrar no Git.

Secrets obrigatórios ficam sem prefixo público:

- `SUPABASE_SERVICE_ROLE_KEY`;
- `ZAPI_INSTANCE_TOKEN`;
- `ZAPI_CLIENT_TOKEN`;
- `ZAPI_WEBHOOK_SECRET`;
- `CHECKOUT_INTERNAL_SECRET`;
- `CRON_SECRET`;
- `MERCADO_PAGO_ACCESS_TOKEN`;
- `MERCADO_PAGO_WEBHOOK_SECRET`;
- `TICKET_QR_SECRET`;
- `GATE_ADMIN_SECRET`;
- `GATE_SESSION_SECRET`.

Única chave pública esperada:

- `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY`.

## Banco

Confirmar migrations aplicadas:

- schema base de tickets;
- `reserve_seats`;
- `expire_reservations`;
- `confirm_paid_ticket_order`;
- `validate_ticket_entry`;
- `cancel_pending_reservation`;
- `gate_accesses`;
- `issue_courtesy_order`;
- `admin_users_active_requires_passphrase_hash`.
- `admin_login_challenges`.

Admins:

- todo `admin_users.status = active` precisa de `passphrase_hash` PBKDF2;
- não existe fallback por senha geral;
- Diretor/root sem hash individual não entra;
- `gate/support` não são roles válidas de admin.
- `admin_auth_attempts` deve existir para aplicar bloqueio por tentativa: 3 erros bloqueiam por 15 minutos; 5 erros sequenciais bloqueiam até liberação por Diretor.
- `admin_login_challenges` deve existir para login tokenizado: link único temporário, senha individual no web login e código único retornado pelo WhatsApp. A tabela guarda apenas hashes de token, código e origem.
- `rate_limit_events` e `consume_rate_limit` devem existir para aplicar rate limit por rota e origem hashada.
- `buyer_risk_events` deve existir para antifraude leve de reserva/checkout. A tabela guarda telefone e origem apenas como SHA-256 e não salva payload, checkout URL, token, QR, base64 ou metadata de pagamento.

## Webhooks E Cron

Checagens negativas de produção:

- `POST /api/webhook/zapi` sem segredo deve retornar `401`;
- `POST /api/webhook/payment/mercado-pago` sem assinatura deve retornar `401`;
- `POST /api/checkout/mercado-pago` sem `x-checkout-secret` deve retornar `401`;
- `GET` e `POST /api/cron/expire-reservations` sem bearer devem retornar `401`.

Cron:

- chamar `/api/cron/expire-reservations` com `Authorization: Bearer CRON_SECRET`;
- frequência recomendada: a cada minuto por agendador externo ou plano Vercel compatível.

## Validação Operacional Real

Validação realizada em 26/05/2026 com compra real/controlada.

Fluxo validado:

- comprador encontrou o evento;
- reserva foi criada;
- checkout Mercado Pago foi gerado;
- pagamento foi concluído;
- webhook Mercado Pago processou;
- pedido e reserva foram confirmados;
- ticket foi emitido;
- QRCode foi enviado ao comprador;
- compra finalizou corretamente.

## Segurança Operacional

- Não logar QR/base64, token puro, `qr_token_hash`, metadata de pagamento, senha ou secrets.
- Não expor telefone completo em relatórios/admin.
- Headers globais de segurança devem estar presentes em páginas e APIs: `Content-Security-Policy`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff` e `X-Frame-Options: DENY`.
- CSP esperada: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com; connect-src 'self' https:; media-src 'self' data: blob:; worker-src 'self' blob:; manifest-src 'self'`.
- `frame-ancestors 'none'` substitui/fortalece a proteção de frame do `X-Frame-Options`; `X-Frame-Options: DENY` também deve permanecer por compatibilidade.
- `img-src data:` é obrigatório para QRCode/mapas base64. `script-src` mantém `'unsafe-inline'`/`'unsafe-eval'` por compatibilidade com Next/Vercel e libera `https://sdk.mercadopago.com` para o checkout Mercado Pago.
- Não deve existir `Access-Control-Allow-Origin: *` em páginas, assets, `robots.txt` ou `sitemap.xml`. Como a Vercel pode adicionar wildcard em respostas estáticas/cacheadas, `next.config.ts` deve sobrescrever com `Access-Control-Allow-Origin: https://site-phi-seven-72.vercel.app`.
- Webhooks Z-API/Mercado Pago são server-to-server e não precisam de CORS. Checkout, portaria e admin login usam chamadas browser same-origin. Nenhuma rota deve combinar `Access-Control-Allow-Credentials: true` com wildcard.
- Rate limits do app devem responder `429` sem salvar IP puro, payload, telefone completo, token ou base64.
- Antifraude de comprador deve manter limites conservadores: uma reserva ativa por telefone, até 5 reservas criadas por telefone em 15 minutos, até 5 reservas expiradas/canceladas em 30 minutos, até 5 solicitações de checkout por order/reserva em 10 minutos, e limites por origem hashada. Bloqueios retornam mensagem segura sem mencionar fraude.
- Vercel Firewall deve manter a regra publicada `Rate limit - Sensitive public routes`: OR nas rotas sensíveis, incluindo `/admin/login/*` e `/api/admin/login/verify`, Fixed Window de 60 segundos, 120 requests, chave IP Address e ação `429`.
- Webhook Mercado Pago deve manter `401` sem assinatura, buscar o pagamento real na API, emitir ticket somente para `approved`, marcar falhas definitivas como ignoradas/processadas sem ticket e manter falhas transitórias sem `processed_at` para retry.
- Portaria deve recusar `wrong_event` e `wrong_session` sem marcar ingresso como usado. `ticket_validation_events` deve registrar `gate_session_id` e resultado sem token/QR bruto.
- Páginas/APIs públicas devem usar DTO mínimo. Não retornar objeto cru do banco nem expor ids internos, hashes, metadata, headers, payload bruto, stack trace ou erro SQL.
- Não executar scripts de auditoria com dados reais sem prefixo temporário.
- Rodar `node .tools/audit_system_closure.mjs` antes de mudanças grandes em produção.
- Após deploy de headers em 27/05/2026, o MDN HTTP Observatory retornou B+ / 80, com 9 de 10 testes passados, scan `97301039` em `2026-05-27T13:06:10.645Z`. O scan anterior estava C / 50 por ausência de CSP, Referrer-Policy, X-Content-Type-Options e proteção de framing. SecurityHeaders.com não foi automatizado no terminal porque a página pública retornou desafio Cloudflare e a API pública exige autorização.

## Pendências Futuras

- Cancelamento, troca e estorno.
- Reenvio manual de ingresso pago.
- Exportação de relatórios.
- QR/PDF visual sem persistir token puro.
