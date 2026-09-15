> **Current Baseline 2.7.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

# Contradições da baseline — Etapa 7

Foram encontradas **2 contradições materiais**, ambas corrigidas e registradas sem ocultar a métrica anterior. Não há contradição material pendente.

| ID | Antes | Depois | Evidência | Estado |
| --- | --- | --- | --- | --- |
| `contradiction.readme-stage5-gate` | README continha gates concorrentes PARTIAL e PASS para a Etapa 5 e índice desatualizado. | Mantido o gate final PASS e índice atualizado até a Etapa 7. | Gate final da Etapa 5 e artefatos da Etapa 6. | CORRECTED |
| `contradiction.default-suite-current-result` | Snapshot histórico então corrente dizia 204/210, 6 falhas, 5 arquivos. | A correção histórica registrou 203/210, 7 falhas, 6 arquivos; ambos os valores são históricos, e a suíte corrente está no banner canônico. | Duas execuções em 12/09/2026 e `risk-summary.json`. | CORRECTED |

## Alteração de métrica

`npm test`: **204 PASS / 6 FAIL → 203 PASS / 7 FAIL**. O novo caso falho está em `test-whatsapp-batch-compat.mjs`. Nenhuma outra métrica canônica foi alterada.

Fonte machine-readable: `system-knowledge/contradictions.json`.
