> **Current Baseline 2.6.1 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over functional Baseline 2.6.0 and unchanged canonical source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). This patch corrects impossible future CURRENT timestamps and stale findings methodology metadata only. Findings remain 46 total (14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED), with 0 release blockers; product and infrastructure health remain **DEGRADED**. Node remains 276/276 and PostgreSQL 4/4. Baseline commit is `SELF_NOT_RECORDED`; no functional, database, deployment or lifecycle change occurred.

# Contradições da baseline — Etapa 7

Foram encontradas **2 contradições materiais**, ambas corrigidas e registradas sem ocultar a métrica anterior. Não há contradição material pendente.

| ID | Antes | Depois | Evidência | Estado |
| --- | --- | --- | --- | --- |
| `contradiction.readme-stage5-gate` | README continha gates concorrentes PARTIAL e PASS para a Etapa 5 e índice desatualizado. | Mantido o gate final PASS e índice atualizado até a Etapa 7. | Gate final da Etapa 5 e artefatos da Etapa 6. | CORRECTED |
| `contradiction.default-suite-current-result` | Snapshot histórico então corrente dizia 204/210, 6 falhas, 5 arquivos. | A correção histórica registrou 203/210, 7 falhas, 6 arquivos; ambos os valores são históricos, e a suíte corrente está no banner canônico. | Duas execuções em 12/09/2026 e `risk-summary.json`. | CORRECTED |

## Alteração de métrica

`npm test`: **204 PASS / 6 FAIL → 203 PASS / 7 FAIL**. O novo caso falho está em `test-whatsapp-batch-compat.mjs`. Nenhuma outra métrica canônica foi alterada.

Fonte machine-readable: `system-knowledge/contradictions.json`.
