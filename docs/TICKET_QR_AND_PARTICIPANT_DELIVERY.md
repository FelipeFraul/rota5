# Funcionamento e instalacao: QR Code no ingresso e envio para acompanhante

Este documento explica como o sistema implementa dois recursos:

1. envio de ingressos por WhatsApp com QR Code e dados impressos na imagem do ingresso;
2. envio de ingresso para acompanhante, mantendo um ingresso reservado para o comprador.

A linguagem aqui e propositalmente tecnica e operacional para outro Codex conseguir reproduzir a arquitetura em outro sistema.

## Visao geral do fluxo

O sistema e um ticketing WhatsApp-first em Next.js. O pagamento e confirmado pelo webhook do Mercado Pago. Depois da confirmacao, a base emite ingressos na tabela `tickets` e o backend decide como entregar:

- pedido com 1 ingresso: envia automaticamente o ingresso ao WhatsApp do comprador;
- pedido com 2 ou mais ingressos: pergunta ao comprador se ele quer receber todos os QR Codes no proprio WhatsApp ou enviar os ingressos aos acompanhantes.

O QR Code nao guarda um token bruto persistido no banco. A imagem contem um QR que aponta para uma URL assinada:

```txt
{APP_BASE_URL}/tickets/{payloadBase64Url}.{assinaturaHmac}
```

O payload contem somente:

```json
{
  "tid": "ticket_id",
  "code": "ticket_code"
}
```

A assinatura e HMAC SHA-256 usando `TICKET_QR_SECRET`. A pagina publica `/tickets/[token]` valida a assinatura, busca o ingresso `issued` no banco e mostra apenas dados seguros do ingresso. A validacao de portaria e outro fluxo; essa pagina publica nao marca ingresso como usado.

## Dependencias instaladas

No `package.json`, os recursos dependem principalmente de:

- `qrcode`: gera o QR Code em PNG a partir da URL assinada do ingresso.
- `sharp`: redimensiona template, compoe QR Code e renderiza textos na imagem final.
- `@supabase/supabase-js`: acesso service-role ao banco.
- `server-only`: garante que os servicos de emissao/entrega rodam apenas no servidor.

Instalacao equivalente:

```bash
npm install qrcode sharp server-only @supabase/supabase-js
npm install -D @types/qrcode
```

## Variaveis de ambiente necessarias

O arquivo `src/lib/env.ts` valida as variaveis. Para estes recursos, as essenciais sao:

- `APP_BASE_URL`: base publica usada para montar `/tickets/{token}`.
- `TICKET_QR_SECRET`: segredo com pelo menos 32 caracteres para assinar tokens de ingresso.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: acesso administrativo ao banco.
- `ZAPI_BASE_URL`, `ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN`: envio de mensagens e imagens pelo WhatsApp/Z-API.
- `ZAPI_WEBHOOK_SECRET`: protecao do webhook de entrada da Z-API.
- `MERCADO_PAGO_WEBHOOK_SECRET`: protecao do webhook de pagamento.

Regra importante: `TICKET_QR_SECRET` precisa ser estavel. Se trocar esse segredo, links/QR Codes antigos param de validar.

## Assets usados na imagem do ingresso

O gerador usa estes arquivos em `public/`:

- `public/ticket_sistema.webp`: template base do ingresso.
- `public/fonts/BebasNeue-Regular.ttf`: fonte para evento e nome do titular.
- `public/fonts/Handjet-Regular.ttf`: fonte para local, data, codigo e mesa.

No outro sistema, copie esses assets ou adapte as coordenadas para um novo layout.

## Banco de dados

### Campos para acompanhante

A migration `supabase/migrations/20260724000400_add_ticket_participant_delivery_fields.sql` adiciona:

- `tickets.recipient_name text`: nome do acompanhante, opcional.
- `tickets.recipient_phone text`: telefone normalizado do acompanhante.
- `tickets.participant_delivery_status text`: `awaiting_participant_request` ou `delivered`.
- `tickets.participant_delivered_at timestamptz`: data/hora em que o QR foi enviado com sucesso ao acompanhante.
- indice parcial em `tickets(recipient_phone)` para consultas por telefone.

### Campo para QR entregue ao comprador

A migration `supabase/migrations/20260726000100_add_buyer_qr_delivered_at.sql` adiciona:

