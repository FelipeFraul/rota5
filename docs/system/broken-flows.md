# Broken, Orphan and Partial Flows — Etapa 4

## Flows quebrados

### `admin.web_event_workspace`

- **Objetivo:** operar eventos, combos e dashboards pela página administrativa.
- **Quebra:** `src/app/admin/eventos/event-editor/CreateEventModal.tsx` contém JSX incompleto; lint, typecheck e build falham antes de disponibilizar o workspace atual.
- **Capabilities afetadas:** `admin.authorize`, `event.list`, `event.inspect`, `event.create`, `event.edit`, `event.publish`, `event.change_status`, `event.cancel`, `event.duplicate`, `combo.list`, `analytics.general_dashboard`, `analytics.event_dashboard`, `analytics.contacts`
- **Consequência:** journey da página não pode ser apresentado como funcional; APIs continuam estruturalmente existentes.
- **Evidência:** baseline de testes/build e `system-knowledge/capabilities.json`.

### `kitchen.combo_redemption`

- **Objetivo:** consumir resgate de combo preparado.
- **Quebra:** `validateComboRedemptionScan`, em `comboRedemptions.ts:1035–1231`, retorna para todo caso paid + issued no escopo antes de `validate_combo_redemption` em :1462.
- **Capability:** `combo.redeem` (QUEBRADA).
- **Consequência:** resposta allowed/solicitação de entrega pode ocorrer sem transição issued → used.
- **Evidência:** `src/lib/tickets/services/comboRedemptions.ts:935`, `src/app/api/kitchen/session/scan/route.ts:67` e migration da RPC.

## Flows parciais

| Flow | Razão exata |
| --- | --- |
| `whatsapp.public_discovery` | Ajuda está PARCIAL e possui teste falhando; comandos são validados no router, não por documentação histórica. |
| `ticket.purchase` | Cliente seleciona evento/sessão/setor/tipo/assento conforme disponibilidade. Reserva ativa pode ser retomada ou cancelada. Mapa oficial é branch parcial; reserva comum permanece estruturalmente presente. |
| `courtesy.public` | Evento/preço invisível ou inelegível nega emissão. RPC cria pedido pago e ticket sem pagamento externo. |
| `combo.delivery_choice` | Resposta OK/1 usa reserva de mesa válida; outras respostas permanecem no contexto. Ausência de reserva/estado esperado impede conclusão. |
| `admin.whatsapp_event_management` | Criação começa em draft e pode publicar. Edição percorre estados conversacionais e valida cada entidade. Preço tem evidência parcial e falhas intermediárias podem deixar draft/resíduos. |
| `admin.courtesy_management` | Emissão usa RPC transacional e produz pedido/ticket pagos. Cancelamento invalida ticket/cortesia; reenvio reutiliza entrega. Limite por setor via workspace web é parcial. |
| `table_map.calibration` | GET renderiza/lê; POST valida e persiste coordenadas. Assets/estado visual e execução browser não foram integralmente validados. |

O status PARCIAL diferencia elos internos não integralmente comprovados de integrações apenas não executadas. Flows estruturalmente completos com serviço externo não acionado permanecem CONFIRMADO e carregam essa limitação nas notas.

## Órfãos

Nenhum flow ativo foi classificado como ÓRFÃO. As quatro implementações órfãs da Etapa 3 permanecem capabilities standalone, pois não possuem trigger/caller comprovado:

- `ticket.validation_history`: Implementação catalogada sem trigger/caller confirmado; não forma flow ativo.
- `gate.session_revoke`: Implementação catalogada sem trigger/caller confirmado; não forma flow ativo.
- `courtesy.event_limit`: Implementação catalogada sem trigger/caller confirmado; não forma flow ativo.
- `gate.sessions_list`: Implementação catalogada sem trigger/caller confirmado; não forma flow ativo.

Nenhum defeito ou implementação foi corrigido nesta etapa.
