> **Current Baseline 2.4.4 (2026-09-14):** `PATCH_DOCUMENTARY_CORRECTION` on canonical source `67845326088eac47452224b00ef1e866036e86f1` (fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0`, 368 files, 79 migrations). Findings `bug.event-duplicate-artist-leak` and `bug.user-visible-text-corruption` are **RESOLVED** as stale. `gap.partial-flows-lack-end-to-end-proof` remains **ACTIVE**, decomposed from P1 to P2; no specific P1 was justified. Canonical release blockers: **0**. Metrics: ACTIVE HIGH 0, POTENTIAL HIGH 1, OPEN HIGH 1, RESOLVED 11. PRODUCT_HEALTH: **DEGRADED**; INFRASTRUCTURE_HEALTH: **DEGRADED**. Quality evidence remains 236/236, PostgreSQL 1/1 and Quality Gate 34867214724 PASS. Production remains `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` on `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; no deployment, Supabase change or Ticketeira access.

# Cross-audit e validação de completude — Etapa 7

> **HISTORICAL SNAPSHOT:** sections describing failing local gates or unresolved P0 findings are the preserved Etapa 7 observation. The current Baseline 2.4.4 state is the banner above and the canonical machine-readable catalogs.

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