- `tickets.buyer_qr_delivered_at timestamptz`: primeira data/hora em que o QR do comprador foi enviado com sucesso.
- indices parciais em `buyer_qr_delivered_at` e `participant_delivered_at`.
- RPC `mark_buyer_ticket_qr_delivered(p_ticket_id, p_delivered_at)`.

A RPC preserva a primeira entrega conhecida usando `least(coalesce(...), p_delivered_at)`, entao reenviar o mesmo QR nao apaga o timestamp original.

### RPC de distribuicao para acompanhantes

A funcao final esta em `supabase/migrations/20260725000300_fix_assign_participant_contacts_nullif.sql`:

```sql
public.assign_participant_contacts_to_order_tickets(p_order_id uuid, p_contacts jsonb)
```

Ela:

- exige pedido pago (`orders.status = 'paid'`) e pagamento aprovado;
- trava o pedido e os ingressos com `for update`;
- busca todos os `tickets.status = 'issued'` do pedido;
- calcula `expected_contacts_count = tickets_count - 1`;
- reserva o primeiro ingresso, ordenado por `ticket_code`, para o comprador;
- vincula os demais ingressos aos contatos enviados;
- grava `recipient_name`, `recipient_phone` e `participant_delivery_status = 'awaiting_participant_request'`;
- e idempotente quando os mesmos contatos ja estao vinculados;
- rejeita quantidade incorreta, pedido sem ingresso, pedido nao pago ou tentativa de sobrescrever ingresso ja vinculado a outro contato.

Permissao recomendada: revogar `public`, `anon` e `authenticated`, e conceder apenas para `service_role`.

## Geracao do token assinado do ingresso

Arquivo principal: `src/lib/tickets/services/tickets.ts`.

Funcoes importantes:

- `createSignedTicketToken({ ticketId, ticketCode })`: cria payload JSON, codifica em base64url e assina com HMAC SHA-256.
- `verifySignedTicketToken(token)`: separa payload e assinatura, recalcula assinatura e compara com `timingSafeEqual`.
- `createTicketUrl(token)`: monta `APP_BASE_URL/tickets/{token}`.
- `getTicketBySignedToken(token)`: valida token, busca ingresso `issued` e retorna somente DTO publico.

O token assinado evita salvar QR/token bruto em texto puro no banco. O banco mantem `tickets.qr_token_hash` do fluxo antigo, mas a entrega atual usa a URL assinada deterministica.

## Geracao da imagem com QR Code e dados impressos

Arquivo principal: `src/lib/tickets/services/ticketQrImage.ts`.

Como funciona:

1. Recebe `ticketUrl`, `ticketCode`, `eventTitle`, `venueName`, `city`, `state`, `startsAt`, `holderName` e `tableMapPlaceCode`.
2. Gera um QR Code com `QRCode.toBuffer(ticketUrl, { type: "png", errorCorrectionLevel: "M", margin: 2, scale: 8 })`.
3. Redimensiona o QR para `430x430`.
4. Renderiza linhas de texto com `sharp({ text: ... })`, usando fontes locais.
5. Redimensiona o template para `969x1371`.
6. Compoe:
   - QR em `left: 270`, `top: 322`;
   - titulo do evento;
   - local;
   - cidade/UF;
   - data e hora;
   - nome do titular;
   - codigo do ingresso;
   - mesa/bistro, quando houver.
7. Retorna PNG com nome `ticket-{ticketCode}.png`.

Depois, `ticketQrImageToDataUrl(buffer)` transforma o PNG em `data:image/png;base64,...`, formato enviado para a Z-API.

Observacao para migracao: as coordenadas e tamanhos sao acoplados ao template `ticket_sistema.webp`. Se mudar a arte, recalibre `TICKET_WIDTH`, `TICKET_HEIGHT`, `QR_SIZE`, `QR_LEFT`, `QR_TOP` e posicoes dos textos.

## Entrega ao comprador

Arquivo principal: `src/lib/tickets/services/ticketDelivery.ts`.

### Payload de entrega

`buildTicketDeliveryPayload(tickets, title?)` cria:

- mensagem de resumo textual com evento, data, local, assento/ingresso, mesa e codigo;
- mensagem de instrucao: apresentar QR Code na portaria e nao enviar a terceiros;
- uma imagem QR por ingresso.

