# Broken, Orphan and Partial Flows — Etapa 4

## Flows quebrados

### Reclassificado após estabilização

`admin.web_event_workspace` passou de QUEBRADO para PARCIAL: o JSX foi corrigido e typecheck/lint/build passam. Permanecem criação multi-entidade parcial e testes source-contract falhos independentes.

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
| `admin.web_event_workspace` | O workspace compila; criação multi-entidade e testes source-contract mantêm a jornada parcial. |

O status PARCIAL diferencia elos internos não integralmente comprovados de integrações apenas não executadas. Flows estruturalmente completos com serviço externo não acionado permanecem CONFIRMADO e carregam essa limitação nas notas.

## Órfãos

Nenhum flow ativo foi classificado como ÓRFÃO. As quatro implementações órfãs da Etapa 3 permanecem capabilities standalone, pois não possuem trigger/caller comprovado:

- `ticket.validation_history`: Implementação catalogada sem trigger/caller confirmado; não forma flow ativo.
- `gate.session_revoke`: Implementação catalogada sem trigger/caller confirmado; não forma flow ativo.
- `courtesy.event_limit`: Implementação catalogada sem trigger/caller confirmado; não forma flow ativo.
- `gate.sessions_list`: Implementação catalogada sem trigger/caller confirmado; não forma flow ativo.

Nenhum defeito ou implementação foi corrigido nesta etapa.
