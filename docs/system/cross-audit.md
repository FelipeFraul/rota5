> **Current Baseline 2.6.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). Paid TICKET/COMBO delivery work is durably persisted in the payment transaction; external delivery remains **AT_LEAST_ONCE**, never claimed exactly-once. Findings: 46 total, 14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED, 0 release blockers. Product and infrastructure health remain **DEGRADED**. Quality Gate 34984961888 passed 276/276 Node and 4/4 PostgreSQL 16 on the exact source. Baseline commit is `SELF_NOT_RECORDED`; no deployment or database mutation occurs in this documentary freeze.


# Cross-audit e validação de completude — Etapa 7

> **HISTORICAL SNAPSHOT:** sections describing failing local gates or unresolved P0 findings are the preserved Etapa 7 observation. The historical snapshot below is superseded by the current Baseline 2.6.0 banner and canonical machine-readable catalogs.

**Resultado: PASS.** A BASELINE V1 representa o Rota5 observado com confiança alta, desde que seus limites UNKNOWN/NOT_VALIDATED sejam respeitados. O PASS é da integridade da baseline; o produto continua com gates locais falhos e dois flows quebrados.

## Escopo congelado

- Branch `production`; HEAD e `origin/production`: `a141c6004421fb8442f95493de3ca4ec4d4c997b`.
- Alteração funcional preexistente: `src/lib/tickets/messages.ts`, SHA-256 `c567c2bca0a3494d96ef6242e59139832a4cf648b3a85f02f84ba9f06c937694`.
- Drift funcional criado pelas auditorias: **nenhum**.
- Antes da Etapa 7: 39 documentos + 31 JSONs = 70 artefatos. Depois: 44 + 36 = 80.

## Resultado estrutural

- 36/36 JSONs parseiam; zero IDs duplicados relevantes e zero referências quebradas.
- 17 domains, 66 modules, 56 entrypoints, 140 capabilities, 34 flows, 169 steps e 68 transitions foram revalidados.
- 44 tabelas, 79 migrations, 39 funções SQL, 36 triggers e 2.223 relações foram recontadas.
- 6 integrações, 2 webhooks, 2 crons, 43 env vars, 51 testes e 44 findings permanecem catalogados.
- Cobertura sem classificação: zero; capability funcional sem classificação: zero; entrypoint funcional sem classificação: zero; flow sem status: zero.

## Testes e runtime

`npm test` foi reproduzido com 210 casos, 203 PASS e 7 FAIL em 6 arquivos. `npm run typecheck` mantém 5 diagnósticos com raiz no JSX de `CreateEventModal.tsx:19`. Após remover os geradores temporários, `npm run lint` foi reexecutado e retornou somente os 25 problemas do produto: 1 erro de parse e 24 warnings.

Os 15 checks de runtime permanecem em 12 PASS, 2 PARTIAL e 1 FAIL. Foram usados somente healthchecks, metadados, schema e configuração read-only; nenhum endpoint mutável foi chamado.

## Findings, P0 e busca adversarial

Este trecho preserva o snapshot histórico da Etapa 8. Na auditoria original, os 44 findings foram revalidados sem remoção ou adição, e todos os 10 HIGH possuíam evidência concreta. A auditoria semântica 1.4.1 reclassificou somente `risk.latest-rota5-deployment-error` de ACTIVE para RESOLVED após nova evidência remota.

Os três P0 permanecem:

- `bug.create-event-invalid-jsx`: não foi possível rebaixar porque bloqueia typecheck/lint e o workspace administrativo principal.
- `bug.combo-redemption-unreachable-consume`: o caminho válido ainda retorna antes da RPC de consumo, impedindo o terminal esperado.
- `risk.vercel-project-identity-drift`: historicamente, o domínio declarado pertencia a `site`, o checkout estava ligado a `rota5` e o deployment observado de `rota5` aparecia em ERROR. A identidade e o deployment atual foram revalidados em baselines posteriores.

## Segunda passagem independente

Uma reconstrução sem consultar `docs/system` ou `system-knowledge` recontou App Router, scripts NPM/operacionais, migrations, providers, env vars e superfícies de runtime. A comparação não encontrou nova área central, entrypoint, capability, integração ou finding ausente. The documented active-brand surfaces are RESOLVED after scoped Preview and Production proof; historical strings outside that scope remain historical evidence.

## Integridade

Foram corrigidas duas contradições documentais: gate duplicado da Etapa 5 no README e snapshot desatualizado da suíte padrão. No snapshot histórico havia dez grupos de evidência remota NOT_VALIDATED; a projeção corrente em `unresolved-evidence.md` mantém nove após a resolução da condição de deployment ERROR. A varredura final não encontrou BOM, U+FFFD, corrupção dos próprios artefatos nem valores de segredo. Nenhuma mudança funcional ou remota foi realizada.

## Reauditoria de estabilização P0.3

O finding `risk.vercel-project-identity-drift` foi resolvido. A evidência da Etapa 7 permanece histórica; a cadeia atual é `FelipeFraul/rota5` `production` → Vercel `rota5`. Nenhum deployment foi realizado e o HEAD atual não está publicado.

## Baseline 2.2.0 — test runner reproducibility

The ignored loader dependency was reproduced as `ERR_MODULE_NOT_FOUND` in a clean worktree. Source `3e2bdc2979301301b3f1566a2ac75a477ee4c169` tracks the byte-identical loader at `scripts/test-support/typescript-alias-loader.mjs`. Canonical Git materialization passed `npm ci` and ran 207/214 with the same seven known failures. A CRLF worktree exposed two additional source-text assertion failures, recorded as evidence for the existing `gap.source-contract-assertion-bias`; no lifecycle besides the runner finding changed.