### Envio direto

`deliverTicketsForOrder(orderId)`:

1. busca o pedido e telefone do comprador;
2. busca ingressos emitidos com `getTicketsForOrder(orderId)`;
3. envia mensagem textual de resumo;
4. para cada ingresso, gera a imagem QR e envia pelo WhatsApp;
5. envia texto final de instrucao;
6. grava mensagens em `whatsapp_messages`;
7. controla idempotencia em `whatsapp_outbound_deliveries`;
8. marca `buyer_qr_delivered_at` quando a imagem foi enviada com sucesso.

As chaves de idempotencia usadas:

- texto do pedido: `paid-ticket-order:{orderId}:text:v1`;
- imagem de cada ingresso: `paid-ticket:{ticketId}:qr:v1`;
- instrucao final: `paid-ticket-order:{orderId}:qr-instruction:v1`.

Se a Z-API falhar depois de o pagamento estar confirmado, o sistema loga a falha e nao desfaz pagamento nem ingresso. O pagamento continua processado; reenvio pode ser feito pelo comando de reenvio.

## Decisao apos pagamento

Arquivo: `src/app/api/webhook/payment/mercado-pago/route.ts`.

Depois que o webhook valida assinatura, busca o pagamento real no Mercado Pago e chama `confirm_paid_ticket_order`, ele verifica o retorno:

- se `idempotent === true`, nao envia novamente;
- se `tickets_count <= 1`, chama `deliverTicketsForOrder(orderId)`;
- se `tickets_count > 1`, chama `requestTicketDeliveryPreferenceForOrder(orderId)`.

`requestTicketDeliveryPreferenceForOrder(orderId)` envia ao comprador:

```txt
*PAGAMENTO CONFIRMADO*

> Digite *1* para receber os QRCodes
> Digite *2* para enviá-los aos acompanhantes
```

Tambem salva o contexto da conversa:

```ts
state: "ticket_delivery_selecting",
ticketDelivery: {
  orderId,
  expectedContactsCount: tickets.length - 1,
  requestedAt,
  mode: "buyer_whatsapp"
}
```

## Fluxo de envio para acompanhante

Arquivos principais:

- `src/lib/tickets/router.ts`
- `src/lib/tickets/conversationState.ts`
- `src/lib/tickets/services/tickets.ts`
- `src/app/api/webhook/zapi/route.ts`

### Escolha do comprador

Quando o comprador responde `2`, o roteador entra em:

```ts
state: "ticket_delivery_contacts_waiting"
ticketDelivery.mode = "participant_contacts"
```

O sistema pede para ele enviar os contatos dos acompanhantes. A quantidade precisa ser exatamente `tickets_count - 1`, porque o primeiro ingresso fica reservado para o comprador.

### Leitura e validacao dos contatos

O webhook da Z-API identifica payloads de contato/vCard e passa o `rawPayload` para o roteador. O roteador extrai candidatos de:

- `payload.contactArray`
- `payload.contacts`
- `payload.contact`
- `payload.message.contactArray`
- `payload.message.contacts`
- `payload.message.contact`
- vCard com linhas `TEL`

Depois normaliza telefones com `normalizeWhatsAppPhone`.

Regras:

- contato sem telefone e rejeitado;
- contato com mais de um telefone e rejeitado;
- telefones duplicados sao rejeitados;
- quantidade menor que esperada permite acumular contatos em `pendingContacts`;
- quantidade maior que esperada e rejeitada;
- quantidade exata vai para confirmacao.

Estado de confirmacao:

```ts
state: "ticket_delivery_contacts_validated"
ticketDelivery.validatedContacts = [...]
```

O comprador precisa responder `CONFIRMAR`. Se responder `CANCELAR`, volta para coleta de contatos.

### Vinculo no banco

Ao confirmar, o roteador chama:

```ts
assignParticipantContactsToOrderTickets({
  orderId,
  contacts: validatedContacts
})
```

Essa funcao chama a RPC `assign_participant_contacts_to_order_tickets`.

Resultado esperado:

- primeiro ingresso do pedido continua sem `recipient_phone` e sem `participant_delivery_status`, reservado ao comprador;
- cada ingresso restante recebe `recipient_phone`, `recipient_name` e `participant_delivery_status = 'awaiting_participant_request'`.

