# Production Checklist

## Status

- Ponto 1 a Ponto 12 implementados e auditados com Supabase real.
- Ponto 13 adiciona a auditoria de fechamento `TEST_SYSTEM_CLOSURE`.
- Uso recomendado: operação real controlada, com pagamento real de baixo valor validado antes de abertura pública ampla.

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

Admins:

- todo `admin_users.status = active` precisa de `passphrase_hash` PBKDF2;
- não existe fallback por senha geral;
- Diretor/root sem hash individual não entra;
- `gate/support` não são roles válidas de admin.
- `admin_auth_attempts` deve existir para aplicar bloqueio por tentativa: 3 erros bloqueiam por 15 minutos; 5 erros sequenciais bloqueiam até liberação por Diretor.

## Webhooks E Cron

Checagens negativas de produção:

- `POST /api/webhook/zapi` sem segredo deve retornar `401`;
- `POST /api/webhook/payment/mercado-pago` sem assinatura deve retornar `401`;
- `POST /api/checkout/mercado-pago` sem `x-checkout-secret` deve retornar `401`;
- `GET` e `POST /api/cron/expire-reservations` sem bearer devem retornar `401`.

Cron:

- chamar `/api/cron/expire-reservations` com `Authorization: Bearer CRON_SECRET`;
- frequência recomendada: a cada minuto por agendador externo ou plano Vercel compatível.

## Segurança Operacional

- Não logar QR/base64, token puro, `qr_token_hash`, metadata de pagamento, senha ou secrets.
- Não expor telefone completo em relatórios/admin.
- Não executar scripts de auditoria com dados reais sem prefixo temporário.
- Rodar `node .tools/audit_system_closure.mjs` antes de mudanças grandes em produção.

## Pendências Futuras

- Pagamento real controlado de baixo valor.
- Cancelamento, troca e estorno.
- Reenvio manual de ingresso pago.
- Filtro de portaria por evento/sessão com `wrong_event`.
- Exportação de relatórios.
- QR/PDF visual sem persistir token puro.
