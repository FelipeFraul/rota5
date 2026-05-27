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
- Rate limits do app devem responder `429` sem salvar IP puro, payload, telefone completo, token ou base64.
- Vercel Firewall deve manter a regra publicada `Rate limit - Sensitive public routes`: OR nas rotas sensíveis, incluindo `/admin/login/*` e `/api/admin/login/verify`, Fixed Window de 60 segundos, 120 requests, chave IP Address e ação `429`.
- Não executar scripts de auditoria com dados reais sem prefixo temporário.
- Rodar `node .tools/audit_system_closure.mjs` antes de mudanças grandes em produção.

## Pendências Futuras

- Cancelamento, troca e estorno.
- Reenvio manual de ingresso pago.
- Filtro de portaria por evento/sessão com `wrong_event`.
- Exportação de relatórios.
- QR/PDF visual sem persistir token puro.
