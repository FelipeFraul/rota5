> **Current Baseline 2.6.2 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over unchanged functional Baseline 2.6.0/source `0a10618648fc3f873afffd8f60e60bd0396b62e7` and documentary Baseline 2.6.1. This surgical patch corrects only the NEXT-ACTIONS priority placement and stale current Node evidence. Fingerprint remains `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`; counts remain 390 source files, 87 migrations, 45 tables, 57 SQL functions, 1 sequence, 57 tests and 46 findings. Lifecycle, release blockers (0), health, database and deployment are unchanged.

# Capabilities órfãs, inacessíveis e caminhos bloqueados

Fonte: [capabilities.json](../../system-knowledge/capabilities.json). Órfã significa implementação funcional aparente sem consumidor atual confirmado no escopo versionado `src`, `scripts`, `.tools` e migrations. Ausência de chamada local não prova ausência absoluta de consumidor externo.

## Quatro capabilities órfãs

### ticket.validation_history

Serviço consulta eventos de validação, mas nenhum consumidor executável foi encontrado.

ÓRFÃ: listAdminTicketValidations só possui definição em src; busca inclui scripts/.tools. O leitor de portaria possui resumo por outro caminho, não consome esta consulta detalhada. Auditoria antiga não comprova chamada atual ao serviço.

Evidência: [src/lib/tickets/services/adminTickets.ts:533](../../src/lib/tickets/services/adminTickets.ts#L533). Módulos: `admin.ticket-operations`. Entrypoints confirmados: nenhum. Testes: —.

### gate.session_revoke

Implementação de revogação direta por ID sem consumidor atual; revogação por acesso é outro caminho funcional.

ÓRFÃ: nenhuma chamada a revokeGateSession localizada em src/scripts/.tools. Pausar gate_accesses ou revogar fixed_gate_accesses só altera esses registros; validateGateSessionToken não consulta o acesso de origem. Não se presume invalidação automática de links já emitidos.

Evidência: [src/lib/tickets/services/gateSessions.ts:488](../../src/lib/tickets/services/gateSessions.ts#L488). Módulos: `gate.access-session`. Entrypoints confirmados: nenhum. Testes: —.

### courtesy.event_limit

Upsert de limite por evento sem caminho atual de configuração; leitura é consumida na emissão.

ÓRFÃ: setCourtesyLimit não tem chamador; getCourtesyLimit é usado pela emissão. Testes/auditorias podem semear tabela, o que não torna acessível a configuração pelo produto.

Evidência: [src/lib/tickets/services/adminCourtesies.ts:1196](../../src/lib/tickets/services/adminCourtesies.ts#L1196). Módulos: `courtesy.service`. Entrypoints confirmados: nenhum. Testes: —.

### gate.sessions_list

Listar sessões por evento, finalidade e estado; nenhum consumidor atual do serviço foi localizado.

ÓRFÃ: função listGateSessions sem chamador atual. Não confundir com listGateAccesses/listFixedGateAccesses, que possuem diálogo administrativo.

Evidência: [src/lib/tickets/services/gateSessions.ts:510](../../src/lib/tickets/services/gateSessions.ts#L510). Módulos: `gate.access-session`. Entrypoints confirmados: nenhum. Testes: —.

## Uma capability quebrada

PARCIAL: o caminho local alcança a RPC após escolha confirmada e preparo; nenhum teste mutante remoto foi executado.

O predicado que permite consumir um combo válido exige `paid`, `issued` e escopo correto. O primeiro ramo com esse predicado retorna uma solicitação de escolha, uma confirmação de escolha já feita ou uma recusa por falta de mesa/telefone. Assim, os ramos posteriores de preparo e a RPC de consumo ficam inacessíveis para esse mesmo caso válido. Não se concluiu que a RPC isolada esteja quebrada; o bloqueio pertence ao leitor atual.

## Nove capabilities parciais

| Capability | Limitação |
| --- | --- |
| messaging.help | Dois casos de busca/seleção falham na execução local. Estrutura de retorno existe; assertivas com texto esperado não comprovam falha de toda busca. |
| event.create | O modal web compila. A capability permanece PARCIAL porque falhas intermediárias da criação multi-entidade não são uma transação única. |
| event.price_edit | API aceita label e o diálogo chama updateAdminPrice, mas o contrato do campo web Nome no ingresso falha. Não se assume que a superfície visual ofereça toda a edição. |
| courtesy.section_limit | API PATCH existe e grava limites, mas aba courtesy do EventEditorModal é ocultada por constante false; consumidor humano visual não confirmado. |
| courtesy.public_issue | O router chama emissão zero-value e a RPC existe. A apresentação filtra ticket_type free e desliga cortesias; apenas zero-value de outro tipo ou contexto persistido pode alcançar o ramo. Nenhum dado remoto foi consultado. |
| combo.delivery_prompt | Fluxo válido exige official_table_map_reservations.status=paid e propriedade do mesmo destinatário; ofertas atuais podem ser geradas a ingressos individuais e participantes sem mesa. Resultado negado nesses casos (comboRedemptions.ts:1049–1074). |
| combo.delivery_choose | Confirmação é implementada para cliente com reserva oficial paga; depender do prompt e de mesa limita disponibilidade no modo individual atual. |
| table_map.calibrate | API PUT e calibrador implementados; EventEditorModal bloqueia/oculta a aba tableMap com flag false. |
| table_map.reserve | A seleção normal é pulada em router.ts:18562 quando ROTA5_PRESENTATION_TABLE_MAP_ENABLED=false. Estados persistidos antigos podem alcançar o serviço; isso não comprova entrada normal disponível. |

## Componentes sem consumidor que não viraram novos IDs

| Componente | Decisão |
| --- | --- |
| createMercadoPagoPreference | Adapter para criar preferência hospedada sem consumidor; não há orquestração de pedido/checkout hospedado atual comprovada. Componente órfão, não capability adicional por ser wrapper de integração. |
| appendInboundMessageToBatch | Agregação técnica sem consumidor atual. Cron cancela lotes; não há capability de responder por batch comprovada. |
| createGateSessionForRegisteredValidator | Rotação alternativa de sessão sem consumidor; mesma finalidade de gate.open, não novo ID. |
| buildSeatMapImageDataUrl | Renderizador alternativo sem consumidor; catalog.seat_map utiliza PNG, não nova capability. |
| seat_map_renders | Tabela, trigger e variável de bucket sem consumidor de storage encontrado; não catalogar upload/armazenamento de mapas por migração apenas. |
| enforce_one_active_reservation_per_customer | Função RETURNS trigger sem instalação por CREATE TRIGGER nas migrations locais; invariantes ativas são chamadas por RPCs. |

## Revogação de credencial versus sessão

`gate.access_pause` e `gate.fixed_revoke` alteram apenas suas credenciais. Não revogam sessões emitidas, e `validateGateSessionToken` não consulta o acesso de origem. A revogação direta por ID está implementada em `gate.session_revoke`, porém é órfã. Esse resultado foi comprovado por leitura de `gateAccesses.ts:198`, `fixedGateAccesses.ts:115` e `gateSessions.ts:282`, sem operação real de revogação.

## Marcas e legado

As três operações Black House possuem comandos utilizáveis com `--apply`, portanto não são órfãs somente pela marca antiga. Foram catalogadas como OPERATIONAL e POSSÍVEL_LEGADO. Datas, IDs de dados e compatibilidade remota não foram testados. Assets RockBar ausentes e BrandLogo sem importador são componentes de apresentação, não capacidades independentes.
