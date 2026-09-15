> **Current Baseline 2.7.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

# Broken, Orphan and Partial Flows — Etapa 4

## Flows quebrados

Nenhum flow permanece classificado como QUEBRADO.

### Reclassificados após estabilização

`admin.web_event_workspace` passou de QUEBRADO para PARCIAL: o JSX foi corrigido e typecheck/lint/build passam. Permanecem criação multi-entidade parcial e testes source-contract falhos independentes.

### `kitchen.combo_redemption` — agora PARCIAL

- **Objetivo:** consumir resgate de combo preparado.
- **Correção:** a guarda retorna somente sem `delivery_choice_confirmed_at`; resgates confirmados e prontos alcançam `validate_combo_redemption`.
- **Capability:** `combo.redeem` (PARCIAL).
- **Limite:** testes locais cobrem a transição e replay; a equivalência remota não foi validada.
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
