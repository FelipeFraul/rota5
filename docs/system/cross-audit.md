> **Current Baseline 2.4.0 (2026-09-14):** canonical HEAD `67845326088eac47452224b00ef1e866036e86f1`; source fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0` across 368 files and 79 migrations. **DEFAULT_NODE_SUITE 236/236 PASS**; **POSTGRES_INTEGRATION_SUITE 1/1 PASS** on PostgreSQL 16 with real `sync_official_table_map_reservation_status`; **QUALITY_GATE run 34867214724 PASS**. Coverage: 21/21 MUST, 0 MUST gaps, 2/2 high-risk flows, 0 high-risk flow gaps, 0 skip, 0 todo, 0 regressions. Finding `gap.critical-capability-and-flow-coverage` is **RESOLVED**. Metrics: ACTIVE HIGH 0, POTENTIAL HIGH 1, OPEN HIGH 1, RESOLVED 9. Product health remains BROKEN by the canonical release-blocker rule; infrastructure health remains DEGRADED. Production remains `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` on functional source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; current HEAD deployed: **NAO** (post-runtime changes are test/tooling/CI only).

# Cross-audit e validação de completude — Etapa 7

**Resultado: PASS.** A BASELINE V1 representa o Rota5 observado com confiança alta, desde que seus limites UNKNOWN/NOT_VALIDATED sejam respeitados. O PASS é da integridade da baseline; o produto continua com gates locais falhos e dois flows quebrados.

## Escopo congelado

- Branch `production`; HEAD e `origin/production`: `a141c6004421fb8442f95493de3ca4ec4d4c997b`.
- Alteração funcional preexistente: `src/lib/tickets/messages.ts`, SHA-256 `c567c2bca0a3494d96ef6242e59139832a4cf648b3a85f02f84ba9f06c937694`.
- Drift funcional criado pelas auditorias: **nenhum**.
- Antes da Etapa 7: 39 documentos + 31 JSONs = 70 artefatos. Depois: 44 + 36 = 80.

## Resultado estrutural

- 36/36 JSONs parseiam; zero IDs duplicados relevantes e zero referências quebradas.
- 17 domains, 66 modules, 56 entrypoints, 140 capabilities, 34 flows, 169 steps e 68 transitions foram revalidados.
- 44 tabelas, 77 migrations, 33 funções SQL, 33 triggers e 2.223 relações foram recontadas.
- 6 integrações, 2 webhooks, 2 crons, 43 env vars, 43 testes e 44 findings permanecem catalogados.
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
