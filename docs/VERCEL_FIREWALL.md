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

## Regra Publicada No Vercel Firewall

No plano atual, foi publicada uma regra única porque o limite gratuito não permite manter múltiplas regras separadas.

Nome da regra:

```text
Rate limit - Sensitive public routes
```

Condições em OR publicadas:

- `/api/webhook/zapi`;
- `/api/webhook/payment/mercado-pago`;
- `/api/checkout/mercado-pago*`;
- `/api/gate/session/scan`;
- `/api/gate/session/validate`;
- `/api/admin/login/verify`;
- `/admin/login/*`;
- `/tickets/*`;
- `/gate/session/*`;
- `/api/cron/expire-reservations`.

Configuração:

- Rate limit: Fixed Window;
- Janela: 60 segundos;
- Limite: 120 requests;
- Chave: IP Address;
- Ação: Too Many Requests (`429`).

Essa regra de borda complementa o rate limit no app. O app continua com limites mais específicos por rota e, em alguns casos, por escopo hashado.

As rotas `/admin/login/*` e `/api/admin/login/verify` protegem o login tokenizado de administradores e já fazem parte da regra publicada. No app, ambas também têm rate limit por origem e token hashado.

## Cuidados

- Não bloquear Mercado Pago por lista rígida de IP sem confirmar a documentação operacional vigente.
- Não bloquear Z-API por lista rígida de IP sem confirmar a origem real dos webhooks.
- Manter os testes negativos de produção: webhooks, checkout e cron sem segredo devem responder `401`, não `404`.
- Não fazer teste de flood em produção; testar excesso apenas localmente ou com dados controlados.