### Entrega do ingresso reservado ao comprador

Depois de vincular acompanhantes, o sistema busca:

```ts
getBuyerReservedTicketsForOrder(orderId)
```

Essa consulta exige `recipient_name is null`, `recipient_phone is null` e `participant_delivery_status is null`. Deve retornar exatamente 1 ingresso. Esse ingresso e enviado ao comprador com titulo `*INGRESSO RESERVADO*`.

Em seguida, o comprador recebe a instrucao para encaminhar aos acompanhantes:

```txt
*Envie essa mensagem para seu(s) acompanhante(s).*
Para que os acompanhantes recebam seus ingressos, basta *enviar uma mensagem com o texto MEU INGRESSO* para nosso telefone, 15 99642-6671.
```

Importante: o comprador nao recebe os QR Codes dos acompanhantes nesse modo. Ele so cadastra os telefones e recebe o proprio QR.

### Acompanhante solicita o proprio ingresso

Quando o acompanhante manda `MEU INGRESSO`, o roteador chama:

```ts
listParticipantTicketDeliveriesForPhone(normalizedPhone)
```

Essa consulta busca tickets:

- com `recipient_phone = telefone do WhatsApp`;
- `status = 'issued'`;
- pedido `paid`;
- pagamento `approved`;
- evento/sessao ainda visivel para acesso;
- `participant_delivery_status in ('awaiting_participant_request', 'delivered')`.

Se houver 1 ingresso, envia direto. Se houver mais de 1, agrupa por evento/sessao e pede para escolher qual receber ou todos.

Ao gerar o payload do acompanhante, o sistema usa o nome do proprio WhatsApp do acompanhante quando disponivel; se nao houver, usa `recipient_name`; se nenhum existir, usa `Participante`.

### Marcacao de entregue ao acompanhante

O roteador retorna mensagens de imagem com:

```ts
participantDeliveryTicketId: ticket.ticketId
```

O webhook de entrada da Z-API, ao enviar essa imagem com sucesso, chama:

```ts
markParticipantTicketDelivered(ticketId)
```

Essa funcao atualiza o ticket somente se:

- `status = 'issued'`;
- `participant_delivery_status = 'awaiting_participant_request'`;
- `participant_delivered_at is null`.

Se o envio falhar, o status permanece `awaiting_participant_request`, permitindo retry quando o acompanhante pedir de novo.

## Reenvio de ingressos

O menu publico tem comando `AGAIN` para comprador reenviar ingressos pagos. O fluxo usa:

- `listPaidTicketResendGroupsForPhone(phone)`
- `buildPaidTicketResendResult(...)`
- `buildTicketDeliveryPayload(...)`

Quando existe mais de um evento/sessao, o sistema pede selecao. Quando existe apenas um ingresso/grupo, envia direto. O reenvio de imagem para comprador tambem pode marcar `buyer_qr_delivered_at`, preservando a primeira data.

## Z-API: envio de imagem

Arquivo: `src/lib/zapi/client.ts`.

`sendZapiImage({ phone, image, caption })` faz POST para:

```txt
{ZAPI_BASE_URL}/instances/{ZAPI_INSTANCE_ID}/token/{ZAPI_INSTANCE_TOKEN}/send-image
```

Body:

```json
{
  "phone": "5515999999999",
  "image": "data:image/png;base64,...",
  "viewOnce": false
}
```

O caption fica vazio para evitar texto duplicado na imagem. O resumo e as instrucoes seguem como mensagens separadas.

## Pagina publica do ingresso

Arquivo: `src/app/tickets/[token]/page.tsx`.

Ela:

1. recebe `token` da URL;
2. chama `getTicketBySignedToken(token)`;
3. se invalido, mostra pagina neutra de ingresso invalido;
4. se valido, mostra evento, local, setor, assento e codigo.

Ela nao substitui a validacao de portaria. A portaria deve escanear o mesmo QR/link e chamar seu proprio endpoint/RPC de validacao para marcar uso.

## Checklist para instalar em outro sistema

