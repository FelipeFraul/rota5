# Vercel Firewall e Rate Limit

Este projeto aplica rate limit no app para rotas públicas e sensíveis. A camada no app usa Supabase para contar janelas curtas por rota e origem, armazenando somente hash SHA-256 da origem. Não salva IP puro, payload, telefone, token, QR, base64 ou metadata sensível.

## Limites No App

- `POST /api/webhook/zapi`: 60 requisições por minuto por origem, depois da validação do segredo.
- `POST /api/webhook/payment/mercado-pago`: 120 requisições por minuto por origem, depois da validação de assinatura.
- `POST /api/checkout/mercado-pago`: 20 requisições por minuto por origem, depois do `x-checkout-secret`.
- `POST /api/checkout/mercado-pago/pay`: 20 requisições por minuto por origem.
- `POST /api/gate/session/scan`: 120 requisições por minuto por origem + sessão de portaria em hash.
- `POST /api/gate/session/validate`: 60 requisições por minuto por origem.
- `GET /tickets/*`: 60 requisições por minuto por origem.
- `GET /gate/session/*`: 60 requisições por minuto por origem + sessão de portaria em hash.
- `GET` e `POST /api/cron/expire-reservations`: 10 requisições por minuto por origem, depois do bearer.

Quando o limite é excedido, a resposta é `429 Too Many Requests` com header `Retry-After`.

## Regras Recomendadas No Vercel Firewall

Configurar pelo painel da Vercel:

1. Criar regra de rate limit por IP para `/tickets/*` e `/gate/session/*`, com limite inicial de 60 requisições por minuto.
2. Criar regra de rate limit por IP para `/api/gate/session/scan`, com limite inicial de 120 requisições por minuto.
3. Criar regra de rate limit por IP para `/api/checkout/mercado-pago*`, com limite inicial de 20 requisições por minuto.
4. Criar regra de monitoramento para picos em `/api/webhook/zapi` e `/api/webhook/payment/mercado-pago`, evitando bloqueios agressivos que possam afetar retries legítimos.
5. Ativar alertas de tráfego anormal para todas as rotas `/api/*`.

## Cuidados

- Não bloquear Mercado Pago por lista rígida de IP sem confirmar a documentação operacional vigente.
- Não bloquear Z-API por lista rígida de IP sem confirmar a origem real dos webhooks.
- Manter os testes negativos de produção: webhooks, checkout e cron sem segredo devem responder `401`, não `404`.
- Não fazer teste de flood em produção; testar excesso apenas localmente ou com dados controlados.
