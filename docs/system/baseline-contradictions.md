> **Current Baseline 2.8.0 (2026-09-16):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c48405e41df3d1cd69eb3d383b7c6dd17257155e`. Fingerprint `ef5d175d8edf5c867131ac4e65f80555e0e5839640595b486ee79c9b99885f91`; 394 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 59 test files and 47 findings. `risk.rate-limit-fails-open` is RESOLVED with explicit outage policy across 19 boundaries. Release blockers: 0; Product and Infrastructure remain DEGRADED.

# Contradições da baseline — Etapa 7

Foram encontradas **2 contradições materiais**, ambas corrigidas e registradas sem ocultar a métrica anterior. Não há contradição material pendente.

| ID | Antes | Depois | Evidência | Estado |
| --- | --- | --- | --- | --- |
| `contradiction.readme-stage5-gate` | README continha gates concorrentes PARTIAL e PASS para a Etapa 5 e índice desatualizado. | Mantido o gate final PASS e índice atualizado até a Etapa 7. | Gate final da Etapa 5 e artefatos da Etapa 6. | CORRECTED |
| `contradiction.default-suite-current-result` | Snapshot histórico então corrente dizia 204/210, 6 falhas, 5 arquivos. | A correção histórica registrou 203/210, 7 falhas, 6 arquivos; ambos os valores são históricos, e a suíte corrente está no banner canônico. | Duas execuções em 12/09/2026 e `risk-summary.json`. | CORRECTED |

## Alteração de métrica

`npm test`: **204 PASS / 6 FAIL → 203 PASS / 7 FAIL**. O novo caso falho está em `test-whatsapp-batch-compat.mjs`. Nenhuma outra métrica canônica foi alterada.

Fonte machine-readable: `system-knowledge/contradictions.json`.