1. Adicionar dependencias `qrcode`, `sharp`, `server-only` e tipos de `qrcode`.
2. Criar/copiar template do ingresso e fontes em `public/`.
3. Criar variavel `TICKET_QR_SECRET` forte e permanente.
4. Implementar assinatura HMAC de token com payload minimo `{ tid, code }`.
5. Criar rota publica `/tickets/[token]` que valida token e retorna apenas dados publicos.
6. Implementar gerador de imagem com `qrcode` + `sharp`.
7. Garantir que a tabela de ingressos tenha `ticket_code`, `status`, `order_id`, `customer_id`, `session_id`, `section_id`, `seat_id` e relacoes para evento/local/assento.
8. Aplicar campos de acompanhante: `recipient_name`, `recipient_phone`, `participant_delivery_status`, `participant_delivered_at`.
9. Aplicar campo `buyer_qr_delivered_at`.
10. Criar RPC transacional para vincular contatos aos ingressos, reservando 1 ingresso para o comprador.
11. Criar servico de entrega que envia texto, imagem de cada QR e instrucao final com idempotencia.
12. No webhook de pagamento, apos emissao dos ingressos, decidir entre envio direto e escolha de distribuicao.
13. No roteador WhatsApp, criar estados `ticket_delivery_selecting`, `ticket_delivery_contacts_waiting`, `ticket_delivery_contacts_validated` e `participant_ticket_selecting`.
14. No webhook WhatsApp, detectar payload de contatos/vCard e passar o payload bruto ao roteador.
15. Ao enviar QR de acompanhante com sucesso, marcar `participant_delivery_status = 'delivered'`.
16. Ao enviar QR do comprador com sucesso, marcar `buyer_qr_delivered_at`.
17. Criar testes para idempotencia, quantidade errada de contatos, telefone duplicado, falha de Z-API e reenvio.

## Testes existentes neste projeto

O principal teste de regressao e:

```bash
npm test -- scripts/test-ticket-delivery-distribution.mjs
```

O script cobre o desenho do fluxo de distribuicao, estados do roteador, parsing de contatos, preservacao do ingresso do comprador, marcacao de entregue para acompanhante, retry quando falha e integracao com ofertas de combo que dependem de QR entregue.

No `package.json`, o `npm test` completo tambem inclui testes de idempotencia de entrega paga e regressao de WhatsApp.

## Arquivos de referencia rapida

- `src/lib/tickets/services/ticketQrImage.ts`: montagem da imagem final do ingresso.
- `src/lib/tickets/services/ticketDelivery.ts`: envio ao comprador e criacao de payloads.
- `src/lib/tickets/services/tickets.ts`: tokens assinados, consultas de ingressos, RPC de acompanhantes e marcacoes de entrega.
- `src/lib/tickets/router.ts`: maquina de estados WhatsApp para comprador e acompanhante.
- `src/app/api/webhook/payment/mercado-pago/route.ts`: decisao pos-pagamento.
- `src/app/api/webhook/zapi/route.ts`: envio/persistencia de respostas e marcacao de entrega apos sucesso.
- `src/app/tickets/[token]/page.tsx`: visualizacao publica segura do ingresso.
- `supabase/migrations/20260724000400_add_ticket_participant_delivery_fields.sql`: campos iniciais de acompanhante.
- `supabase/migrations/20260725000100_reserve_buyer_ticket_in_participant_distribution.sql`: regra que reserva 1 ingresso ao comprador.
- `supabase/migrations/20260725000300_fix_assign_participant_contacts_nullif.sql`: versao hardened da RPC.
- `supabase/migrations/20260726000100_add_buyer_qr_delivered_at.sql`: timestamp de QR entregue ao comprador.

## Cuidados importantes

- Nao persistir token bruto do QR Code. Persistir somente dados do ticket e usar assinatura HMAC deterministica.
- Comparar assinatura com `timingSafeEqual`.
- Manter `TICKET_QR_SECRET` fora do frontend.
- Nao entregar QR de acompanhante ao comprador quando ele escolheu distribuicao por acompanhantes.
- Fazer a vinculacao de contatos em transacao no banco, com lock, para evitar corrida.
- Nao marcar acompanhante como `delivered` antes de a imagem ser enviada com sucesso.
- Em falha de envio WhatsApp, nao desfazer pagamento nem ingresso; manter estado para retry.
- Recalibrar coordenadas da imagem sempre que mudar o template visual.
